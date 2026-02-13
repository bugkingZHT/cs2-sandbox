package session

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/bugkingzht/cs-demobox/pkg/user"
)

type contextKey string

const userContextKey contextKey = "user"

// UserFromContext returns the user attached to the request context, or nil.
func UserFromContext(ctx context.Context) *user.User {
	u, _ := ctx.Value(userContextKey).(*user.User)
	return u
}

// RequireAuth wraps a handler and returns 401 JSON if the request has no valid session.
func RequireAuth(store *Store, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_id")
		if err != nil || cookie == nil || cookie.Value == "" {
			writeJSONError(w, http.StatusUnauthorized, "not logged in")
			return
		}
		_, u, err := store.GetBySessionID(cookie.Value)
		if err != nil || u == nil {
			writeJSONError(w, http.StatusUnauthorized, "invalid or expired session")
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// OptionalAuth runs session lookup and sets user in context when valid; does not return 401 when missing. Use for routes that allow anonymous access with optional login (e.g. public archive view).
func OptionalAuth(store *Store, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var u *user.User
		if cookie, err := r.Cookie("session_id"); err == nil && cookie != nil && cookie.Value != "" {
			_, u, _ = store.GetBySessionID(cookie.Value)
		}
		ctx := context.WithValue(r.Context(), userContextKey, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "error",
		"error":  msg,
	})
}
