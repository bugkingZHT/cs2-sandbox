package localapp

import (
	"encoding/json"
	"fmt"
	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func fmtRoundURL(id string, n int) string { return fmt.Sprintf("/api/round?id=%s&n=%d", id, n) }

func call(s *Server, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "http://127.0.0.1:8000"+path, strings.NewReader(body))
	r.Header.Set("X-Local-Token", s.Token())
	w := httptest.NewRecorder()
	s.Handler(fstest.MapFS{"index.html": {Data: []byte("local player")}}).ServeHTTP(w, r)
	return w
}
func TestLocalBoundary(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	h := s.Handler(fstest.MapFS{})
	for _, tt := range []struct{ host, origin, token string }{{"evil.test:8000", "", s.Token()}, {"127.0.0.1:8000", "https://evil.test", s.Token()}, {"127.0.0.1:8000", "", ""}} {
		r := httptest.NewRequest("POST", "http://"+tt.host+"/api/open", strings.NewReader(`{"path":"C:\\test.dem"}`))
		r.Header.Set("Origin", tt.origin)
		r.Header.Set("X-Local-Token", tt.token)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusForbidden {
			t.Fatalf("request should be rejected: %d", w.Code)
		}
	}
	if w := call(s, "POST", "/api/open", `{"path":"relative.dem"}`); w.Code != 400 {
		t.Fatalf("relative path accepted: %d", w.Code)
	}
	if w := call(s, "GET", "/api/state", ""); w.Code != 200 {
		t.Fatalf("local session rejected: %d", w.Code)
	}
}
func TestRealDemo(t *testing.T) {
	path := os.Getenv("CS_DEMO_TEST_FILE")
	if path == "" {
		t.Skip("set CS_DEMO_TEST_FILE for real demo integration test")
	}
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	body, _ := json.Marshal(map[string]string{"path": path})
	start := time.Now()
	if w := call(s, "POST", "/api/open", string(body)); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var st State
	lastProgress, sawProgress := 0, false
	for time.Since(start) < 2*time.Minute {
		w := call(s, "GET", "/api/state", "")
		if err := json.Unmarshal(w.Body.Bytes(), &st); err != nil {
			t.Fatal(err)
		}
		if st.Progress < lastProgress || st.Progress > 100 {
			t.Fatalf("invalid progress: %+v", st)
		}
		lastProgress = st.Progress
		if st.Progress > 0 && st.Progress < 100 {
			sawProgress = true
		}
		var library []State
		json.Unmarshal(call(s, "GET", "/api/library", "").Body.Bytes(), &library)
		if len(library) != 1 || library[0].ID != st.ID {
			t.Fatal("active parse missing from library")
		}
		if st.Status == "ready" {
			break
		}
		if st.Status == "error" {
			t.Fatal(st.Message)
		}
		time.Sleep(100 * time.Millisecond)
	}
	if st.Status != "ready" || len(st.Rounds) < 3 || st.Meta == nil || len(st.Meta.ServerPlayer) < 10 {
		t.Fatalf("incomplete replay: %+v", st)
	}
	seen := map[int]bool{}
	if !sawProgress || st.Progress != 100 {
		t.Fatal("missing real parsing progress")
	}
	if st.Rounds[0] != 1 || len(st.Rounds) != len(st.Meta.RoundResults) {
		t.Fatal("unofficial or missing round")
	}
	total, maxBytes := 0, 0
	for _, n := range st.Rounds {
		if seen[n] {
			t.Fatalf("duplicate round %d", n)
		}
		seen[n] = true
		w := call(s, "GET", fmtRoundURL(st.ID, n), "")
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		if w.Body.Len() > maxBytes {
			maxBytes = w.Body.Len()
		}
		var round entity.ReplayRound
		if err = json.Unmarshal(w.Body.Bytes(), &round); err != nil {
			t.Fatal(err)
		}
		if len(round.Frames) == 0 {
			t.Fatalf("empty round %d", n)
		}
		for i, f := range round.Frames {
			if f.RoundTime.Phase == "freezetime" {
				t.Fatalf("freeze time leaked into round %d", n)
			}
			if f.Round != n {
				t.Fatalf("round mismatch: %d / %d", f.Round, n)
			}
			if i > 0 && f.TimeMs < round.Frames[i-1].TimeMs {
				t.Fatal("non-monotonic time")
			}
		}
		total += len(round.Frames)
	}
	t.Logf("map=%s rounds=%d frames=%d largest round=%.2f MB elapsed=%s", st.Meta.MapName, len(st.Rounds), total, float64(maxBytes)/1048576, time.Since(start))
	// Exercise the public skill endpoint on the real parser output, including side switches.
	body, _ = json.Marshal(grenadeRequest{DemoIDs: []string{st.ID}, Side: "both", Radius: 120, HeightTolerance: 80})
	summary := call(s, "POST", "/api/skills/grenades", string(body))
	if summary.Code != 200 {
		t.Fatal(summary.Body.String())
	}
	var report grenadeReport
	if err := json.Unmarshal(summary.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if len(report.Groups) == 0 {
		t.Fatal("real demo produced no grenade groups")
	}
	for _, g := range report.Groups {
		t.Logf("grenades map=%s side=%s kind=%s total=%d top1=%d clusters=%d", g.Map, g.Side, g.Kind, g.TotalThrows, g.Top10[0].Count, len(g.Top10))
		for _, c := range g.Top10 {
			for _, o := range c.Occurrences {
				var rr entity.ReplayRound
				json.Unmarshal(call(s, "GET", fmtRoundURL(st.ID, o.Round), "").Body.Bytes(), &rr)
				if o.FrameID < 0 || o.FrameID >= len(rr.Frames) {
					t.Fatal("invalid learning frame")
				}
				p, ok := rr.Frames[o.FrameID].Projectiles[o.EntityID]
				if !ok || p.IsExploded || rr.Frames[o.FrameID].TimeMs != o.TimeMs {
					t.Fatal("learning link does not locate throw")
				}
				want := 2
				if g.Side == "CT" {
					want = 3
				}
				if rr.Frames[o.FrameID].Players[p.ThrowerID].Team != want {
					t.Fatal("wrong throwing side")
				}
			}
		}
	}
	root := s.root
	s.Close()
	restarted, err := newAt(root)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	if got := restarted.library[st.ID]; got.Status != "ready" || got.SourcePath != path || len(got.Rounds) != len(st.Rounds) {
		t.Fatalf("restart lost replay: %+v", got)
	}
	for _, n := range st.Rounds {
		if w := call(restarted, "GET", fmtRoundURL(st.ID, n), ""); w.Code != 200 {
			t.Fatal("restart cannot play round", n)
		}
	}
	if w := call(s, "GET", "/api/round?id=stale&n=1", ""); w.Code != 409 {
		t.Fatal("stale replay allowed")
	}
}
