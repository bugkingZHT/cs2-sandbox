package note

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/bugkingzht/cs-demobox/pkg/role"
	"github.com/bugkingzht/cs-demobox/pkg/session"
	"github.com/bugkingzht/cs-demobox/pkg/user"
	"gorm.io/gorm"
)

const (
	maxUploadBytes = 50 << 20 // 50MB
	shortIDLen     = 16
)

// Handlers holds dependencies for note HTTP handlers.
type Handlers struct {
	Store     *Store
	Storage   *FileStorage
	RoleStore *role.Store
}

// ItemsIndex handles GET (List) and POST (Create) for /api/note/items exactly. Use with RequireAuth.
func (h *Handlers) ItemsIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		h.List(w, r)
		return
	}
	if r.Method == http.MethodPost {
		h.Create(w, r)
		return
	}
	writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
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
	writeJSON(w, code, map[string]interface{}{"status": "ERROR", "error": msg})
}

// writeJSONQuotaExceeded returns 403 with error and quota for frontend modal.
func writeJSONQuotaExceeded(w http.ResponseWriter, quota int) {
	writeJSON(w, http.StatusForbidden, map[string]interface{}{
		"status": "ERROR",
		"error":  "note_quota_exceeded",
		"code":   "QUOTA_EXCEEDED",
		"quota":  quota,
	})
}

