package localapp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func sharedServer(t *testing.T, root string) *Server {
	t.Helper()
	s, err := newSharedAt(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s
}

func TestSharedRealDemo(t *testing.T) {
	path := os.Getenv("CS_DEMO_TEST_FILE")
	if path == "" {
		t.Skip("set CS_DEMO_TEST_FILE for shared-store parser integration")
	}
	root := t.TempDir()
	a := sharedServer(t, root)
	body, _ := json.Marshal(map[string]string{"path": path})
	w := call(a, "POST", "/api/open", string(body))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	b := sharedServer(t, root)
	if duplicate := call(b, "POST", "/api/open", string(body)); duplicate.Code != 409 {
		t.Fatal("second build requeued an active real demo", duplicate.Code, duplicate.Body.String())
	}
	deadline := time.Now().Add(time.Minute)
	for time.Now().Before(deadline) {
		entries := listedEntries(t, b)
		if len(entries) != 1 {
			t.Fatal("shared import disappeared", entries)
		}
		st := entries[0]
		if st.Status == "error" {
			t.Fatal("shared parser failed", st.Message)
		}
		if st.Status == "ready" {
			if result := call(b, "GET", fmtRoundURL(st.ID, st.Rounds[0]), ""); result.Code != 200 {
				t.Fatal("other build cannot play completed import", result.Code)
			}
			t.Logf("other build observed %s ready with %d rounds and played round %d", st.Name, len(st.Rounds), st.Rounds[0])
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("shared real demo parsing timed out")
}

func listedEntries(t *testing.T, s *Server) []State {
	t.Helper()
	w := call(s, "GET", "/api/library", "")
	var entries []State
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &entries) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return entries
}

func TestSharedLibraryChangesAndLiveImports(t *testing.T) {
	root := t.TempDir()
	a := sharedServer(t, root)
	b := sharedServer(t, root)
	seedNamedReplay(t, a, State{ID: "shared", Name: "shared.dem", AliasName: "original", Status: "ready"})
	if got := listedEntries(t, b); len(got) != 1 || got[0].AliasName != "original" {
		t.Fatal("other build cannot see newly committed entry", got)
	}
	if w := call(b, "POST", "/api/rename", `{"id":"shared","alias_name":"renamed"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if got := listedEntries(t, a); len(got) != 1 || got[0].AliasName != "renamed" {
		t.Fatal("rename not refreshed", got)
	}
	if w := call(b, "POST", "/api/remove", `{"id":"shared"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if got := listedEntries(t, a); len(got) != 0 {
		t.Fatal("deleted entry remained in other build", got)
	}
	a.working = true // Keep a real published job queued while the other build refreshes.
	w := uploadFiles(t, a, []testUpload{{"pending.dem", []byte("test source")}})
	if w.Code != 200 || len(a.queue) != 1 {
		t.Fatal(w.Code, w.Body.String())
	}
	job := a.queue[0]
	c := sharedServer(t, root)
	if got := listedEntries(t, c); len(got) != 1 || got[0].Status != "queued" {
		t.Fatal("another build treated active import as interrupted", got)
	}
	if _, err := os.Stat(job.path); err != nil {
		t.Fatal("another build deleted active input", err)
	}
	for _, route := range []string{"/api/remove", "/api/rename"} {
		w := call(c, "POST", route, `{"id":"`+job.state.ID+`","alias_name":"collision"}`)
		if w.Code != 409 {
			t.Fatal("foreign live import could be mutated", route, w.Code)
		}
	}
	// The owning build may still rename its queued item and preserve the alias.
	if w := call(a, "POST", "/api/rename", `{"id":"`+job.state.ID+`","alias_name":"owned"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	a.wg.Add(1)
	a.runQueue(context.Background()) // Invalid fixture becomes a recoverable error.
	if got := listedEntries(t, b); len(got) != 1 || got[0].Status != "error" || got[0].AliasName != "owned" {
		t.Fatal("terminal state not shared", got)
	}
}

func TestSharedConcurrentDeduplication(t *testing.T) {
	root := t.TempDir()
	a, b := sharedServer(t, root), sharedServer(t, root)
	a.working, b.working = true, true
	jobs := make([]importJob, 2)
	for i, s := range []*Server{a, b} {
		var err error
		jobs[i], err = s.prepareJob("source.dem", "same.dem", "source.dem", 1, false)
		if err != nil {
			t.Fatal(err)
		}
	}
	if got := listedEntries(t, a); len(got) != 0 {
		t.Fatal("staged uploads leaked into shared library", got)
	}
	var wg sync.WaitGroup
	for i, s := range []*Server{a, b} {
		wg.Add(1)
		go func(i int, s *Server) {
			defer wg.Done()
			if _, err := s.enqueueUnique([]importJob{jobs[i]}); err != nil {
				t.Error(err)
			}
		}(i, s)
	}
	wg.Wait()
	if len(a.queue)+len(b.queue) != 1 || len(listedEntries(t, a)) != 1 || len(listedEntries(t, b)) != 1 {
		t.Fatal("same file was queued by two builds")
	}
}

func TestSharedStoreRecoveryAndLegacyReader(t *testing.T) {
	root := t.TempDir()
	legacy, err := newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer legacy.Close()
	seedNamedReplay(t, legacy, State{ID: "legacy", Name: "legacy.dem", Status: "ready"})
	modern := sharedServer(t, root)
	if got := listedEntries(t, modern); len(got) != 1 {
		t.Fatal("legacy lifetime lock prevented read-only launch", got)
	}
	if w := call(modern, "POST", "/api/rename", `{"id":"legacy","alias_name":"blocked"}`); w.Code != 503 {
		t.Fatal("new build ignored old build's exclusive lock", w.Code)
	}
	legacy.Close()
	if w := call(modern, "POST", "/api/rename", `{"id":"legacy","alias_name":"available"}`); w.Code != 200 {
		t.Fatal("shared writer did not recover after legacy exit", w.Body.String())
	}
	if old, err := newAt(root); err == nil {
		old.Close()
		t.Fatal("legacy exclusive writer was allowed to start over live shared writers")
	}
	owner := sharedServer(t, root)
	owner.working = true
	w := uploadFiles(t, owner, []testUpload{{"interrupted.dem", []byte("temporary source")}})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	id := owner.queue[0].state.ID
	owner.Close() // Releases the OS lease; pending jobs on disk are now abandoned.
	entries := listedEntries(t, modern)
	for _, entry := range entries {
		if entry.ID == id && entry.Status != "error" {
			t.Fatal("abandoned job not recovered", entry)
		}
	}
	if _, err := os.Stat(filepath.Join(root, id, "source.dem")); !os.IsNotExist(err) {
		t.Fatal("abandoned owned input not cleaned up", err)
	}
}
