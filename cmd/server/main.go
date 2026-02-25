package main

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/bugkingzht/cs-demobox/cmd/server/constants"
	"github.com/bugkingzht/cs-demobox/cmd/server/utils"
	"github.com/bugkingzht/cs-demobox/pkg/auth"
	"github.com/bugkingzht/cs-demobox/pkg/database"
	"github.com/bugkingzht/cs-demobox/pkg/demo"
	"github.com/bugkingzht/cs-demobox/pkg/note"
	"github.com/bugkingzht/cs-demobox/pkg/role"
	"github.com/bugkingzht/cs-demobox/pkg/session"
	"github.com/bugkingzht/cs-demobox/pkg/user"
)

// 由 Go 托管的前端页面路径，每个路径返回独立 HTML，便于追踪
var routeHTML = map[string]string{
	"/":         "index.html",
	"/demolib":  "demolib.html",
	"/notes":    "index.html",
	"/replayer": "replayer.html",
}

func servePageHTML(root http.FileSystem, filename string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f, err := root.Open(filename)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer f.Close()
		stat, _ := f.Stat()
		if stat == nil || stat.IsDir() {
			http.NotFound(w, r)
			return
		}
		http.ServeContent(w, r, stat.Name(), stat.ModTime(), f)
	}
}

// staticHandler：非页面路径则按静态文件返回，找不到则 404
func staticHandler(root http.FileSystem) http.Handler {
	fs := http.FileServer(root)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := path.Clean(r.URL.Path)
		name := strings.TrimPrefix(cleanPath, "/")
		if name == "" {
			http.NotFound(w, r)
			return
		}
		f, err := root.Open(name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer f.Close()
		stat, err := f.Stat()
		if err != nil || stat == nil || stat.IsDir() {
			http.NotFound(w, r)
			return
		}
		r2 := r.Clone(r.Context())
		r2.URL = cloneURL(r.URL)
		r2.URL.Path = "/" + name
		fs.ServeHTTP(w, r2)
	})
}

func cloneURL(u *url.URL) *url.URL {
	if u == nil {
		return nil
	}
	u2 := *u
	return &u2
}

func apiUnavailableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":    false,
			"error": "service unavailable (database not configured or unavailable)",
		})
	}
}

func noteUnavailableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":    false,
			"error": "cloud note unavailable (SNOWBO_STORAGE_ROOTPATH not configured)",
		})
	}
}

// openDBAndMigrate opens the database and runs AutoMigrate for core models.
func openDBAndMigrate(dbCfg database.Config) (*gorm.DB, error) {
	log.Printf("[DB] Connecting to %s:%s (database %s)...", dbCfg.URL, dbCfg.Port, dbCfg.Name)
	db, err := database.Open(dbCfg)
	if err != nil {
		return nil, err
	}
	log.Println("[DB] Connected")
	if err := db.AutoMigrate(&user.User{}, &session.Session{}, &note.NoteItem{}, &note.DemoItem{}, &demo.Demo{}, &role.Role{}, &role.Subscription{}); err != nil {
		log.Printf("[DB] Migrate failed: %v", err)
	}
	return db, nil
}

func ensureDefaultRoles(roleStore *role.Store) {
	if err := roleStore.EnsureDefaultRoles(); err != nil {
		log.Printf("[DB] Ensure default roles failed: %v", err)
		return
	}
	log.Println("[DB] Default roles (normal, pro, pro+) ensured")
}

func seedDefaultUserIfEmpty(db *gorm.DB, userStore *user.Store, roleStore *role.Store) {
	var userCount int64
	if db.Model(&user.User{}).Count(&userCount).Error != nil || userCount != 0 {
		return
	}
	hash, err := auth.HashPassword(user.DefaultPasswordHash)
	if err != nil {
		return
	}
	adminUser, err := userStore.Create("admin", "", "", hash)
	if err != nil {
		log.Printf("[DB] Seed default user failed: %v", err)
		return
	}
	log.Println("[DB] Seed default user created: admin /", user.DefaultPasswordHash)
	endsAt := time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)
	if err := roleStore.CreateSubscription("seed-admin-pro", adminUser.ID, role.RolePro, adminUser.CreatedAt, endsAt); err != nil {
		log.Printf("[DB] Seed admin pro subscription failed: %v", err)
		return
	}
	log.Println("[DB] Seed admin granted pro role")
}

func registerNoteRoutes(mux *http.ServeMux, sessionStore *session.Store, noteStore *note.Store, roleStore *role.Store) {
	storageRoot := utils.GetStorageRootPath()
	if storageRoot == "" {
		log.Printf("[Note] %s not set; /api/note/* will return 503", constants.EnvSnowboStorageRootPath)
		note503 := noteUnavailableHandler()
		mux.HandleFunc("/api/note/item", note503)
		mux.HandleFunc("/api/note/file", note503)
		mux.HandleFunc("/api/note/items", note503)
		mux.HandleFunc("/api/note/items/", note503)
		return
	}
	noteStorage := note.NewFileStorage(storageRoot)
	noteHandlers := &note.Handlers{Store: noteStore, Storage: noteStorage, RoleStore: roleStore}
	mux.HandleFunc("/api/note/item", session.OptionalAuth(sessionStore, noteHandlers.GetItemByDemo))
	mux.HandleFunc("/api/note/file", session.OptionalAuth(sessionStore, noteHandlers.GetFileByDemo))
	mux.HandleFunc("/api/note/demo/", session.RequireAuth(sessionStore, noteHandlers.DeleteDemoItem))
	mux.HandleFunc("/api/note/items/", session.OptionalAuth(sessionStore, noteHandlers.ItemByID))
	mux.HandleFunc("/api/note/items", session.RequireAuth(sessionStore, noteHandlers.ItemsIndex))
	log.Printf("[Note] %s set to %s", constants.EnvSnowboStorageRootPath, storageRoot)
}

