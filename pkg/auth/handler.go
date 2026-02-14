package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/bugkingzht/cs-demobox/pkg/archive"
	"github.com/bugkingzht/cs-demobox/pkg/role"
	"github.com/bugkingzht/cs-demobox/pkg/session"
	"github.com/bugkingzht/cs-demobox/pkg/user"
)

const (
	cookieName = "session_id"
	// sessionTTL = 10 * time.Second // 测试用 10 秒
	sessionTTL   = 7 * 24 * time.Hour
	sessionIDLen = 32
)

// Handlers holds dependencies for auth HTTP handlers.
type Handlers struct {
	User         *user.Store
	Session      *session.Store
	RoleStore    *role.Store
	ArchiveStore *archive.Store
}

// LoginRequest is the JSON body for POST /api/auth/login.
type LoginRequest struct {
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
	if req.Username == "" || req.Password == "" {
		writeJSONErr(w, http.StatusBadRequest, "username and password required")
		return
	}
	log.Printf("[Auth] Login: attempt username=%s", req.Username)
	u, err := h.User.GetByUsername(req.Username)
	if err != nil {
		log.Printf("[Auth] Login: user not found username=%s", req.Username)
		writeJSONErr(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if u.Status != user.StatusActive {
		log.Printf("[Auth] Login: account disabled uid=%s", u.UID)
		writeJSONErr(w, http.StatusUnauthorized, "account disabled")
		return
	}
	if !ComparePassword(u.PasswordHash, req.Password) {
		log.Printf("[Auth] Login: password mismatch username=%s", req.Username)
		writeJSONErr(w, http.StatusUnauthorized, "invalid username or password")
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
	resp := MeResponse{UID: u.UID, Username: u.Username, Role: role.RoleNormal, QuotaLimit: role.RoleQuotaLimit[role.RoleNormal], QuotaUsed: 0}
	if h.RoleStore != nil {
		resp.Role, _, resp.QuotaLimit = h.RoleStore.GetEffectiveRole(u.ID)
	}
	if h.ArchiveStore != nil {
		count, err := h.ArchiveStore.CountByOwnerID(u.ID)
		if err == nil {
			resp.QuotaUsed = int(count)
		}
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
