package utils

import (
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

// Server 提供前端静态资源与页面路由。
//
// 限流与慢速网络模拟（可选，通过环境变量配置）：
//
//	SERVER_RATE_LIMIT_RPS  每 IP 每秒允许的请求数，0 表示不限流。例如：2
//	SERVER_SLOW_DELAY_MS   每个请求前额外延迟（毫秒），模拟网络延迟，0 表示不延迟。例如：500
//	SERVER_SLOW_KBPS       响应体限速（KB/s），模拟慢速下载，0 表示不限速。例如：50
//
// 使用示例：
//
//	# 仅模拟慢速网络（延迟 800ms + 响应 80 KB/s）
//	SERVER_SLOW_DELAY_MS=800 SERVER_SLOW_KBPS=80 ./server
//
//	# 限流 + 慢速（每 IP 每秒 3 次请求，延迟 500ms，响应 50 KB/s）
//	SERVER_RATE_LIMIT_RPS=3 SERVER_SLOW_DELAY_MS=500 SERVER_SLOW_KBPS=50 ./server
//
// 不设置或设为 0 时，不启用限流与慢速模拟。

// rateLimiter 按 IP 的简单滑动窗口限流
type rateLimiter struct {
	mu      sync.Mutex
	clients map[string][]time.Time
	rps     int
	window  time.Duration
}

func newRateLimiter(rps int) *rateLimiter {
	return &rateLimiter{
		clients: make(map[string][]time.Time),
		rps:     rps,
		window:  time.Second,
	}
}

func (rl *rateLimiter) allow(ip string) bool {
	if rl.rps <= 0 {
		return true
	}
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-rl.window)
	times := rl.clients[ip]
	// 只保留窗口内的请求时间
	j := 0
	for _, t := range times {
		if t.After(cutoff) {
			times[j] = t
			j++
		}
	}
	times = times[:j]
	if len(times) >= rl.rps {
		return false
	}
	times = append(times, now)
	rl.clients[ip] = times
	return true
}

// throttleWriter 包装 http.ResponseWriter，按指定速率写入响应体（模拟慢速网络）
type throttleWriter struct {
	http.ResponseWriter
	bytesPerSec int64
	chunkSize   int
	lastWrite   time.Time
	mu          sync.Mutex
}

func newThrottleWriter(w http.ResponseWriter, kbps int) *throttleWriter {
	if kbps <= 0 {
		return nil
	}
	return &throttleWriter{
		ResponseWriter: w,
		bytesPerSec:    int64(kbps) * 1024,
		chunkSize:      4 * 1024, // 4KB 一块
		lastWrite:      time.Time{},
	}
}

func (t *throttleWriter) Write(p []byte) (n int, err error) {
	if t == nil || t.bytesPerSec <= 0 {
		return t.ResponseWriter.Write(p)
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	written := 0
	for written < len(p) {
		end := written + t.chunkSize
		if end > len(p) {
			end = len(p)
		}
		chunk := p[written:end]
		// 按速率计算本块应等待时间
		elapsed := time.Since(t.lastWrite)
		need := time.Duration(len(chunk)) * time.Second / time.Duration(t.bytesPerSec)
		if need > elapsed {
			time.Sleep(need - elapsed)
		}
		nw, err := t.ResponseWriter.Write(chunk)
		written += nw
		t.lastWrite = time.Now()
		if err != nil {
			return written, err
		}
		if nw < len(chunk) {
			return written, nil
		}
	}
	return written, nil
}

// LimitMiddleware 根据 ServerLimitConfig 包装 handler：限流 + 慢速网络模拟
func LimitMiddleware(cfg ServerLimitConfig, next http.Handler) http.Handler {
	var rl *rateLimiter
	if cfg.RateLimitRPS > 0 {
		rl = newRateLimiter(cfg.RateLimitRPS)
	}
	delay := time.Duration(cfg.SlowDelayMs) * time.Millisecond
	throttleKBPS := cfg.SlowKBPS

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		if rl != nil && !rl.allow(ip) {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		if delay > 0 {
			time.Sleep(delay)
		}
		if throttleKBPS > 0 {
			w = &responseWriterWrapper{
				ResponseWriter: w,
				throttle:       newThrottleWriter(w, throttleKBPS),
			}
		}
		next.ServeHTTP(w, r)
	})
}

// responseWriterWrapper 在 Write 时使用 throttleWriter，其它方法透传
type responseWriterWrapper struct {
	http.ResponseWriter
	throttle *throttleWriter
}

func (w *responseWriterWrapper) Write(p []byte) (int, error) {
	if w.throttle != nil {
		return w.throttle.Write(p)
	}
	return w.ResponseWriter.Write(p)
}

func clientIP(r *http.Request) string {
	if x := r.Header.Get("X-Forwarded-For"); x != "" {
		for i := 0; i < len(x); i++ {
			if x[i] == ',' {
				return trimSpace(x[:i])
			}
		}
		return trimSpace(x)
	}
	if x := r.Header.Get("X-Real-IP"); x != "" {
		return trimSpace(x)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}

// LogLimitConfig 打印当前限流/慢速网络配置（便于确认是否生效）
func LogLimitConfig(cfg ServerLimitConfig) {
	if cfg.RateLimitRPS == 0 && cfg.SlowDelayMs == 0 && cfg.SlowKBPS == 0 {
		return
	}
	log.Println("[Server] Limit config: rate_limit_rps=", cfg.RateLimitRPS, " slow_delay_ms=", cfg.SlowDelayMs, " slow_kbps=", cfg.SlowKBPS)
}
