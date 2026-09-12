package localapp

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

type testUpload struct {
	name string
	data []byte
}

func zipData(t *testing.T, entries []testUpload) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	for _, entry := range entries {
		w, err := z.Create(entry.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(entry.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func uploadFiles(t *testing.T, s *Server, files []testUpload) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for _, file := range files {
		part, err := mw.CreateFormFile("files", file.name)
		if err != nil {
			t.Fatal(err)
		}
		part.Write(file.data)
	}
	mw.Close()
	r := httptest.NewRequest("POST", "http://127.0.0.1:8000/api/import", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	r.Header.Set("X-Local-Token", s.Token())
	w := httptest.NewRecorder()
	s.Handler(fstest.MapFS{}).ServeHTTP(w, r)
	return w
}

func TestArchiveRecursiveExtractionAndIsolation(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	staging := t.TempDir()
	nested := zipData(t, []testUpload{{"deep/game.DEM", []byte("nested")}})
	archive := zipData(t, []testUpload{
		{"one/same.dem", []byte("first")}, {"two/same.dem", []byte("second")},
		{"../../escape.dem", []byte("safe")}, {"C:\\outside.dem", []byte("drive")},
		{"folder/nested.ZIP", nested}, {"readme.txt", []byte("ignore")},
	})
	path := filepath.Join(staging, "batch.zip")
	os.WriteFile(path, archive, 0600)
	var jobs []importJob
	if err := s.collectArchive(context.Background(), path, "batch.zip", staging, 0, &archiveBudget{}, &jobs); err != nil {
		t.Fatal(err)
	}
	if len(jobs) != 5 {
		t.Fatalf("expected all nested demos: %d", len(jobs))
	}
	for i, expected := range []string{"first", "second", "safe", "drive", "nested"} {
		job := jobs[i]
		if job.path != filepath.Join(s.root, job.state.ID, "source.dem") {
			t.Fatal("untrusted extraction destination", job.path)
		}
		data, err := os.ReadFile(job.path)
		if err != nil || string(data) != expected {
			t.Fatal("content overwritten", err)
		}
		if !strings.Contains(job.state.SourcePath, "batch.zip / ") {
			t.Fatal("lost archive provenance")
		}
	}
	if jobs[0].state.ID == jobs[1].state.ID {
		t.Fatal("duplicate filenames collide")
	}
	if err := s.collectArchive(context.Background(), path, "batch.zip", staging, maxArchiveDepth+1, &archiveBudget{}, &jobs); err == nil {
		t.Fatal("unbounded nesting")
	}
	if err := s.collectArchive(context.Background(), path, "batch.zip", staging, 0, &archiveBudget{bytes: maxExpandedBytes}, &jobs); err == nil {
		t.Fatal("unbounded expansion")
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.collectArchive(canceled, path, "batch.zip", staging, 0, &archiveBudget{}, &jobs); err == nil {
		t.Fatal("cancellation ignored")
	}
}

func TestBatchQueueContinuesAfterErrors(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	// Hold the worker to verify that another batch can be appended while busy.
	s.working = true
	archive := zipData(t, []testUpload{{"a/one.dem", []byte("bad demo")}, {"b/two.DEM", []byte("bad demo")}})
	w := uploadFiles(t, s, []testUpload{{"broken.zip", []byte("bad zip")}, {"games.ZIP", archive}})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = uploadFiles(t, s, []testUpload{{"direct.dem", []byte("bad demo")}})
	if w.Code != 200 {
		t.Fatal("append to queue failed", w.Body.String())
	}
	if len(s.queue) != 3 {
		t.Fatalf("queue size %d", len(s.queue))
	}
	if w := call(s, "POST", "/api/remove", `{"id":"`+s.queue[0].state.ID+`"}`); w.Code != 409 {
		t.Fatal("queued source deleted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.wg.Add(1)
	go s.runQueue(ctx)
	s.wg.Wait()
	if len(s.library) != 4 {
		t.Fatalf("ZIP not replaced by individual demos: %+v", s.library)
	}
	for id, st := range s.library {
		if st.Status != "error" || st.Message == "" {
			t.Fatalf("queue stopped on a bad file: %+v", st)
		}
		for _, ext := range []string{".zip", ".dem"} {
			if _, err := os.Stat(filepath.Join(s.root, id, "source"+ext)); !os.IsNotExist(err) {
				t.Fatal("temporary input retained")
			}
		}
	}
	if s.working || len(s.queue) != 0 {
		t.Fatal("queue did not drain")
	}
	root := s.root
	s.Close()
	restarted, err := newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	if len(restarted.library) != 4 {
		t.Fatal("failure records not persisted")
	}
}

func TestImportValidationAndEmptyZip(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, files := range [][]testUpload{nil, {{"valid.dem", []byte("demo")}, {"invalid.txt", []byte("bad")}}} {
		if w := uploadFiles(t, s, files); w.Code != 400 {
			t.Fatal("invalid batch accepted", w.Code)
		}
	}
	if len(s.library) != 0 {
		t.Fatal("partial rejected batch published")
	}
	dirs, _ := os.ReadDir(s.root)
	for _, dir := range dirs {
		if dir.IsDir() {
			t.Fatal("rejected upload leaked staging files", dir.Name())
		}
	}
	if w := call(s, "GET", "/api/import", ""); w.Code != 405 {
		t.Fatal("GET accepted")
	}
	if w := uploadFiles(t, s, []testUpload{{"empty.zip", zipData(t, []testUpload{{"folder/readme.txt", []byte("no demos")}})}}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	s.wg.Wait()
	for _, st := range s.library {
		if st.Status != "error" || !strings.Contains(st.Message, "没有找到") {
			t.Fatal(st)
		}
	}
}

func TestQueuedImportRecovery(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	s.working = true
	if w := uploadFiles(t, s, []testUpload{{"waiting.dem", []byte("queued")}}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	root := s.root
	s.Close()
	restarted, err := newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	for id, st := range restarted.library {
		if st.Status != "error" || !strings.Contains(st.Message, "中断") {
			t.Fatal(st)
		}
		if _, err := os.Stat(filepath.Join(root, id, "source.dem")); !os.IsNotExist(err) {
			t.Fatal("interrupted upload copy not cleaned")
		}
	}
}

// Optional real-parser integration: one direct Demo and a ZIP containing the
// same Demo inside multiple directories must each produce an independent replay.
func TestRealBatchImport(t *testing.T) {
	path := os.Getenv("CS_DEMO_TEST_FILE")
	if path == "" {
		t.Skip("set CS_DEMO_TEST_FILE")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	w := uploadFiles(t, s, []testUpload{{"direct.dem", data}, {"batch.zip", zipData(t, []testUpload{{"match/rounds/archived.dem", data}})}})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	start := time.Now()
	for time.Since(start) < 3*time.Minute {
		var states []State
		json.Unmarshal(call(s, "GET", "/api/library", "").Body.Bytes(), &states)
		pending := false
		for _, st := range states {
			if isPending(st.Status) {
				pending = true
			}
			if st.Status == "error" {
				t.Fatal(st.Message)
			}
		}
		if !pending {
			if len(states) != 2 {
				t.Fatalf("expected two replays: %+v", states)
			}
			for _, st := range states {
				if st.Status != "ready" || len(st.Rounds) == 0 || st.Meta == nil {
					t.Fatal(st)
				}
			}
			t.Logf("two real replays completed in %s", time.Since(start))
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("batch parse timed out")
}
