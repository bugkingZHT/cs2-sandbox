package localapp

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

func TestPersistentLibrary(t *testing.T) {
	root := t.TempDir()
	s, err := newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if other, err := newAt(root); err == nil {
		other.Close()
		t.Fatal("second writer acquired store")
	}
	entry := State{
		ID: "saved-replay", Name: "saved-replay", Status: "ready", Rounds: []int{1},
		Meta: &entity.ReplayMeta{UUID: "saved-replay", MapName: "de_ancient", FileName: "saved-replay"},
	}
	dir := filepath.Join(root, entry.ID)
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "1.json"), []byte(`{"uuid":"saved-replay","round":1,"frames":[{"round":1,"timeMs":0}]}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := s.persist(entry); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "original.dem")
	if err := os.WriteFile(source, []byte("source untouched"), 0600); err != nil {
		t.Fatal(err)
	}
	entry.SourcePath = source
	if err := s.persist(entry); err != nil {
		t.Fatal("atomic overwrite", err)
	}
	s.Close()
	second, err := newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	if second.Token() == s.Token() {
		t.Fatal("session token persisted")
	}
	got := second.library[entry.ID]
	if got.Status != "ready" || got.Meta.FileName != "saved-replay" || got.SourcePath != source {
		t.Fatalf("lost metadata: %+v", got)
	}
	if w := call(second, "GET", fmtRoundURL(entry.ID, 1), ""); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := call(second, "POST", "/api/remove", `{"id":"`+entry.ID+`"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	second.Close()
	third, err := newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer third.Close()
	if len(third.library) != 0 {
		t.Fatal("deleted replay returned after restart")
	}
	if data, err := os.ReadFile(source); err != nil || string(data) != "source untouched" {
		t.Fatal("source changed")
	}
}

func TestStoreRecovery(t *testing.T) {
	root := t.TempDir()
	for _, id := range []string{"interrupted", "missing", "corrupt", "mismatch"} {
		dir := filepath.Join(root, id)
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
		st := State{ID: id, Name: id, Status: "ready", Rounds: []int{1}, Meta: &entity.ReplayMeta{UUID: id}}
		if id == "interrupted" {
			st.Status = "parsing"
			st.SourcePath = "C:\\missing.dem"
		}
		if id == "mismatch" {
			st.ID = "../../outside"
		}
		if err := writeJSONAtomic(filepath.Join(dir, "entry.json"), st); err != nil {
			t.Fatal(err)
		}
		if id == "corrupt" {
			if err := os.WriteFile(filepath.Join(dir, "entry.json"), []byte("{"), 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
	s, err := newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if len(s.library) != 4 {
		t.Fatal("lost recoverable entries")
	}
	for id, st := range s.library {
		if st.ID != id || st.Status != "error" || st.Message == "" {
			t.Fatalf("invalid recovered entry: %+v", st)
		}
		if w := call(s, "GET", fmtRoundURL(id, 1), ""); w.Code != 409 {
			t.Fatal("incomplete cache served")
		}
	}
}

func TestDefaultStoreLocation(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows default data directory")
	}
	// os.UserCacheDir uses LOCALAPPDATA on Windows; never touch the real user library in tests.
	t.Setenv("LOCALAPPDATA", t.TempDir())
	base, err := os.UserCacheDir()
	if err != nil {
		t.Fatal(err)
	}
	s, err := New()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if s.root != filepath.Join(base, "cs2-sandbox") {
		t.Fatal("wrong user data directory", s.root)
	}
}
