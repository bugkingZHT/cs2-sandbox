package localapp

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestLibraryIsolationAndRemoval(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, id := range []string{"earlier", "latest"} {
		s.library[id] = State{ID: id, Name: id + ".dem", Status: "ready", Rounds: []int{1}}
		if err := os.Mkdir(filepath.Join(s.root, id), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(s.root, id, "1.json"), []byte(`{"round":1,"frames":[]}`), 0600); err != nil {
			t.Fatal(err)
		}
	}
	s.state = s.library["latest"]
	s.library["active"] = State{ID: "active", Status: "parsing"}
	if w := call(s, "POST", "/api/remove", `{"id":"active"}`); w.Code != 409 {
		t.Fatal("active parser cache deletion accepted")
	}
	delete(s.library, "active")
	if w := call(s, "GET", "/api/round?id=earlier&n=1", ""); w.Code != 200 {
		t.Fatal("opening another demo lost the previous replay", w.Code)
	}
	var list []State
	w := call(s, "GET", "/api/library", "")
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || len(list) != 2 {
		t.Fatal("expected two matches", err)
	}
	if w := call(s, "POST", "/api/remove", `{"id":"../outside"}`); w.Code != 404 {
		t.Fatal("unregistered deletion accepted")
	}
	if w := call(s, "GET", "/api/remove", ""); w.Code != 405 {
		t.Fatal("GET mutated library")
	}
	if w := call(s, "POST", "/api/remove", `{"id":"earlier"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if _, err := os.Stat(filepath.Join(s.root, "earlier")); !os.IsNotExist(err) {
		t.Fatal("cache was not removed")
	}
	if w := call(s, "GET", "/api/round?id=latest&n=1", ""); w.Code != 200 {
		t.Fatal("unrelated replay removed")
	}
	if w := call(s, "GET", "/api/round?id=earlier&n=1", ""); w.Code != 409 {
		t.Fatal("removed replay is accessible")
	}
}

func TestBrowserRoutes(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	h := s.Handler(fstest.MapFS{"index.html": {Data: []byte("full-ui")}})
	for _, path := range []string{"/", "/demolib", "/replayer?round=2"} {
		r := httptest.NewRequest("GET", "http://127.0.0.1:8000"+path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 200 || w.Body.String() != "full-ui" {
			t.Fatalf("browser refresh failed for %s: %d", path, w.Code)
		}
	}
}
