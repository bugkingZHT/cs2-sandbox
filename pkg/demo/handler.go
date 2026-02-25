package demo

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/bugkingzht/cs-demobox/pkg/session"
	"github.com/bugkingzht/cs-demobox/pkg/user"
)

const maxUploadBytes = 200 << 20 // 200MB for multi-round demo upload

var roundFileKeyRegex = regexp.MustCompile(`^round_(\d+)(\.pb\.gz)?$`)

// Handlers holds dependencies for demo HTTP handlers.
type Handlers struct {
	Store     *Store
	Storage   *FileStorage
	UserStore *user.Store // for resolving owner UID when streaming public demo rounds
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

func demoToMap(d *Demo) map[string]interface{} {
	return map[string]interface{}{
		"id":          d.ID,
		"demo_uuid":   d.DemoUUID,
		"demo_meta":   d.DemoMeta,
		"file_path":   d.FilePath,
		"file_size":   d.FileSize,
		"permission":  d.Permission,
		"created_at":  d.CreatedAt,
		"updated_at":  d.UpdatedAt,
	}
}

// Index handles GET /api/demos (list) and POST /api/demos (create).
func (h *Handlers) Index(w http.ResponseWriter, r *http.Request) {
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

// List returns current user's demos.
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	u := session.UserFromContext(r.Context())
	if u == nil {
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	list, err := h.Store.ListByUser(u.ID)
	if err != nil {
		log.Printf("[Demo] List: ListByUser failed user_id=%d: %v", u.ID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	var items []map[string]interface{}
	for _, d := range list {
		items = append(items, demoToMap(d))
	}
	writeJSONOK(w, map[string]interface{}{"items": items})
}

// GetFile handles GET /api/demos/file?demo_id=X&round=N. Streams round_N.pb.gz (same as note-style file endpoint).
func (h *Handlers) GetFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	demoIDStr := strings.TrimSpace(r.URL.Query().Get("demo_id"))
	roundStr := strings.TrimSpace(r.URL.Query().Get("round"))
	if demoIDStr == "" || roundStr == "" {
		writeJSONErr(w, http.StatusBadRequest, "demo_id and round required")
		return
	}
	demoID, err := strconv.ParseUint(demoIDStr, 10, 64)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid demo_id")
		return
	}
	round, err := strconv.Atoi(roundStr)
	if err != nil || round < 1 {
		writeJSONErr(w, http.StatusBadRequest, "invalid round")
		return
	}
	d, err := h.Store.GetByID(uint(demoID))
	if err != nil || d == nil {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	u := session.UserFromContext(r.Context())
	if u == nil {
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	if u.ID != d.UserID && d.Permission != PermissionPublic {
		writeJSONErr(w, http.StatusForbidden, "forbidden")
		return
	}
	var ownerUID string
	if u.ID == d.UserID {
		ownerUID = u.UID
	} else {
		owner, err := h.UserStore.GetByID(d.UserID)
		if err != nil || owner == nil {
			writeJSONErr(w, http.StatusNotFound, "not found")
			return
		}
		ownerUID = owner.UID
	}
	rc, err := h.Storage.GetRound(ownerUID, d.DemoUUID, round)
	if err != nil {
		log.Printf("[Demo] GetFile: GetRound failed: %v", err)
		writeJSONErr(w, http.StatusNotFound, "round file not found")
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = io.Copy(w, rc)
}

// Create handles POST multipart: meta, permission, demo_uuid, and files round_1, round_2, ... (or round_1.pb.gz, ...).
func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	u := session.UserFromContext(r.Context())
	if u == nil {
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	if !h.Storage.IsConfigured() {
		writeJSONErr(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		log.Printf("[Demo] Create: ParseMultipartForm failed: %v", err)
		writeJSONErr(w, http.StatusBadRequest, "request too large or invalid multipart")
		return
	}
	demoUUID := strings.TrimSpace(r.FormValue("demo_uuid"))
	if demoUUID == "" {
		writeJSONErr(w, http.StatusBadRequest, "demo_uuid required")
		return
	}
	meta := r.FormValue("meta")
	permStr := strings.TrimSpace(r.FormValue("permission"))
	perm := PermissionPrivate
	if permStr == "1" || strings.ToLower(permStr) == "public" {
		perm = PermissionPublic
	}

	// Collect round files from multipart (keys round_1, round_2, or round_1.pb.gz, ...)
	type roundFile struct {
		round int
		rc    io.ReadCloser
		size  int64
	}
	var roundFiles []roundFile
	for key, headers := range r.MultipartForm.File {
		m := roundFileKeyRegex.FindStringSubmatch(key)
		if m == nil {
			continue
		}
		roundNum, _ := strconv.Atoi(m[1])
		if roundNum < 1 {
			continue
		}
		if len(headers) == 0 {
			continue
		}
		f, err := headers[0].Open()
		if err != nil {
			log.Printf("[Demo] Create: open file %s failed: %v", key, err)
			writeJSONErr(w, http.StatusBadRequest, "invalid file: "+key)
			return
		}
		roundFiles = append(roundFiles, roundFile{round: roundNum, rc: f, size: headers[0].Size})
	}
	if len(roundFiles) == 0 {
		writeJSONErr(w, http.StatusBadRequest, "at least one round file required (round_1, round_2, ...)")
		return
	}
	defer func() {
		for _, rf := range roundFiles {
			if rf.rc != nil {
				_ = rf.rc.Close()
			}
		}
	}()

	// If same user already has this demo_uuid, return 409
	existing, err := h.Store.GetByUserAndUUID(u.ID, demoUUID)
	if err != nil {
		log.Printf("[Demo] Create: GetByUserAndUUID failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if existing != nil {
		writeJSONErr(w, http.StatusConflict, "demo already exists for this user, delete first to re-upload")
		return
	}

	// Create DB record first
	dirPath := h.Storage.DirRelativePath(u.UID, demoUUID)
	var totalSize int64
	for _, rf := range roundFiles {
		totalSize += rf.size
	}
	d := &Demo{
		UserID:     u.ID,
		DemoUUID:   demoUUID,
		DemoMeta:   meta,
		FilePath:   dirPath,
		FileSize:   totalSize,
		Permission: perm,
	}
	if err := h.Store.Create(d); err != nil {
		log.Printf("[Demo] Create: Create failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "failed to create demo record")
		return
	}

	// Save each round file; on failure delete demo record and storage
	for i := range roundFiles {
		rf := &roundFiles[i]
		err := h.Storage.SaveRound(u.UID, demoUUID, rf.round, rf.rc)
		_ = rf.rc.Close()
		rf.rc = nil
		if err != nil {
			log.Printf("[Demo] Create: SaveRound failed round=%d: %v", rf.round, err)
			_ = h.Storage.DeleteDemo(u.UID, demoUUID)
			_ = h.Store.Delete(d.ID, u.ID)
			writeJSONErr(w, http.StatusInternalServerError, "failed to save round file")
			return
		}
	}

	log.Printf("[Demo] Create: ok id=%d uid=%s demo_uuid=%s rounds=%d", d.ID, u.UID, demoUUID, len(roundFiles))
	writeJSON(w, http.StatusCreated, map[string]interface{}{"status": "OK", "data": demoToMap(d)})
}

// ByID handles GET /api/demos/:id, GET /api/demos/:id/rounds/:round (file), DELETE /api/demos/:id.
func (h *Handlers) ByID(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	prefix := "/api/demos/"
	if !strings.HasPrefix(path, prefix) {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	suffix := strings.TrimPrefix(path, prefix)
	suffix = strings.Trim(suffix, "/")
	parts := strings.Split(suffix, "/")
	if len(parts) < 1 || parts[0] == "" {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	idStr := parts[0]
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}

	d, err := h.Store.GetByID(uint(id))
	if err != nil || d == nil {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}

	u := session.UserFromContext(r.Context())

	// GET /api/demos/:id/rounds/:round -> stream round file
	if len(parts) >= 3 && parts[1] == "rounds" {
		roundStr := parts[2]
		round, err := strconv.Atoi(roundStr)
		if err != nil || round < 1 {
			writeJSONErr(w, http.StatusBadRequest, "invalid round number")
			return
		}
		// Permission: owner or public
		if u == nil || (u.ID != d.UserID && d.Permission != PermissionPublic) {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
		// Resolve UID for storage path - we have UserID in d, need UID. We don't have user store here.
		// So we must pass UID from client or store UID in Demo. Plan says FilePath = USER_uid/demoUUID.
		// We store only relative path in DB (dir path). So we need to get user UID. Handler doesn't have user store.
		// Option: store UID in Demo model (redundant) or add UserStore to Handlers. For GetRound we need full path.
		// Actually path is root + USER_uid + demoUUID + round_N.pb.gz. We have demoUUID in d. We need uid string.
		// Simplest: add UserStore to Handlers and get UID by d.UserID. Let me add UserStore to demo Handlers.
		// But the plan didn't mention it - let me check. Storage.Path(uid, demoUUID, round) needs uid. So we need
		// to get uid from somewhere. I'll add a dependency on user store to get UID by UserID, or we could store
		// a "user_uid" in the Demo table. Actually looking at note, they use u.UID from context. So when we're
		// streaming for "current user" we have u.UID. When we're streaming for "other user" (public demo), we
		// have d.UserID but not UID. So we must have a way to get UID from UserID. Add UserStore to Handlers.
		// For now, only allow download when requester is owner (u != nil && u.ID == d.UserID) so we have u.UID.
		// Public read: we need UID of the demo owner. So add UserStore to get owner UID.
		if u == nil {
			writeJSONErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		var ownerUID string
		if u.ID == d.UserID {
			ownerUID = u.UID
		} else if d.Permission == PermissionPublic {
			// Need owner UID for path (UserStore is set in main when registering demo routes)
			owner, err := h.UserStore.GetByID(d.UserID)
			if err != nil || owner == nil {
				writeJSONErr(w, http.StatusNotFound, "not found")
				return
			}
			ownerUID = owner.UID
		} else {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
		rc, err := h.Storage.GetRound(ownerUID, d.DemoUUID, round)
		if err != nil {
			log.Printf("[Demo] GetRound: Open failed: %v", err)
			writeJSONErr(w, http.StatusNotFound, "round file not found")
			return
		}
		defer rc.Close()
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = io.Copy(w, rc)
		return
	}

	// GET /api/demos/:id (metadata), PATCH (update meta/permission), or DELETE
	switch r.Method {
	case http.MethodGet:
		if u == nil || (u.ID != d.UserID && d.Permission != PermissionPublic) {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
		writeJSONOK(w, demoToMap(d))
	case http.MethodPatch:
		if u == nil {
			writeJSONErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		if u.ID != d.UserID {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
		var body struct {
			Permission *int8  `json:"permission"`
			DemoMeta   *string `json:"demo_meta"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		updates := make(map[string]interface{})
		if body.Permission != nil {
			if *body.Permission != PermissionPrivate && *body.Permission != PermissionPublic {
				writeJSONErr(w, http.StatusBadRequest, "permission must be 0 or 1")
				return
			}
			updates["permission"] = *body.Permission
		}
		if body.DemoMeta != nil {
			updates["demo_meta"] = *body.DemoMeta
		}
		if len(updates) == 0 {
			writeJSONErr(w, http.StatusBadRequest, "no updates")
			return
		}
		if err := h.Store.Update(d.ID, u.ID, updates); err != nil {
			log.Printf("[Demo] Patch: Update failed: %v", err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		log.Printf("[Demo] Patch: ok id=%d uid=%s permission=%v", d.ID, u.UID, updates["permission"])
		writeJSONOK(w, map[string]interface{}{"updated": true})
	case http.MethodDelete:
		if u == nil {
			writeJSONErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		if u.ID != d.UserID {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
		if err := h.Storage.DeleteDemo(u.UID, d.DemoUUID); err != nil {
			log.Printf("[Demo] Delete: DeleteDemo failed: %v", err)
		}
		if err := h.Store.Delete(d.ID, u.ID); err != nil {
			log.Printf("[Demo] Delete: Store.Delete failed: %v", err)
			writeJSONErr(w, http.StatusInternalServerError, "internal error")
			return
		}
		log.Printf("[Demo] Delete: ok id=%d uid=%s", d.ID, u.UID)
		writeJSONOK(w, map[string]interface{}{"deleted": true})
	default:
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}
