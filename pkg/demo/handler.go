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
)

const maxUploadBytes = 200 << 20 // 200MB for multi-round demo upload

var roundFileKeyRegex = regexp.MustCompile(`^round_(\d+)(\.pb\.gz)?$`)

// Handlers holds dependencies for demo HTTP handlers.
type Handlers struct {
	Store   *Store
	Storage *FileStorage
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

// List returns current user's demos. Supports query ?uid= to request by uid; uid must match session user (鉴权).
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	u := session.UserFromContext(r.Context())
	if u == nil {
		writeJSONErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	listUID := u.UID
	if q := strings.TrimSpace(r.URL.Query().Get("uid")); q != "" {
		if q != u.UID {
			writeJSONErr(w, http.StatusForbidden, "uid does not match session")
			return
		}
		listUID = q
	}
	list, err := h.Store.ListByUser(listUID)
	if err != nil {
		log.Printf("[Demo] List: ListByUser failed uid=%s: %v", listUID, err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	var items []map[string]interface{}
	for _, d := range list {
		items = append(items, demoToMap(d))
	}
	writeJSONOK(w, map[string]interface{}{"items": items})
}

// ByUUID handles GET /api/demos/by-uuid?demo_uuid=xxx. Returns demo metadata if the current user may access it:
// - If permission is public, anyone (including anonymous) may access.
// - If permission is private, only the owner (session UID matches demo UserUID) may access.
// Returns 403 when demo is private and (not logged in or session UID != owner).
func (h *Handlers) ByUUID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	demoUUID := strings.TrimSpace(r.URL.Query().Get("demo_uuid"))
	if demoUUID == "" {
		writeJSONErr(w, http.StatusBadRequest, "demo_uuid required")
		return
	}
	list, err := h.Store.ListByDemoUUID(demoUUID)
	if err != nil {
		log.Printf("[Demo] ByUUID: ListByDemoUUID failed: %v", err)
		writeJSONErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	if len(list) == 0 {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	u := session.UserFromContext(r.Context())
	var d *Demo
	for _, candidate := range list {
		if u != nil && candidate.UserUID == u.UID {
			d = candidate
			break
		}
	}
	if d == nil {
		for _, candidate := range list {
			if candidate.Permission == PermissionPublic {
				d = candidate
				break
			}
		}
	}
	if d == nil {
		writeJSONErr(w, http.StatusForbidden, "forbidden")
		return
	}
	writeJSONOK(w, demoToMap(d))
}

// GetFile handles GET /api/demos/file?demo_id=X&round=N. Streams round_N.pb.gz (same as note-style file endpoint).
// If demo permission is public, allows unauthenticated access.
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
	if d.Permission != PermissionPublic {
		if u == nil {
			writeJSONErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		if u.UID != d.UserUID {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
	}
	ownerUID := d.UserUID
	if u != nil && u.UID == d.UserUID {
		ownerUID = u.UID
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
	existing, err := h.Store.GetByUserAndUUID(u.UID, demoUUID)
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
		UserUID:    u.UID,
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
			_ = h.Store.Delete(d.ID, u.UID)
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

	// GET /api/demos/:id/rounds/:round -> stream round file (public demo allows anonymous)
	if len(parts) >= 3 && parts[1] == "rounds" {
		roundStr := parts[2]
		round, err := strconv.Atoi(roundStr)
		if err != nil || round < 1 {
			writeJSONErr(w, http.StatusBadRequest, "invalid round number")
			return
		}
		if d.Permission != PermissionPublic {
			if u == nil {
				writeJSONErr(w, http.StatusUnauthorized, "not logged in")
				return
			}
			if u.UID != d.UserUID {
				writeJSONErr(w, http.StatusForbidden, "forbidden")
				return
			}
		}
		ownerUID := d.UserUID
		if u != nil && u.UID == d.UserUID {
			ownerUID = u.UID
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
		if d.Permission != PermissionPublic {
			if u == nil {
				writeJSONErr(w, http.StatusUnauthorized, "not logged in")
				return
			}
			if u.UID != d.UserUID {
				writeJSONErr(w, http.StatusForbidden, "forbidden")
				return
			}
		}
		writeJSONOK(w, demoToMap(d))
	case http.MethodPatch:
		if u == nil {
			writeJSONErr(w, http.StatusUnauthorized, "not logged in")
			return
		}
		if u.UID != d.UserUID {
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
		if err := h.Store.Update(d.ID, u.UID, updates); err != nil {
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
		if u.UID != d.UserUID {
			writeJSONErr(w, http.StatusForbidden, "forbidden")
			return
		}
		if err := h.Storage.DeleteDemo(u.UID, d.DemoUUID); err != nil {
			log.Printf("[Demo] Delete: DeleteDemo failed: %v", err)
		}
		if err := h.Store.Delete(d.ID, u.UID); err != nil {
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
