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

// List returns current user's note items sorted by creation time (newest first).
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
	list, err := h.Store.ListItemsByOwner(u.ID)
	if err != nil {
		log.Printf("[Note] List: ListItemsByOwner failed for user_id=%d: %v", u.ID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	// Convert items to map format
	var items []map[string]interface{}
	for _, it := range list {
		items = append(items, itemToMap(h, it))
	}
	log.Printf("[Note] List: uid=%s count=%d", u.UID, len(items))
	writeJSONOK(w, map[string]interface{}{"items": items})
}

// itemToMap converts a NoteItem to API response format
// Includes demo data from associated DemoItems
func itemToMap(h *Handlers, it *NoteItem) map[string]interface{} {
	result := map[string]interface{}{
		"id":         it.ID,
		"note_id":    it.ID,
		"owner_id":   it.OwnerID,
		"title":      it.Title,
		"content":    it.Content,
		"permission": it.Permission,
		"created_at": it.CreatedAt,
	}

	// Get associated demo items
	if demoItems, err := h.Store.GetDemoItemsByNoteID(it.ID); err == nil && len(demoItems) > 0 {
		// Include all demo items (without file_path)
		var demos []map[string]interface{}
		for _, demo := range demoItems {
			// Parse demo meta to extract map info for the main item
			var meta map[string]interface{}
			if err := json.Unmarshal([]byte(demo.DemoMeta), &meta); err == nil {
				if mapName, ok := meta["mapName"].(string); ok {
					result["mapName"] = mapName
				}
				if teamCT, ok := meta["teamCT"].(string); ok {
					result["teamCT"] = teamCT
				}
				if teamT, ok := meta["teamT"].(string); ok {
					result["teamT"] = teamT
				}
			}

			demos = append(demos, map[string]interface{}{
				"id":         demo.ID,
				"demo_uuid":  demo.DemoUUID,
				"demo_round": demo.DemoRound,
				"demo_meta":  demo.DemoMeta,
				"file_size":  demo.FileSize,
				"created_at": demo.CreatedAt,
			})
		}
		result["demos"] = demos
	}
	return result
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
		_, _, quotaLimit := h.RoleStore.GetEffectiveRole(u.UID)
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
	parentID := strings.TrimSpace(r.FormValue("parent_id"))
	if permission == "" {
		permission = PermissionPrivate
	}
	if permission != PermissionPrivate && permission != PermissionPublic {
		permission = PermissionPrivate
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		// No file: allow note-only create when no demo_uuid
		if demoUUID == "" {
			if title == "" {
				writeJSONErr(w, http.StatusBadRequest, "title required")
				return
			}
			noteID, genErr := genShortID()
			if genErr != nil {
				log.Printf("[Note] Create: genShortID failed: %v", genErr)
				writeJSONErr(w, http.StatusInternalServerError, "internal error")
				return
			}
			noteItem := &NoteItem{
				ID:         noteID,
				OwnerID:    u.ID,
				Title:      title,
				Content:    content,
				Permission: permission,
			}
			if err := h.Store.CreateItem(noteItem); err != nil {
				log.Printf("[Note] Create: CreateItem failed note_id=%s: %v", noteID, err)
				writeJSONErr(w, http.StatusInternalServerError, "internal error")
				return
			}
			log.Printf("[Note] Create: note-only id=%s uid=%s", noteID, u.UID)
			writeJSONOK(w, itemToMap(h, noteItem))
			return
		}
		log.Printf("[Note] Create: FormFile failed: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()
	if demoUUID == "" || demoRoundStr == "" {
		writeJSONErr(w, http.StatusBadRequest, "demo_uuid, demo_round required")
		return
	}
	demoRound, err := strconv.Atoi(demoRoundStr)
	if err != nil || demoRound < 0 {
		writeJSONErr(w, http.StatusBadRequest, "demo_round must be non-negative integer")
		return
	}
	noteID, err := genShortID()
	if err != nil {
		log.Printf("[Note] Create: genShortID failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	log.Printf("[Note] Create: uid=%s demo_uuid=%s demo_round=%d file_size=%d", u.UID, demoUUID, demoRound, header.Size)

	// If parent_id is provided, only create DemoItem linked to existing note
	if parentID != "" {
		// Verify parent note exists and user has access
		parentNote, err := h.Store.GetItemByID(parentID)
		if err != nil || parentNote == nil {
			log.Printf("[Note] Create: parent note not found id=%s", parentID)
			writeJSONErr(w, http.StatusNotFound, "parent note not found")
			return
		}
		if parentNote.OwnerID != u.ID {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}

		// Create only the demo item linked to existing note
		demoItem := &DemoItem{
			NoteID:    parentID,
			UserID:    u.ID,
			DemoUUID:  demoUUID,
			DemoRound: demoRound,
			DemoMeta:  meta,
			FilePath:  h.Storage.RelativePath(u.UID, demoUUID, demoRound),
			FileSize:  header.Size,
		}
		if err := h.Store.CreateDemoItem(demoItem); err != nil {
			log.Printf("[Note] Create: CreateDemoItem failed note_id=%s: %v", parentID, err)
			writeJSONErr(w, http.StatusInternalServerError, "failed to create demo record")
			return
		}

		// Save the file
		if err := h.Storage.SaveFile(u.UID, demoUUID, demoRound, file); err != nil {
			log.Printf("[Note] Create: SaveFile failed uid=%s demo_uuid=%s round=%d: %v", u.UID, demoUUID, demoRound, err)
			// Clean up demo item
			_ = h.Store.DeleteDemoItem(demoItem.ID)
			writeJSONErr(w, http.StatusInternalServerError, "failed to save file")
			return
		}

		log.Printf("[Note] Create: archived to existing note id=%s demo_id=%d uid=%s demo_uuid=%s demo_round=%d", parentID, demoItem.ID, u.UID, demoUUID, demoRound)
		writeJSONOK(w, map[string]interface{}{
			"id":         demoItem.ID,
			"note_id":    parentID,
			"demo_uuid":  demoUUID,
			"demo_round": demoRound,
			"file_size":  header.Size,
			"created_at": demoItem.CreatedAt,
		})
		return
	}

	// Create the note item first (for new notes)
	noteItem := &NoteItem{
		ID:         noteID,
		OwnerID:    u.ID,
		Title:      title,
		Content:    content,
		Permission: permission,
	}
	if err := h.Store.CreateItem(noteItem); err != nil {
		log.Printf("[Note] Create: CreateItem failed note_id=%s: %v", noteID, err)
		writeJSONErr(w, http.StatusInternalServerError, "failed to create note record")
		return
	}

	// Create the demo item
	demoItem := &DemoItem{
		NoteID:    noteID,
		UserID:    u.ID,
		DemoUUID:  demoUUID,
		DemoRound: demoRound,
		DemoMeta:  meta,
		FilePath:  h.Storage.RelativePath(u.UID, demoUUID, demoRound),
		FileSize:  header.Size,
	}
	if err := h.Store.CreateDemoItem(demoItem); err != nil {
		log.Printf("[Note] Create: CreateDemoItem failed note_id=%s: %v", noteID, err)
		// Clean up the note item
		_ = h.Store.DeleteItem(noteID, u.ID)
		writeJSONErr(w, http.StatusInternalServerError, "failed to create demo record")
		return
	}

	// Save the file
	if err := h.Storage.SaveFile(u.UID, demoUUID, demoRound, file); err != nil {
		log.Printf("[Note] Create: SaveFile failed uid=%s demo_uuid=%s round=%d: %v", u.UID, demoUUID, demoRound, err)
		// Clean up both records
		_ = h.Store.DeleteItem(noteID, u.ID)
		_ = h.Store.DeleteDemoItem(demoItem.ID)
		writeJSONErr(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	log.Printf("[Note] Create: ok id=%s uid=%s demo_uuid=%s demo_round=%d", noteID, u.UID, demoUUID, demoRound)
	writeJSONOK(w, itemToMap(h, noteItem))
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
		// For now, return 404 for file requests - need to implement demo item lookup
		writeJSONErr(w, http.StatusNotFound, "file access not implemented in new structure")
		return
	}
	switch r.Method {
	case http.MethodGet:
		// GET item meta: use canViewNoteItem (public 允许未登录)，与 wantFile 一致
		if !canViewNoteItem(u, item) {
			log.Printf("[Note] ItemByID: GET no permission id=%s", noteID)
			writeJSON(w, http.StatusForbidden, map[string]interface{}{
				"status":  "ERROR",
				"error":   "no permission",
				"note_id": item.ID,
			})
			return
		}
		writeJSONOK(w, itemToMap(h, item))
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
			writeJSONOK(w, itemToMap(h, item))
			return
		}
		if err := h.Store.UpdateItem(noteID, u.ID, updates); err != nil {
			log.Printf("[Note] ItemByID: PATCH UpdateItem failed id=%s: %v", noteID, err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		item, _ = h.Store.GetItemByID(noteID)
		writeJSONOK(w, itemToMap(h, item))
	case http.MethodDelete:
		if u == nil {
			writeJSONErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		if item.OwnerID != u.ID {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}

		deletedChildren := 0

		// Delete the main note's demo items and files
		if demoItems, err := h.Store.GetDemoItemsByNoteID(noteID); err == nil {
			for _, demo := range demoItems {
				if err := h.Store.DeleteDemoItem(demo.ID); err != nil {
					log.Printf("[Note] ItemByID: DELETE demo DeleteDemoItem failed id=%d: %v", demo.ID, err)
				}
				delErr := h.Storage.DeleteFile(u.UID, demo.DemoUUID, demo.DemoRound)
				if delErr != nil && demo.FilePath != "" {
					delErr = h.Storage.DeleteFileByRelativePath(demo.FilePath)
				}
				if delErr != nil {
					log.Printf("[Note] ItemByID: DELETE demo DeleteFile failed id=%d round=%d: %v", demo.ID, demo.DemoRound, delErr)
				}
				log.Printf("[Note] ItemByID: DELETE demo ok id=%d uid=%s", demo.ID, u.UID)
			}
		}

		// Delete the main note item
		if err := h.Store.DeleteItem(noteID, u.ID); err != nil {
			log.Printf("[Note] ItemByID: DELETE DeleteItem failed id=%s: %v", noteID, err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		log.Printf("[Note] ItemByID: DELETE ok id=%s uid=%s, deleted %d child items", noteID, u.UID, deletedChildren)
		writeJSONOK(w, map[string]interface{}{"deleted": true, "deleted_children": deletedChildren})
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

// serveFile function removed - file serving now handled through demo items

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

	// Look up demo item first
	demoItem, err := h.Store.GetDemoItemByDemo(demoUUID, demoRound)
	if err != nil {
		log.Printf("[Note] GetItemByDemo: GetDemoItemByDemo failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if demoItem == nil {
		log.Printf("[Note] GetItemByDemo: demo not found demo_uuid=%s demo_round=%d", demoUUID, demoRound)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}

	// Get the associated note item
	noteItem, err := h.Store.GetItemByID(demoItem.NoteID)
	if err != nil || noteItem == nil {
		log.Printf("[Note] GetItemByDemo: note not found for demo id=%d", demoItem.ID)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}

	if !canViewNoteItem(u, noteItem) {
		log.Printf("[Note] GetItemByDemo: no permission note_id=%s demo_uuid=%s", noteItem.ID, demoUUID)
		writeJSON(w, http.StatusForbidden, map[string]interface{}{"status": "ERROR", "error": "no permission", "note_id": noteItem.ID})
		return
	}
	log.Printf("[Note] GetItemByDemo: ok note_id=%s demo_id=%d", noteItem.ID, demoItem.ID)
	writeJSONOK(w, itemToMap(h, noteItem))
}

// serveDemoFile streams the demo file to w. Caller must have already verified permission.
func (h *Handlers) serveDemoFile(w http.ResponseWriter, demoItem *DemoItem) {
	if demoItem.FilePath == "" {
		writeJSONErr(w, http.StatusNotFound, "file path not set")
		return
	}
	rc, err := h.Storage.GetFileByRelativePath(demoItem.FilePath)
	if err != nil {
		log.Printf("[Note] serveDemoFile: GetFileByRelativePath failed path=%s: %v", demoItem.FilePath, err)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=round.pb")
	if _, err := io.Copy(w, rc); err != nil {
		log.Printf("[Note] serveDemoFile: copy failed: %v", err)
	}
}

// GetFileByDemo handles GET /api/note/file with either:
//   - note_id + demo_id: permission by note, then stream file for that demo (recommended).
//   - demo_uuid + demo_round: legacy lookup, then stream file.
func (h *Handlers) GetFileByDemo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	u := session.UserFromContext(r.Context())
	noteID := strings.TrimSpace(r.URL.Query().Get("note_id"))
	demoIDStr := strings.TrimSpace(r.URL.Query().Get("demo_id"))

	// New path: note_id + demo_id (one interface for permission + file)
	if noteID != "" && demoIDStr != "" {
		demoID, err := strconv.ParseUint(demoIDStr, 10, 32)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid demo_id")
			return
		}
		log.Printf("[Note] GetFileByDemo: note_id=%s demo_id=%d", noteID, demoID)

		noteItem, err := h.Store.GetItemByID(noteID)
		if err != nil || noteItem == nil {
			log.Printf("[Note] GetFileByDemo: note not found id=%s", noteID)
			writeJSONErr(w, http.StatusNotFound, "not found")
			return
		}
		if !canViewNoteItem(u, noteItem) {
			log.Printf("[Note] GetFileByDemo: no permission note_id=%s", noteID)
			writeJSONErr(w, http.StatusForbidden, "no permission")
			return
		}

		demoItem, err := h.Store.GetDemoItemByID(uint(demoID))
		if err != nil || demoItem == nil {
			log.Printf("[Note] GetFileByDemo: demo not found id=%d", demoID)
			writeJSONErr(w, http.StatusNotFound, "not found")
			return
		}
		if demoItem.NoteID != noteID {
			log.Printf("[Note] GetFileByDemo: demo %d does not belong to note %s", demoID, noteID)
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}

		h.serveDemoFile(w, demoItem)
		return
	}

	// Legacy path: demo_uuid + demo_round
	demoUUID := strings.TrimSpace(r.URL.Query().Get("demo_uuid"))
	demoRoundStr := r.URL.Query().Get("demo_round")
	if demoUUID == "" || demoRoundStr == "" {
		writeJSONErr(w, http.StatusBadRequest, "note_id and demo_id required, or demo_uuid and demo_round required")
		return
	}
	demoRound, err := strconv.Atoi(demoRoundStr)
	if err != nil || demoRound < 0 {
		writeJSONErr(w, http.StatusBadRequest, "demo_round must be non-negative integer")
		return
	}
	log.Printf("[Note] GetFileByDemo: demo_uuid=%s demo_round=%d", demoUUID, demoRound)

	demoItem, err := h.Store.GetDemoItemByDemo(demoUUID, demoRound)
	if err != nil {
		log.Printf("[Note] GetFileByDemo: GetDemoItemByDemo failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if demoItem == nil {
		log.Printf("[Note] GetFileByDemo: demo not found demo_uuid=%s demo_round=%d", demoUUID, demoRound)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}

	noteItem, err := h.Store.GetItemByID(demoItem.NoteID)
	if err != nil || noteItem == nil {
		log.Printf("[Note] GetFileByDemo: note not found for demo id=%d", demoItem.ID)
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	if !canViewNoteItem(u, noteItem) {
		log.Printf("[Note] GetFileByDemo: no permission (private) note_id=%s demo_uuid=%s", noteItem.ID, demoUUID)
		writeJSONErr(w, http.StatusForbidden, "no permission")
		return
	}

	h.serveDemoFile(w, demoItem)
}

// DeleteDemoItem handles DELETE /api/note/demo/{id}
func (h *Handlers) DeleteDemoItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	u := session.UserFromContext(r.Context())
	if u == nil {
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}

	// Extract demo item ID from path (e.g. /api/note/demo/123 -> 123)
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 1 {
		writeJSONErr(w, http.StatusBadRequest, "invalid path")
		return
	}
	demoIDStr := parts[len(parts)-1]
	demoID, err := strconv.ParseUint(demoIDStr, 10, 32)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid demo ID")
		return
	}

	log.Printf("[Note] DeleteDemoItem: demo_id=%d", demoID)

	// Get the demo item
	demoItem, err := h.Store.GetDemoItemByID(uint(demoID))
	if err != nil || demoItem == nil {
		if err != nil && errors.Is(err, gorm.ErrRecordNotFound) {
			writeJSONErr(w, http.StatusNotFound, "demo not found")
			return
		}
		log.Printf("[Note] DeleteDemoItem: GetDemoItemByID failed id=%d: %v", demoID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Get the associated note item to verify ownership
	noteItem, err := h.Store.GetItemByID(demoItem.NoteID)
	if err != nil || noteItem == nil {
		log.Printf("[Note] DeleteDemoItem: note not found for demo id=%d", demoItem.ID)
		writeJSONErr(w, http.StatusNotFound, "note not found")
		return
	}

	// Verify ownership
	if noteItem.OwnerID != u.ID {
		writeJSONErr(w, http.StatusForbidden, "forbidden")
		return
	}

	// Delete the file from storage
	if demoItem.FilePath != "" {
		if err := h.Storage.DeleteFileByRelativePath(demoItem.FilePath); err != nil {
			log.Printf("[Note] DeleteDemoItem: DeleteFileByRelativePath failed path=%s: %v", demoItem.FilePath, err)
			// Continue with database deletion even if file deletion fails
		}
	} else {
		// Fallback when FilePath not set (legacy)
		if err := h.Storage.DeleteFile(u.UID, demoItem.DemoUUID, demoItem.DemoRound); err != nil {
			log.Printf("[Note] DeleteDemoItem: DeleteFile failed uid=%s demo_uuid=%s round=%d: %v", u.UID, demoItem.DemoUUID, demoItem.DemoRound, err)
			// Continue with database deletion even if file deletion fails
		}
	}

	// Delete from database
	if err := h.Store.DeleteDemoItem(uint(demoID)); err != nil {
		log.Printf("[Note] DeleteDemoItem: DeleteDemoItem failed id=%d: %v", demoID, err)
		writeJSONErr(w, http.StatusInternalServerError, "failed to delete demo item")
		return
	}

	log.Printf("[Note] DeleteDemoItem: ok demo_id=%d uid=%s", demoID, u.UID)
	writeJSONOK(w, map[string]interface{}{"deleted": true})
}

// PutTree handles PUT /api/note/tree with body {"order": ["id1","id2",...]}.
