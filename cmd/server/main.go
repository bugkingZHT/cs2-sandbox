package main

import (
	"log"
	"net/http"
)

func main() {
	// Determine the static directory path
	// staticDir := utils.GetStaticDir()
	staticDir := "D:/2DPlayer/cs-demobox/web/static"

	fs := http.FileServer(http.Dir(staticDir))
	http.Handle("/", fs)

	log.Println("Starting HTTP server on http://localhost:8080")
	log.Printf("Serving files from %s directory", staticDir)
	log.Println("Press Ctrl+C to stop")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
