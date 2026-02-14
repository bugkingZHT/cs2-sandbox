package main

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"

	"github.com/bugkingzht/cs-demobox/cmd/server/constants"
	"github.com/bugkingzht/cs-demobox/cmd/server/utils"
	"github.com/bugkingzht/cs-demobox/pkg/archive"
	"github.com/bugkingzht/cs-demobox/pkg/auth"
	"github.com/bugkingzht/cs-demobox/pkg/database"
	"github.com/bugkingzht/cs-demobox/pkg/session"
	"github.com/bugkingzht/cs-demobox/pkg/user"
)

// 由 Go 托管的前端页面路径，每个路径返回独立 HTML，便于追踪
var routeHTML = map[string]string{
	"/":         "index.html",
	"/demolib":  "demolib.html",
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

func archiveUnavailableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":    false,
			"error": "cloud archive unavailable (SNOWBO_STORAGE_ROOTPATH not configured)",
		})
	}
}

func main() {
	staticDir := utils.GetStaticDir()
	root := http.Dir(staticDir)
	static := staticHandler(root)

	// API handler: auth routes when DB is configured, else 503
	var apiHandler http.Handler
	dbCfg := utils.GetDBConfig()
	if dbCfg.IsConfigured() {
		dbName := dbCfg.Name
		log.Printf("[DB] Connecting to %s:%s (database %s)...", dbCfg.URL, dbCfg.Port, dbName)
		db, err := database.Open(dbCfg)
		if err != nil {
			log.Printf("[DB] Open failed: %v (auth API will return 503)", err)
			apiHandler = apiUnavailableHandler()
		} else {
			log.Println("[DB] Connected")
			if err := db.AutoMigrate(&user.User{}, &session.Session{}, &archive.ArchiveItem{}, &archive.UserArchiveTree{}); err != nil {
				log.Printf("[DB] Migrate failed: %v", err)
			}
			userStore := user.NewStore(db)
			// Seed default user when no users exist (admin / password: user.DefaultPasswordHash)
			var userCount int64
			if db.Model(&user.User{}).Count(&userCount).Error == nil && userCount == 0 {
				hash, err := auth.HashPassword(user.DefaultPasswordHash)
				if err == nil {
					if _, err := userStore.Create("admin", "", "", hash); err != nil {
						log.Printf("[DB] Seed default user failed: %v", err)
					} else {
						log.Println("[DB] Seed default user created: admin /", user.DefaultPasswordHash)
					}
				}
			}
			sessionStore := session.NewStore(db)
			authHandlers := &auth.Handlers{User: userStore, Session: sessionStore}
			mux := http.NewServeMux()
			mux.HandleFunc("/api/auth/login", authHandlers.Login)
			mux.HandleFunc("/api/auth/logout", authHandlers.Logout)
			mux.HandleFunc("/api/auth/me", session.RequireAuth(sessionStore, authHandlers.Me))
			mux.HandleFunc("/api/auth/change-password", session.RequireAuth(sessionStore, authHandlers.ChangePassword))
			storageRoot := utils.GetStorageRootPath()
			if storageRoot != "" {
				archiveStore := archive.NewStore(db)
				archiveStorage := archive.NewFileStorage(storageRoot)
				archiveHandlers := &archive.Handlers{Store: archiveStore, Storage: archiveStorage}
				// 读且允许未登录访问 public：OptionalAuth
				mux.HandleFunc("/api/archive/item", session.OptionalAuth(sessionStore, archiveHandlers.GetItemByDemo))
				mux.HandleFunc("/api/archive/file", session.OptionalAuth(sessionStore, archiveHandlers.GetFileByDemo))
				mux.HandleFunc("/api/archive/items/", session.OptionalAuth(sessionStore, archiveHandlers.ItemByID))
				// 写及需登录的读：RequireAuth
				mux.HandleFunc("/api/archive/tree", session.RequireAuth(sessionStore, archiveHandlers.PutTree))
				mux.HandleFunc("/api/archive/items", session.RequireAuth(sessionStore, archiveHandlers.ItemsIndex))
				log.Printf("[Archive] %s set to %s", constants.EnvSnowboStorageRootPath, storageRoot)
			} else {
				log.Printf("[Archive] %s not set; /api/archive/* will return 503", constants.EnvSnowboStorageRootPath)
				archive503 := archiveUnavailableHandler()
				mux.HandleFunc("/api/archive/tree", archive503)
				mux.HandleFunc("/api/archive/item", archive503)
				mux.HandleFunc("/api/archive/file", archive503)
				mux.HandleFunc("/api/archive/items", archive503)
				mux.HandleFunc("/api/archive/items/", archive503)
			}
			apiHandler = mux
		}
	} else {
		log.Printf("[DB] Skipped: missing env %v (auth API will return 503)", utils.DBConfigMissingEnvKeys(dbCfg))
		apiHandler = apiUnavailableHandler()
	}

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
