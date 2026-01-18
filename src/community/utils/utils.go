package utils

import (
	"os"
	"path/filepath"
)

// getStaticDir returns the path to the static directory
func GetStaticDir() string {
	// Try to find web/static relative to the executable
	exe, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exe)
		// Check if web/static exists relative to executable
		staticPath := filepath.Join(exeDir, "web", "static")
		if _, err := os.Stat(staticPath); err == nil {
			return staticPath
		}

		// Check if we're running from project root (development)
		staticPath = filepath.Join(exeDir, "..", "..", "web", "static")
		if _, err := os.Stat(staticPath); err == nil {
			return staticPath
		}
	}

	// Fallback to web/static (assuming running from project root)
	return "web/static"
}
