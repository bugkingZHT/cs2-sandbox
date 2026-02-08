package main

import (
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"

	"github.com/bugkingzht/cs-demobox/cmd/server/utils"
)

// 由 Go 托管的前端页面路径，每个路径返回独立 HTML，便于追踪
var routeHTML = map[string]string{
	"/":         "index.html",
	"/demolib":  "demolib.html",
	"/replayer": "replayer.html",
	"/tactics":  "tactics.html",
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

func main() {
	staticDir := utils.GetStaticDir()
	root := http.Dir(staticDir)
	static := staticHandler(root)

	// 显式监听前端页面路径，每个路径返回独立 HTML（便于追踪）
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		cleanPath := path.Clean(r.URL.Path)
		if filename, ok := routeHTML[cleanPath]; ok {
			servePageHTML(root, filename)(w, r)
			return
		}
		static.ServeHTTP(w, r)
	})

	log.Println("Starting HTTP server on http://localhost:8080")
	log.Printf("Serving files from %s directory", staticDir)
	log.Println("App routes: / -> index.html, /demolib -> demolib.html, /replayer -> replayer.html, /tactics -> tactics.html")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
