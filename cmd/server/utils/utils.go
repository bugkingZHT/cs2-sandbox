package utils

import (
	"os"
	"path/filepath"
)

// Conf final fallback absolute path to static directory
const defaultAbsPath = ""

// GetStaticDir returns the absolute path to the static directory
func GetStaticDir() string {
	var staticPath string

	// Try to find web/static relative to the executable
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)

		// 1. Check if web/static exists relative to executable (production)
		path := filepath.Join(exeDir, "web", "static")
		if _, err := os.Stat(path); err == nil {
			staticPath = path
		} else {
			// 2. Check if we're running from project root (development: bin/server)
			path = filepath.Join(exeDir, "..", "web", "static")
			if _, err := os.Stat(path); err == nil {
				staticPath = path
			} else {
				// 3. Check if we're running from deep inside (development: go run cmd/server/main.go)
				path = filepath.Join(exeDir, "..", "..", "web", "static")
				if _, err := os.Stat(path); err == nil {
					staticPath = path
				}
			}
		}
	}

	// Fallback to web/static relative to current working directory
	if staticPath == "" {
		staticPath = "web/static"
	}

	// Convert to absolute path
	if absPath, err := filepath.Abs(staticPath); err == nil && absPath != "" {
		return absPath
	}

	// fallback to default absolute path
	return defaultAbsPath
}
