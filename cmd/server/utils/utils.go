package utils

import (
	"os"
	"path/filepath"
	"strconv"
)

// ServerLimitConfig 限流与慢速网络模拟配置（通过环境变量启用）
type ServerLimitConfig struct {
	// RateLimitRPS 每 IP 每秒允许的请求数，0 表示不限流
	RateLimitRPS int
	// SlowDelayMs 每个请求前额外延迟（毫秒），用于模拟网络延迟
	SlowDelayMs int
	// SlowKBPS 响应体限速（KB/s），0 表示不限速
	SlowKBPS int
}

// GetServerLimitConfig 从环境变量读取限流与慢速网络配置
// SERVER_RATE_LIMIT_RPS=2  （每 IP 每秒 2 次请求，0 关闭）
// SERVER_SLOW_DELAY_MS=500 （每个请求前延迟 500ms，0 关闭）
// SERVER_SLOW_KBPS=50      （响应体 50 KB/s，0 关闭）
func GetServerLimitConfig() ServerLimitConfig {
	rps, _ := strconv.Atoi(os.Getenv("SERVER_RATE_LIMIT_RPS"))
	delayMs, _ := strconv.Atoi(os.Getenv("SERVER_SLOW_DELAY_MS"))
	kbps, _ := strconv.Atoi(os.Getenv("SERVER_SLOW_KBPS"))
	if rps < 0 {
		rps = 0
	}
	if delayMs < 0 {
		delayMs = 0
	}
	if kbps < 0 {
		kbps = 0
	}
	return ServerLimitConfig{
		RateLimitRPS: rps,
		SlowDelayMs:  delayMs,
		SlowKBPS:     kbps,
	}
}

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