func registerDemoRoutes(mux *http.ServeMux, sessionStore *session.Store, demoStore *demo.Store, userStore *user.Store) {
	storageRoot := utils.GetStorageRootPath()
	if storageRoot == "" {
		log.Printf("[Demo] %s not set; /api/demos/* will return 503", constants.EnvSnowboStorageRootPath)
		demo503 := noteUnavailableHandler()
		mux.HandleFunc("/api/demos", demo503)
		mux.HandleFunc("/api/demos/file", demo503)
		mux.HandleFunc("/api/demos/", demo503)
		return
	}
	demoStorage := demo.NewFileStorage(storageRoot)
	demoHandlers := &demo.Handlers{Store: demoStore, Storage: demoStorage, UserStore: userStore}
	mux.HandleFunc("/api/demos", session.RequireAuth(sessionStore, demoHandlers.Index))
	mux.HandleFunc("/api/demos/file", session.OptionalAuth(sessionStore, demoHandlers.GetFile))
	mux.HandleFunc("/api/demos/", session.OptionalAuth(sessionStore, demoHandlers.ByID))
	log.Printf("[Demo] routes registered with %s", constants.EnvSnowboStorageRootPath)
}

func newAPIMux(db *gorm.DB, userStore *user.Store, roleStore *role.Store, noteStore *note.Store, demoStore *demo.Store) http.Handler {
	sessionStore := session.NewStore(db)
	authHandlers := &auth.Handlers{User: userStore, Session: sessionStore, RoleStore: roleStore, NoteStore: noteStore}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/login", authHandlers.Login)
	mux.HandleFunc("/api/auth/logout", authHandlers.Logout)
	mux.HandleFunc("/api/auth/me", session.RequireAuth(sessionStore, authHandlers.Me))
	mux.HandleFunc("/api/auth/change-password", session.RequireAuth(sessionStore, authHandlers.ChangePassword))
	registerNoteRoutes(mux, sessionStore, noteStore, roleStore)
	registerDemoRoutes(mux, sessionStore, demoStore, userStore)
	return mux
}

// setupAPIHandler returns the API mux when DB is configured and connected, otherwise a 503 handler.
func setupAPIHandler(dbCfg database.Config) http.Handler {
	if !dbCfg.IsConfigured() {
		log.Printf("[DB] Skipped: missing env %v (auth API will return 503)", utils.DBConfigMissingEnvKeys(dbCfg))
		return apiUnavailableHandler()
	}
	db, err := openDBAndMigrate(dbCfg)
	if err != nil {
		log.Printf("[DB] Open failed: %v (auth API will return 503)", err)
		return apiUnavailableHandler()
	}
	userStore := user.NewStore(db)
	roleStore := role.NewStore(db)
	noteStore := note.NewStore(db)
	demoStore := demo.NewStore(db)
	ensureDefaultRoles(roleStore)
	seedDefaultUserIfEmpty(db, userStore, roleStore)
	return newAPIMux(db, userStore, roleStore, noteStore, demoStore)
}

func main() {
	staticDir := utils.GetStaticDir()
	root := http.Dir(staticDir)
	static := staticHandler(root)

	// API handler: auth + note routes when DB is configured, else 503
	apiHandler := setupAPIHandler(utils.GetDBConfig())

	// 显式监听前端页面路径，每个路径返回独立 HTML（便于追踪）；/api 走 API
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := path.Clean(r.URL.Path)
		if strings.HasPrefix(cleanPath, "/api") {
			apiHandler.ServeHTTP(w, r)
			return
		}
		if filename, ok := routeHTML[cleanPath]; ok {
			servePageHTML(root, filename)(w, r)
			return
		}
		static.ServeHTTP(w, r)
	})

	// 请求日志（requestID + sessionID）-> 限流与慢速网络模拟
	limitCfg := utils.GetServerLimitConfig()
	utils.LogLimitConfig(limitCfg)
	var finalHandler http.Handler = utils.RequestLogMiddleware(handler)
	if limitCfg.RateLimitRPS > 0 || limitCfg.SlowDelayMs > 0 || limitCfg.SlowKBPS > 0 {
		finalHandler = utils.LimitMiddleware(limitCfg, finalHandler)
	}
	http.Handle("/", finalHandler)

	log.Println("Starting HTTP server on http://localhost:8080")
	log.Printf("Serving files from %s directory", staticDir)
	log.Println("App routes: / -> index.html, /demolib -> demolib.html, /replayer -> replayer.html")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
