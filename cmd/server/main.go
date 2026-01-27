package main

import (
	"log"
	"net/http"

	"github.com/bugkingzht/cs-demobox/cmd/server/utils"
)

func main() {
	// Determine the static directory path
	staticDir := utils.GetStaticDir()

	fs := http.FileServer(http.Dir(staticDir))
	http.Handle("/", fs)

	log.Println("Starting HTTP server on http://localhost:8080")
	log.Printf("Serving files from %s directory", staticDir)
	log.Println("Press Ctrl+C to stop")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