func genShortID() (string, error) {
	b := make([]byte, shortIDLen/2)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// List returns current user's note items in tree order.
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	if u == nil {
		log.Printf("[Note] List: not logged in")
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	order, err := h.Store.GetOrder(u.ID)
	if err != nil {
		log.Printf("[Note] List: GetOrder failed for user_id=%d: %v", u.ID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	itemsByID := make(map[string]*NoteItem)
	list, err := h.Store.ListItemsByOwner(u.ID)
	if err != nil {
		log.Printf("[Note] List: ListItemsByOwner failed for user_id=%d: %v", u.ID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	for _, it := range list {
		itemsByID[it.ID] = it
	}
	// Build response in tree order
	var ordered []map[string]interface{}
	for _, id := range order {
		if it, ok := itemsByID[id]; ok {
			ordered = append(ordered, itemToMap(it))
		}
	}
	log.Printf("[Note] List: uid=%s count=%d", u.UID, len(ordered))
	writeJSONOK(w, map[string]interface{}{"items": ordered, "order": order})
}

func itemToMap(it *NoteItem) map[string]interface{} {
	return map[string]interface{}{
		"id":         it.ID,
		"note_id":    it.ID,
		"title":      it.Title,
		"content":    it.Content,
		"permission": it.Permission,
		"demo_uuid":  it.DemoUUID,
		"demo_round": it.DemoRound,
		"demo_meta":  it.DemoMeta,
		"file_size":  it.FileSize,
		"created_at": it.CreatedAt,
	}
}

// Create handles POST multipart: file, title, content, demo_uuid, demo_round, permission, meta.
func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	if u == nil {
		log.Printf("[Note] Create: not logged in")
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	if !h.Storage.IsConfigured() {
		log.Printf("[Note] Create: storage not configured")
		writeJSONErr(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}
	if h.RoleStore != nil {
		_, _, quotaLimit := h.RoleStore.GetEffectiveRole(u.ID)
		count, err := h.Store.CountByOwnerID(u.ID)
		if err != nil {
			log.Printf("[Note] Create: CountByOwnerID failed for user_id=%d: %v", u.ID, err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		if count >= int64(quotaLimit) {
			log.Printf("[Note] Create: quota exceeded uid=%s count=%d limit=%d", u.UID, count, quotaLimit)
			writeJSONQuotaExceeded(w, quotaLimit)
			return
		}
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		log.Printf("[Note] Create: ParseMultipartForm failed: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "request too large or invalid multipart")
		return
	}
	title := strings.TrimSpace(r.FormValue("title"))
	content := r.FormValue("content")
	demoUUID := strings.TrimSpace(r.FormValue("demo_uuid"))
	demoRoundStr := r.FormValue("demo_round")
	permission := strings.TrimSpace(r.FormValue("permission"))
	meta := r.FormValue("meta")
	if title == "" || demoUUID == "" || demoRoundStr == "" {
		writeJSONErr(w, http.StatusBadRequest, "title, demo_uuid, demo_round required")
		return
	}
	demoRound, err := strconv.Atoi(demoRoundStr)
	if err != nil || demoRound < 0 {
		writeJSONErr(w, http.StatusBadRequest, "demo_round must be non-negative integer")
		return
	}
	if permission == "" {
		permission = PermissionPrivate
	}
	if permission != PermissionPrivate && permission != PermissionPublic {
		permission = PermissionPrivate
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		log.Printf("[Note] Create: FormFile failed: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()
	noteID, err := genShortID()
	if err != nil {
		log.Printf("[Note] Create: genShortID failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	log.Printf("[Note] Create: uid=%s demo_uuid=%s demo_round=%d file_size=%d", u.UID, demoUUID, demoRound, header.Size)
	filePath := "USER_" + u.UID + "/note-" + noteID + "/round_" + demoRoundStr + ".pb"
	item := &NoteItem{
		ID:         noteID,
		OwnerID:    u.ID,
		Title:      title,
		Content:    content,
		Permission: permission,
		DemoUUID:   demoUUID,
		DemoRound:  demoRound,
		DemoMeta:   meta,
		FilePath:   filePath,
		FileSize:   header.Size,
	}
	if err := h.Storage.SaveFile(u.UID, noteID, demoRound, file); err != nil {
		log.Printf("[Note] Create: SaveFile failed uid=%s note_id=%s round=%d: %v", u.UID, noteID, demoRound, err)
		writeJSONErr(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	if err := h.Store.CreateItem(item); err != nil {
		log.Printf("[Note] Create: CreateItem failed note_id=%s: %v", noteID, err)
		_ = h.Storage.DeleteFile(u.UID, noteID, demoRound)
		writeJSONErr(w, http.StatusInternalServerError, "failed to create record")
		return
	}
	if err := h.Store.AppendToOrder(u.ID, noteID); err != nil {
		log.Printf("[Note] Create: AppendToOrder failed (non-fatal) uid=%s note_id=%s: %v", u.UID, noteID, err)
	}
	log.Printf("[Note] Create: ok id=%s uid=%s demo_uuid=%s demo_round=%d", noteID, u.UID, demoUUID, demoRound)
	writeJSONOK(w, itemToMap(item))
}

// ItemByID handles GET/PATCH/DELETE /api/note/items/:id and GET .../items/:id/file. GET file 允许未登录查看 public；其余操作需登录。
func (h *Handlers) ItemByID(w http.ResponseWriter, r *http.Request) {
	u := session.UserFromContext(r.Context())
	path := r.URL.Path
	prefix := "/api/note/items/"
	if !strings.HasPrefix(path, prefix) {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	suffix := strings.TrimPrefix(path, prefix)
	if suffix == "" {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	var noteID string
	var wantFile bool
	if strings.HasSuffix(suffix, "/file") {
		noteID = strings.TrimSuffix(suffix, "/file")
		noteID = strings.TrimSuffix(noteID, "/")
		wantFile = true
	} else {
		noteID = suffix
	}
	log.Printf("[Note] ItemByID: method=%s id=%s want_file=%v", r.Method, noteID, wantFile)
	item, err := h.Store.GetItemByID(noteID)
	if err != nil || item == nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("[Note] ItemByID: not found id=%s", noteID)
			writeJSONErr(w, http.StatusNotFound, "not found")
			return
		}
		log.Printf("[Note] ItemByID: GetItemByID failed id=%s: %v", noteID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if wantFile {
		// public 允许未登录；private 仅 owner
		if !canViewNoteItem(u, item) {
			log.Printf("[Note] ItemByID: no permission to get file id=%s (private, not owner)", noteID)
			writeJSONErr(w, http.StatusForbidden, "no permission")
			return
		}
		h.serveFile(w, r, u, item)
		return
	}
	switch r.Method {
	case http.MethodGet:
		// GET item meta: use canViewNoteItem (public 允许未登录)，与 wantFile 一致
		if !canViewNoteItem(u, item) {
			log.Printf("[Note] ItemByID: GET no permission id=%s", noteID)
			writeJSON(w, http.StatusForbidden, map[string]interface{}{
				"status":     "ERROR",
				"error":      "no permission",
				"note_id":    item.ID,
				"demo_uuid":  item.DemoUUID,
				"demo_round": item.DemoRound,
			})
			return
		}
		writeJSONOK(w, itemToMap(item))
	case http.MethodPatch:
		if u == nil {
			writeJSONErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		if item.OwnerID != u.ID {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
		var body struct {
			Title      *string `json:"title"`
			Content    *string `json:"content"`
			Permission *string `json:"permission"`
			DemoMeta   *string `json:"demo_meta"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			log.Printf("[Note] ItemByID: PATCH invalid JSON id=%s: %v", noteID, err)
			writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		updates := make(map[string]interface{})
		if body.Title != nil {
			updates["title"] = strings.TrimSpace(*body.Title)
		}
		if body.Content != nil {
			updates["content"] = *body.Content
		}
		if body.Permission != nil {
			p := strings.TrimSpace(*body.Permission)
			if p == PermissionPublic || p == PermissionPrivate {
				updates["permission"] = p
			}
		}
		if body.DemoMeta != nil {
			updates["demo_meta"] = *body.DemoMeta
		}
		if len(updates) == 0 {
			writeJSONOK(w, itemToMap(item))
			return
		}
		if err := h.Store.UpdateItem(noteID, u.ID, updates); err != nil {
			log.Printf("[Note] ItemByID: PATCH UpdateItem failed id=%s: %v", noteID, err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		item, _ = h.Store.GetItemByID(noteID)
		writeJSONOK(w, itemToMap(item))
	case http.MethodDelete:
		if u == nil {
			writeJSONErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		if item.OwnerID != u.ID {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
		if err := h.Store.DeleteItem(noteID, u.ID); err != nil {
			log.Printf("[Note] ItemByID: DELETE DeleteItem failed id=%s: %v", noteID, err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		_ = h.Store.RemoveFromOrder(u.ID, noteID)
		delErr := h.Storage.DeleteFile(u.UID, noteID, item.DemoRound)
		if delErr != nil && item.FilePath != "" {
			delErr = h.Storage.DeleteFileByRelativePath(item.FilePath)
		}
		if delErr != nil {
			log.Printf("[Note] ItemByID: DELETE DeleteFile failed id=%s round=%d: %v", noteID, item.DemoRound, delErr)
		}
		log.Printf("[Note] ItemByID: DELETE ok id=%s uid=%s", noteID, u.UID)
		writeJSONOK(w, nil)
	default:
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// canViewNoteItem 校验当前用户是否有权限查看该云笔记。未登录用户仅可查看 public；private 仅 owner 可查看，public 任意人（含未登录）可查看。
func canViewNoteItem(u *user.User, item *NoteItem) bool {
	if item.Permission == PermissionPublic {
		return true // public 允许未登录或任意登录用户
	}
	// private 仅登录且为 owner
	if u == nil {
		return false
	}
	return item.OwnerID == u.ID
}

func (h *Handlers) serveFile(w http.ResponseWriter, r *http.Request, u *user.User, item *NoteItem) {
	// 先校验权限，再进行读文件或返回数据
	if !canViewNoteItem(u, item) {
		writeJSONErr(w, http.StatusForbidden, "no permission")
		return
	}
	// FilePath is "USER_{uid}/note-{noteID}/round_{round}.pb" or legacy "USER_{uid}/archive-{id}/..."
	var ownerUID string
	if strings.HasPrefix(item.FilePath, "USER_") {
		rest := strings.TrimPrefix(item.FilePath, "USER_")
		if idx := strings.Index(rest, "/"); idx > 0 {
			ownerUID = rest[:idx]
		}
	}
	rc, err := h.Storage.GetFile(ownerUID, item.ID, item.DemoRound)
	if err != nil {
		if item.FilePath != "" {
			rc, err = h.Storage.GetFileByRelativePath(item.FilePath)
		}
		if err != nil {
			log.Printf("[Note] serveFile: GetFile failed id=%s owner_uid=%s round=%d: %v", item.ID, ownerUID, item.DemoRound, err)
			writeJSONErr(w, http.StatusNotFound, "not found")
			return
		}
	}
	defer rc.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=round_"+strconv.Itoa(item.DemoRound)+".pb")
	if item.FileSize > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(item.FileSize, 10))
	}
	io.Copy(w, rc)
}

// GetItemByDemo handles GET /api/note/item?demo_uuid=xxx&demo_round=N. Returns the note item if found and current user has permission; 404 if not found; 403 with note_id if no permission (so client can clear local cache).
func (h *Handlers) GetItemByDemo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	demoUUID := strings.TrimSpace(r.URL.Query().Get("demo_uuid"))
	demoRoundStr := r.URL.Query().Get("demo_round")
	if demoUUID == "" || demoRoundStr == "" {
		writeJSONErr(w, http.StatusBadRequest, "demo_uuid and demo_round required")
		return
	}
	demoRound, err := strconv.Atoi(demoRoundStr)
	if err != nil || demoRound < 0 {
		writeJSONErr(w, http.StatusBadRequest, "demo_round must be non-negative integer")
		return
	}
	u := session.UserFromContext(r.Context())
	log.Printf("[Note] GetItemByDemo: demo_uuid=%s demo_round=%d", demoUUID, demoRound)
	item, err := h.Store.GetItemByDemo(demoUUID, demoRound)
	if err != nil {
		log.Printf("[Note] GetItemByDemo: GetItemByDemo failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if item == nil {
		log.Printf("[Note] GetItemByDemo: not found demo_uuid=%s demo_round=%d", demoUUID, demoRound)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	if !canViewNoteItem(u, item) {
		log.Printf("[Note] GetItemByDemo: no permission id=%s demo_uuid=%s", item.ID, demoUUID)
		writeJSON(w, http.StatusForbidden, map[string]interface{}{"status": "ERROR", "error": "no permission", "note_id": item.ID})
		return
	}
	log.Printf("[Note] GetItemByDemo: ok id=%s", item.ID)
	writeJSONOK(w, itemToMap(item))
}

// GetFileByDemo handles GET /api/note/file?demo_uuid=xxx&demo_round=N. Looks up any note by uuid+round, then checks permission: public 允许未登录查看，private 仅 owner.
func (h *Handlers) GetFileByDemo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	demoUUID := strings.TrimSpace(r.URL.Query().Get("demo_uuid"))
	demoRoundStr := r.URL.Query().Get("demo_round")
	if demoUUID == "" || demoRoundStr == "" {
		writeJSONErr(w, http.StatusBadRequest, "demo_uuid and demo_round required")
		return
	}
	demoRound, err := strconv.Atoi(demoRoundStr)
	if err != nil || demoRound < 0 {
		writeJSONErr(w, http.StatusBadRequest, "demo_round must be non-negative integer")
		return
	}
	log.Printf("[Note] GetFileByDemo: demo_uuid=%s demo_round=%d", demoUUID, demoRound)
	item, err := h.Store.GetItemByDemo(demoUUID, demoRound)
	if err != nil {
		log.Printf("[Note] GetFileByDemo: GetItemByDemo failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if item == nil {
		log.Printf("[Note] GetFileByDemo: not found demo_uuid=%s demo_round=%d", demoUUID, demoRound)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	// 先校验是否有权限，再允许查看（流式返回文件）
	if !canViewNoteItem(u, item) {
		log.Printf("[Note] GetFileByDemo: no permission (private) id=%s demo_uuid=%s", item.ID, demoUUID)
		writeJSONErr(w, http.StatusForbidden, "no permission")
		return
	}
	log.Printf("[Note] GetFileByDemo: serving id=%s size=%d", item.ID, item.FileSize)
	h.serveFile(w, r, u, item)
}

// PutTree handles PUT /api/note/tree with body {"order": ["id1","id2",...]}.
func (h *Handlers) PutTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	if u == nil {
		log.Printf("[Note] PutTree: not logged in")
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var body struct {
		Order []string `json:"order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		log.Printf("[Note] PutTree: invalid JSON: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.Store.SetOrder(u.ID, body.Order); err != nil {
		log.Printf("[Note] PutTree: SetOrder failed uid=%s: %v", u.UID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	log.Printf("[Note] PutTree: ok uid=%s order_len=%d", u.UID, len(body.Order))
	writeJSONOK(w, map[string]interface{}{"order": body.Order})
}
