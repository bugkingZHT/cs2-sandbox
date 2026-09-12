package localapp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

func seedNamedReplay(t *testing.T, s *Server, st State) {
	t.Helper()
	st.Meta = &entity.ReplayMeta{UUID: st.ID}
	st.Rounds = []int{1}
	if err := os.Mkdir(filepath.Join(s.root, st.ID), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(s.root, st.ID, "1.json"), []byte(`{"round":1,"frames":[]}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := s.persist(st); err != nil {
		t.Fatal(err)
	}
	s.library[st.ID] = st
}

func TestFilenameDeduplication(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	s.working = true
	seedNamedReplay(t, s, State{ID: "old", Name: "old.dem", AliasName: "自定义名称", Status: "ready"})
	seedNamedReplay(t, s, State{ID: "failed", Name: "retry.dem", Status: "error"})
	archive := zipData(t, []testUpload{
		{"a/old.dem", []byte("old")}, {"a/new.dem", []byte("new")},
		{"nested.zip", zipData(t, []testUpload{{"b/new.dem", []byte("different")}, {"b/extra.dem", []byte("extra")}})},
	})
	w := uploadFiles(t, s, []testUpload{
		{"old.dem", []byte("different size")}, {"bundle.zip", archive},
		{"new.dem", []byte("different direct content")}, {"retry.dem", []byte("retry")}, {"Old.dem", []byte("case sensitive")},
	})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result importResult
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 4 || len(result.Skipped) != 2 || len(result.Duplicates) != 2 {
		t.Fatalf("wrong duplicate report: %+v", result)
	}
	if len(s.queue) != 4 {
		t.Fatal("duplicate job queued")
	}
	for _, st := range result.Items {
		if st.AliasName != defaultAlias(st.Name) {
			t.Fatal("wrong default alias", st)
		}
		if st.Name == "new.dem" || st.Name == "extra.dem" {
			if st.UploadName != "bundle.zip" {
				t.Fatal("lost ZIP filename")
			}
		}
	}
	// A second upload of the archive or a pending Demo never adds queue work.
	w = uploadFiles(t, s, []testUpload{{"bundle.zip", archive}, {"retry.dem", []byte("retry again")}})
	json.Unmarshal(w.Body.Bytes(), &result)
	if len(result.Items) != 0 || len(result.Skipped) != 2 || len(s.queue) != 4 {
		t.Fatal(w.Body.String())
	}
	// Ignored entries and ZIP containers must not leave orphan directories.
	dirs, _ := os.ReadDir(s.root)
	for _, d := range dirs {
		if d.IsDir() {
			if _, ok := s.library[d.Name()]; !ok {
				t.Fatal("orphan", d.Name())
			}
		}
	}
}

func TestConcurrentFilenameDeduplication(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	s.working = true
	results := make(chan importResult, 2)
	for i := 0; i < 2; i++ {
		go func() {
			w := uploadFiles(t, s, []testUpload{{"same.dem", []byte("demo")}})
			var result importResult
			json.Unmarshal(w.Body.Bytes(), &result)
			results <- result
		}()
	}
	a, b := <-results, <-results
	if len(a.Items)+len(b.Items) != 1 || len(a.Skipped)+len(b.Skipped) != 1 || len(s.queue) != 1 {
		t.Fatalf("concurrent uploads were not deduplicated: %+v %+v", a, b)
	}
}

func TestAliasMigrationPersistenceAndQueue(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	seedNamedReplay(t, s, State{ID: "legacy", Name: "mibr-vs-alliance-m1-inferno.dem", Status: "ready", SourcePath: "archive.zip / nested/mibr-vs-alliance-m1-inferno.dem"})
	root := s.root
	s.Close()
	s, err = newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if st := s.library["legacy"]; st.AliasName != "mibr-vs-alliance-m1-inferno" || st.UploadName != "archive.zip" {
		t.Fatal("migration failed", st)
	}
	if !s.knownNames()["archive.zip"] {
		t.Fatal("archive history lost after restart")
	}
	if w := call(s, "POST", "/api/rename", `{"id":"legacy","alias_name":"  决赛 / Inferno  "}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	for _, name := range []string{"", "   ", strings.Repeat("中", 121), "a\nb"} {
		body, _ := json.Marshal(map[string]string{"id": "legacy", "alias_name": name})
		if w := call(s, "POST", "/api/rename", string(body)); w.Code != 400 {
			t.Fatal("invalid name accepted", name)
		}
	}
	if w := call(s, "GET", "/api/rename", ""); w.Code != 405 {
		t.Fatal("GET allowed")
	}
	if w := call(s, "POST", "/api/rename", `{"id":"../missing","alias_name":"x"}`); w.Code != 404 {
		t.Fatal("unknown entry accepted")
	}
	s.working = true
	w := uploadFiles(t, s, []testUpload{{"queued.dem", []byte("bad demo")}})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	id := s.queue[0].state.ID
	if w := call(s, "POST", "/api/rename", `{"id":"`+id+`","alias_name":"队列中的名称"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	s.wg.Add(1)
	s.runQueue(context.Background())
	if st := s.library[id]; st.AliasName != "队列中的名称" || st.Name != "queued.dem" || st.Status != "error" {
		t.Fatal("worker overwrote alias", st)
	}
	s.Close()
	s, err = newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if st := s.library["legacy"]; st.AliasName != "决赛 / Inferno" || st.Name != "mibr-vs-alliance-m1-inferno.dem" {
		t.Fatal("saved alias lost", st)
	}
	if s.library[id].AliasName != "队列中的名称" {
		t.Fatal("queued alias lost after restart")
	}
}
