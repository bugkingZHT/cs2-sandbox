package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/bugkingzht/cs-demobox/pkg/email"
	"github.com/bugkingzht/cs-demobox/pkg/role"
	"github.com/bugkingzht/cs-demobox/pkg/session"
	"github.com/bugkingzht/cs-demobox/pkg/user"
)

var emailRegexp = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

const (
	cookieName = "session_id"
	// sessionTTL = 10 * time.Second // 测试用 10 秒
	sessionTTL   = 7 * 24 * time.Hour
	sessionIDLen = 32
)

// Handlers holds dependencies for auth HTTP handlers.
type Handlers struct {
	User        *user.Store
	Session     *session.Store
	RoleStore   *role.Store
	EmailStore  *email.Store  // may be nil if DB not configured
	EmailSender *email.Sender // may be nil if SMTP not configured
}

// LoginRequest is the JSON body for POST /api/auth/login.
type LoginRequest struct {
	// Identity accepts username or email address.
	Identity string `json:"identity"`
	// Username kept for backwards compatibility (deprecated, use Identity).
	Username string `json:"username"`
	Password string `json:"password"`
}

// UserSummary is returned in login response.
type UserSummary struct {
	UID      string `json:"uid"`
	Username string `json:"username"`
}

// MeResponse is returned by GET /api/auth/me (includes role and quota).
type MeResponse struct {
	UID        string `json:"uid"`
	Username   string `json:"username"`
	Role       string `json:"role"` // normal, pro, pro+
	QuotaLimit int    `json:"quota_limit"`
	QuotaUsed  int    `json:"quota_used"`
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeJSONOK(w http.ResponseWriter, data interface{}) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "OK", "data": data})
}

func writeJSONErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]interface{}{"status": "error", "error": msg})
}

// Login handles POST /api/auth/login.
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[Auth] Login: invalid JSON: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	// Support both identity (new) and username (legacy) fields.
	identity := strings.TrimSpace(req.Identity)
	if identity == "" {
		identity = strings.TrimSpace(req.Username)
	}
	if identity == "" || req.Password == "" {
		writeJSONErr(w, http.StatusBadRequest, "identity and password required")
		return
	}
	log.Printf("[Auth] Login: attempt identity=%s", identity)
	u, err := h.User.GetByUsernameOrEmail(identity)
	if err != nil {
		log.Printf("[Auth] Login: user not found identity=%s", identity)
		writeJSONErr(w, http.StatusUnauthorized, "账号或密码错误")
		return
	}
	if u.Status != user.StatusActive {
		log.Printf("[Auth] Login: account disabled uid=%s", u.UID)
		writeJSONErr(w, http.StatusUnauthorized, "account disabled")
		return
	}
	if !ComparePassword(u.PasswordHash, req.Password) {
		log.Printf("[Auth] Login: password mismatch identity=%s", identity)
		writeJSONErr(w, http.StatusUnauthorized, "账号或密码错误")
		return
	}
	sessionID, err := newSessionID()
	if err != nil {
		log.Printf("[Auth] Login: newSessionID failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	expiresAt := time.Now().Add(sessionTTL)
	if err := h.Session.Create(sessionID, u.ID, expiresAt); err != nil {
		log.Printf("[Auth] Login: Session.Create failed uid=%s: %v", u.UID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := h.User.UpdateLastLoginAt(u.ID); err != nil {
		// non-fatal, continue
	}
	setSessionCookie(w, sessionID, expiresAt)
	log.Printf("[Auth] Login: ok uid=%s username=%s", u.UID, u.Username)
	writeJSONOK(w, UserSummary{UID: u.UID, Username: u.Username})
}

// Logout handles POST /api/auth/logout.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if c, _ := r.Cookie(cookieName); c != nil && c.Value != "" {
		_ = h.Session.DeleteBySessionID(c.Value)
		log.Printf("[Auth] Logout: session cleared")
	}
	clearSessionCookie(w)
	writeJSONOK(w, nil)
}

// Me handles GET /api/auth/me (must be wrapped with session.RequireAuth).
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	u := session.UserFromContext(r.Context())
	if u == nil {
		log.Printf("[Auth] Me: not logged in")
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}

	// Update the last login time for the authenticated user
	if err := h.User.UpdateLastLoginAt(u.ID); err != nil {
		// non-fatal, continue
		log.Printf("[Auth] Me: UpdateLastLoginAt failed uid=%s: %v", u.UID, err)
	}

	resp := MeResponse{UID: u.UID, Username: u.Username, Role: role.RoleNormal, QuotaLimit: role.DefaultRoleQuotaLimit[role.RoleNormal], QuotaUsed: 0}
	if h.RoleStore != nil {
		resp.Role, _, resp.QuotaLimit = h.RoleStore.GetEffectiveRole(u.UID)
	}

	writeJSONOK(w, resp)
}

