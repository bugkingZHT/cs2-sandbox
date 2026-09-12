package localapp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

func defaultAlias(name string) string {
	return strings.TrimSuffix(name, filepath.Ext(name))
}

// Caller holds mu. Failed imports remain retryable; aliases never affect identity.
func (s *Server) knownNames() map[string]bool {
	names := map[string]bool{}
	for _, st := range s.library {
		if st.Status == "ready" || isPending(st.Status) {
			names[st.Name] = true
			if st.UploadName != "" {
				names[st.UploadName] = true
			}
		}
	}
	return names
}

func (s *Server) rename(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	var req struct {
		ID        string `json:"id"`
		AliasName string `json:"alias_name"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		fail(w, fmt.Errorf("名称请求无效"), 400)
		return
	}
	req.AliasName = strings.TrimSpace(req.AliasName)
	if req.AliasName == "" || utf8.RuneCountInString(req.AliasName) > 120 || strings.ContainsAny(req.AliasName, "\r\n\x00") {
		fail(w, fmt.Errorf("名称需为 1–120 个字符，且不能包含换行"), 400)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	st, ok := s.library[req.ID]
	if !ok {
		fail(w, fmt.Errorf("Demo 不存在"), 404)
		return
	}
	st.AliasName = req.AliasName
	if err := s.persist(st); err != nil {
		fail(w, err, 500)
		return
	}
	s.library[st.ID] = st
	if s.state.ID == st.ID {
		s.state = st
	}
	send(w, st)
}
