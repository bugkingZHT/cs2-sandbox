package archive

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

	"github.com/bugkingzht/cs-demobox/pkg/session"
	"github.com/bugkingzht/cs-demobox/pkg/user"
	"gorm.io/gorm"
)

const (
	maxUploadBytes = 50 << 20 // 50MB
	shortIDLen     = 16
)

// Handlers holds dependencies for archive HTTP handlers.
type Handlers struct {
	Store   *Store
	Storage *FileStorage
}

// ItemsIndex handles GET (List) and POST (Create) for /api/archive/items exactly. Use with RequireAuth.
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

func genShortID() (string, error) {
	b := make([]byte, shortIDLen/2)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// List returns current user's archive items in tree order.
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	if u == nil {
		log.Printf("[Archive] List: not logged in")
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	order, err := h.Store.GetOrder(u.ID)
	if err != nil {
		log.Printf("[Archive] List: GetOrder failed for user_id=%d: %v", u.ID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	itemsByID := make(map[string]*ArchiveItem)
	list, err := h.Store.ListItemsByOwner(u.ID)
	if err != nil {
		log.Printf("[Archive] List: ListItemsByOwner failed for user_id=%d: %v", u.ID, err)
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
	log.Printf("[Archive] List: uid=%s count=%d", u.UID, len(ordered))
	writeJSONOK(w, map[string]interface{}{"items": ordered, "order": order})
}

func itemToMap(it *ArchiveItem) map[string]interface{} {
	return map[string]interface{}{
		"id":         it.ID,
		"title":      it.Title,
		"permission": it.Permission,
		"demo_uuid":  it.DemoUUID,
		"demo_round": it.DemoRound,
		"demo_meta":  it.DemoMeta,
		"file_size":  it.FileSize,
		"created_at": it.CreatedAt,
	}
}

// Create handles POST multipart: file, title, demo_uuid, demo_round, permission, meta.
func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	if u == nil {
		log.Printf("[Archive] Create: not logged in")
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	if !h.Storage.IsConfigured() {
		log.Printf("[Archive] Create: storage not configured")
		writeJSONErr(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		log.Printf("[Archive] Create: ParseMultipartForm failed: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "request too large or invalid multipart")
		return
	}
	title := strings.TrimSpace(r.FormValue("title"))
	demoUUID := strings.TrimSpace(r.FormValue("demo_uuid"))
	demoRoundStr := r.FormValue("demo_round")
	permission := strings.TrimSpace(r.FormValue("permission"))
	meta := r.FormValue("meta")
	if title == "" || demoUUID == "" || demoRoundStr == "" {
		writeJSONErr(w, http.StatusBadRequest, "title, demo_uuid, demo_round required")
		return
	}
	demoRound, err := strconv.Atoi(demoRoundStr)
	if err != nil || demoRound < 1 {
		writeJSONErr(w, http.StatusBadRequest, "demo_round must be positive integer")
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
		log.Printf("[Archive] Create: FormFile failed: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()
	archiveID, err := genShortID()
	if err != nil {
		log.Printf("[Archive] Create: genShortID failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	log.Printf("[Archive] Create: uid=%s demo_uuid=%s demo_round=%d file_size=%d", u.UID, demoUUID, demoRound, header.Size)
	filePath := "USER_" + u.UID + "/archive-" + archiveID + "/round_" + demoRoundStr + ".pb"
	item := &ArchiveItem{
		ID:         archiveID,
		OwnerID:    u.ID,
		Title:      title,
		Permission: permission,
		DemoUUID:   demoUUID,
		DemoRound:  demoRound,
		DemoMeta:   meta,
		FilePath:   filePath,
		FileSize:   header.Size,
	}
	if err := h.Storage.SaveFile(u.UID, archiveID, demoRound, file); err != nil {
		log.Printf("[Archive] Create: SaveFile failed uid=%s archive_id=%s round=%d: %v", u.UID, archiveID, demoRound, err)
		writeJSONErr(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	if err := h.Store.CreateItem(item); err != nil {
		log.Printf("[Archive] Create: CreateItem failed archive_id=%s: %v", archiveID, err)
		_ = h.Storage.DeleteFile(u.UID, archiveID, demoRound)
		writeJSONErr(w, http.StatusInternalServerError, "failed to create record")
		return
	}
	if err := h.Store.AppendToOrder(u.ID, archiveID); err != nil {
		log.Printf("[Archive] Create: AppendToOrder failed (non-fatal) uid=%s archive_id=%s: %v", u.UID, archiveID, err)
	}
	log.Printf("[Archive] Create: ok id=%s uid=%s demo_uuid=%s demo_round=%d", archiveID, u.UID, demoUUID, demoRound)
	writeJSONOK(w, itemToMap(item))
}

// ItemByID handles GET/PATCH/DELETE /api/archive/items/:id and GET .../items/:id/file. GET file 允许未登录查看 public；其余操作需登录。
func (h *Handlers) ItemByID(w http.ResponseWriter, r *http.Request) {
	u := session.UserFromContext(r.Context())
	path := r.URL.Path
	prefix := "/api/archive/items/"
	if !strings.HasPrefix(path, prefix) {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	suffix := strings.TrimPrefix(path, prefix)
	if suffix == "" {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	var archiveID string
	var wantFile bool
	if strings.HasSuffix(suffix, "/file") {
		archiveID = strings.TrimSuffix(suffix, "/file")
		archiveID = strings.TrimSuffix(archiveID, "/")
		wantFile = true
	} else {
		archiveID = suffix
	}
	log.Printf("[Archive] ItemByID: method=%s id=%s want_file=%v", r.Method, archiveID, wantFile)
	item, err := h.Store.GetItemByID(archiveID)
	if err != nil || item == nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("[Archive] ItemByID: not found id=%s", archiveID)
			writeJSONErr(w, http.StatusNotFound, "not found")
			return
		}
		log.Printf("[Archive] ItemByID: GetItemByID failed id=%s: %v", archiveID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if wantFile {
		// public 允许未登录；private 仅 owner
		if !canViewArchiveItem(u, item) {
			log.Printf("[Archive] ItemByID: no permission to get file id=%s (private, not owner)", archiveID)
			writeJSONErr(w, http.StatusForbidden, "no permission")
			return
		}
		h.serveFile(w, r, u, item)
		return
	}
	switch r.Method {
	case http.MethodGet:
		// GET item meta: use canViewArchiveItem (public 允许未登录)，与 wantFile 一致
		if !canViewArchiveItem(u, item) {
			log.Printf("[Archive] ItemByID: GET no permission id=%s", archiveID)
			writeJSON(w, http.StatusForbidden, map[string]interface{}{
				"status":     "ERROR",
				"error":      "no permission",
				"archive_id": item.ID,
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
			Permission *string `json:"permission"`
			DemoMeta   *string `json:"demo_meta"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			log.Printf("[Archive] ItemByID: PATCH invalid JSON id=%s: %v", archiveID, err)
			writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		updates := make(map[string]interface{})
		if body.Title != nil {
			updates["title"] = strings.TrimSpace(*body.Title)
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
		if err := h.Store.UpdateItem(archiveID, u.ID, updates); err != nil {
			log.Printf("[Archive] ItemByID: PATCH UpdateItem failed id=%s: %v", archiveID, err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		item, _ = h.Store.GetItemByID(archiveID)
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
		if err := h.Store.DeleteItem(archiveID, u.ID); err != nil {
			log.Printf("[Archive] ItemByID: DELETE DeleteItem failed id=%s: %v", archiveID, err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		_ = h.Store.RemoveFromOrder(u.ID, archiveID)
		delErr := h.Storage.DeleteFile(u.UID, archiveID, item.DemoRound)
		if delErr != nil && item.FilePath != "" {
			delErr = h.Storage.DeleteFileByRelativePath(item.FilePath)
		}
		if delErr != nil {
			log.Printf("[Archive] ItemByID: DELETE DeleteFile failed id=%s round=%d: %v", archiveID, item.DemoRound, delErr)
		}
		log.Printf("[Archive] ItemByID: DELETE ok id=%s uid=%s", archiveID, u.UID)
		writeJSONOK(w, nil)
	default:
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// canViewArchiveItem 校验当前用户是否有权限查看该云存档。未登录用户仅可查看 public；private 仅 owner 可查看，public 任意人（含未登录）可查看。
func canViewArchiveItem(u *user.User, item *ArchiveItem) bool {
	if item.Permission == PermissionPublic {
		return true // public 允许未登录或任意登录用户
	}
	// private 仅登录且为 owner
	if u == nil {
		return false
	}
	return item.OwnerID == u.ID
}

func (h *Handlers) serveFile(w http.ResponseWriter, r *http.Request, u *user.User, item *ArchiveItem) {
	// 先校验权限，再进行读文件或返回数据
	if !canViewArchiveItem(u, item) {
		writeJSONErr(w, http.StatusForbidden, "no permission")
		return
	}
	// FilePath is "USER_{uid}/archive-{archiveID}/round_{round}.pb"
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
			log.Printf("[Archive] serveFile: GetFile failed id=%s owner_uid=%s round=%d: %v", item.ID, ownerUID, item.DemoRound, err)
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

// GetItemByDemo handles GET /api/archive/item?demo_uuid=xxx&demo_round=N. Returns the archive item if found and current user has permission; 404 if not found; 403 with archive_id if no permission (so client can clear local cache).
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
	if err != nil || demoRound < 1 {
		writeJSONErr(w, http.StatusBadRequest, "demo_round must be positive integer")
		return
	}
	u := session.UserFromContext(r.Context())
	log.Printf("[Archive] GetItemByDemo: demo_uuid=%s demo_round=%d", demoUUID, demoRound)
	item, err := h.Store.GetItemByDemo(demoUUID, demoRound)
	if err != nil {
		log.Printf("[Archive] GetItemByDemo: GetItemByDemo failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if item == nil {
		log.Printf("[Archive] GetItemByDemo: not found demo_uuid=%s demo_round=%d", demoUUID, demoRound)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	if !canViewArchiveItem(u, item) {
		log.Printf("[Archive] GetItemByDemo: no permission id=%s demo_uuid=%s", item.ID, demoUUID)
		writeJSON(w, http.StatusForbidden, map[string]interface{}{"status": "ERROR", "error": "no permission", "archive_id": item.ID})
		return
	}
	log.Printf("[Archive] GetItemByDemo: ok id=%s", item.ID)
	writeJSONOK(w, itemToMap(item))
}

// GetFileByDemo handles GET /api/archive/file?demo_uuid=xxx&demo_round=N. Looks up any archive by uuid+round, then checks permission: public 允许未登录查看，private 仅 owner.
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
	if err != nil || demoRound < 1 {
		writeJSONErr(w, http.StatusBadRequest, "demo_round must be positive integer")
		return
	}
	log.Printf("[Archive] GetFileByDemo: demo_uuid=%s demo_round=%d", demoUUID, demoRound)
	item, err := h.Store.GetItemByDemo(demoUUID, demoRound)
	if err != nil {
		log.Printf("[Archive] GetFileByDemo: GetItemByDemo failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if item == nil {
		log.Printf("[Archive] GetFileByDemo: not found demo_uuid=%s demo_round=%d", demoUUID, demoRound)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	// 先校验是否有权限，再允许查看（流式返回文件）
	if !canViewArchiveItem(u, item) {
		log.Printf("[Archive] GetFileByDemo: no permission (private) id=%s demo_uuid=%s", item.ID, demoUUID)
		writeJSONErr(w, http.StatusForbidden, "no permission")
		return
	}
	log.Printf("[Archive] GetFileByDemo: serving id=%s size=%d", item.ID, item.FileSize)
	h.serveFile(w, r, u, item)
}

// PutTree handles PUT /api/archive/tree with body {"order": ["id1","id2",...]}.
func (h *Handlers) PutTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	if u == nil {
		log.Printf("[Archive] PutTree: not logged in")
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var body struct {
		Order []string `json:"order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		log.Printf("[Archive] PutTree: invalid JSON: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.Store.SetOrder(u.ID, body.Order); err != nil {
		log.Printf("[Archive] PutTree: SetOrder failed uid=%s: %v", u.UID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	log.Printf("[Archive] PutTree: ok uid=%s order_len=%d", u.UID, len(body.Order))
	writeJSONOK(w, map[string]interface{}{"order": body.Order})
}