// ChangePasswordRequest is the JSON body for POST /api/auth/change-password.
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// ChangePassword handles POST /api/auth/change-password (must be wrapped with session.RequireAuth).
func (h *Handlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	if u == nil {
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[Auth] ChangePassword: invalid JSON uid=%s: %v", u.UID, err)
		writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.OldPassword == "" || req.NewPassword == "" {
		writeJSONErr(w, http.StatusBadRequest, "old_password and new_password required")
		return
	}
	if !ComparePassword(u.PasswordHash, req.OldPassword) {
		log.Printf("[Auth] ChangePassword: old password wrong uid=%s", u.UID)
		writeJSONErr(w, http.StatusBadRequest, "旧密码错误")
		return
	}
	newHash, err := HashPassword(req.NewPassword)
	if err != nil {
		log.Printf("[Auth] ChangePassword: HashPassword failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := h.User.UpdatePassword(u.ID, newHash); err != nil {
		log.Printf("[Auth] ChangePassword: UpdatePassword failed uid=%s: %v", u.UID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	// 密码修改后清理该用户所有 session，强制所有端重新登录
	_ = h.Session.DeleteByUserID(u.ID)
	clearSessionCookie(w)
	log.Printf("[Auth] ChangePassword: ok uid=%s", u.UID)
	writeJSONOK(w, nil)
}

func newSessionID() (string, error) {
	b := make([]byte, sessionIDLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func setSessionCookie(w http.ResponseWriter, sessionID string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    sessionID,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

// ======================================================================
// Registration & email verification
// ======================================================================

// SendCodeRequest is the JSON body for POST /api/auth/send-code.
type SendCodeRequest struct {
	Email   string `json:"email"`
	Purpose string `json:"purpose"` // "register" | "reset_password"
}

// SendCode handles POST /api/auth/send-code.
// If SMTP is not configured, the code is printed to the server log only (dev mode).
func (h *Handlers) SendCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if h.EmailStore == nil {
		writeJSONErr(w, http.StatusServiceUnavailable, "邮件服务不可用")
		return
	}
	var req SendCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if !emailRegexp.MatchString(req.Email) {
		writeJSONErr(w, http.StatusBadRequest, "邮箱格式不正确")
		return
	}
	purpose := req.Purpose
	if purpose == "" {
		purpose = "register"
	}
	if purpose == "register" {
		exists, err := h.User.EmailExists(req.Email)
		if err == nil && exists {
			writeJSONErr(w, http.StatusConflict, "该邮箱已注册")
			return
		}
	}
	v, err := h.EmailStore.CreateCode(req.Email, purpose)
	if err != nil {
		writeJSONErr(w, http.StatusTooManyRequests, err.Error())
		return
	}
	if h.EmailSender != nil {
		if err := h.EmailSender.SendVerificationCode(req.Email, v.Code, purpose); err != nil {
			log.Printf("[Auth] SendCode: SMTP error email=%s: %v", req.Email, err)
			writeJSONErr(w, http.StatusInternalServerError, "邮件发送失败，请稍后重试")
			return
		}
		log.Printf("[Auth] SendCode: sent to %s purpose=%s", req.Email, purpose)
	} else {
		// SMTP not configured: print code to log for local development.
		log.Printf("[Auth] SendCode [DEV - no SMTP]: email=%s code=%s purpose=%s", req.Email, v.Code, purpose)
	}
	writeJSONOK(w, nil)
}

// RegisterRequest is the JSON body for POST /api/auth/register.
type RegisterRequest struct {
	Email    string `json:"email"`
	Code     string `json:"code"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// Register handles POST /api/auth/register.
func (h *Handlers) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if h.EmailStore == nil {
		writeJSONErr(w, http.StatusServiceUnavailable, "注册服务不可用")
		return
	}
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Username = strings.TrimSpace(req.Username)
	req.Code = strings.TrimSpace(req.Code)

	if !emailRegexp.MatchString(req.Email) {
		writeJSONErr(w, http.StatusBadRequest, "邮箱格式不正确")
		return
	}
	if req.Code == "" {
		writeJSONErr(w, http.StatusBadRequest, "验证码不能为空")
		return
	}
	if req.Username == "" || utf8.RuneCountInString(req.Username) < 2 || utf8.RuneCountInString(req.Username) > 32 {
		writeJSONErr(w, http.StatusBadRequest, "用户名长度需在 2-32 个字符之间")
		return
	}
	if len(req.Password) < 6 {
		writeJSONErr(w, http.StatusBadRequest, "密码至少 6 位")
		return
	}

	// Validate verification code.
	if err := h.EmailStore.VerifyCode(req.Email, req.Code, "register"); err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}

	// Check duplicates.
	if exists, _ := h.User.EmailExists(req.Email); exists {
		writeJSONErr(w, http.StatusConflict, "该邮箱已注册")
		return
	}
	if exists, _ := h.User.UsernameExists(req.Username); exists {
		writeJSONErr(w, http.StatusConflict, "用户名已被使用")
		return
	}

	hash, err := HashPassword(req.Password)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	u, err := h.User.Create(req.Username, req.Email, "", hash)
	if err != nil {
		log.Printf("[Auth] Register: Create failed email=%s: %v", req.Email, err)
		writeJSONErr(w, http.StatusInternalServerError, "注册失败，请重试")
		return
	}

	// Auto-login after registration.
	sessionID, err := newSessionID()
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	expiresAt := time.Now().Add(sessionTTL)
	if err := h.Session.Create(sessionID, u.ID, expiresAt); err != nil {
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	setSessionCookie(w, sessionID, expiresAt)
	log.Printf("[Auth] Register: ok uid=%s username=%s email=%s", u.UID, u.Username, u.Email)
	writeJSONOK(w, UserSummary{UID: u.UID, Username: u.Username})
}

// ======================================================================
// WeChat login placeholder (not yet implemented)
// ======================================================================

// WechatQRCode handles GET /api/auth/wechat/qrcode.
// Returns available=false until WeChat Open Platform integration is added.
func (h *Handlers) WechatQRCode(w http.ResponseWriter, r *http.Request) {
	writeJSONOK(w, map[string]interface{}{
		"available": false,
		"message":   "微信登录即将开放，敬请期待",
	})
}

// WechatPoll handles GET /api/auth/wechat/poll.
func (h *Handlers) WechatPoll(w http.ResponseWriter, r *http.Request) {
	writeJSONOK(w, map[string]interface{}{
		"available": false,
		"status":    "not_implemented",
	})
}
