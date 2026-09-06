package localapp

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

func TestGrenadeExtraction(t *testing.T) {
	st := State{ID: "one", Meta: &entity.ReplayMeta{UUID: "uuid", ServerPlayer: []entity.PlayerInfo{{ID: 2}, {ID: 9}, {ID: 4}}}}
	p := entity.ProjectileFrame{EntityID: 7, ThrowerID: 2, Type: common.EqSmoke, X: 100}
	frame := func(p entity.ProjectileFrame, side int) entity.Frame {
		return entity.Frame{Players: map[int]entity.PlayerFrame{2: {Team: side}}, Projectiles: map[int]entity.ProjectileFrame{7: p}}
	}
	exploded := p
	exploded.X = 110
	exploded.IsExploded = true
	round := entity.ReplayRound{Round: 1, Frames: []entity.Frame{frame(p, 2), frame(exploded, 2), frame(exploded, 2), {}, frame(p, 3), frame(exploded, 3)}}
	round.Frames[5].Players[6] = entity.PlayerFrame{Team: 3}
	ts, unknown, missing := extractGrenades(round, st, "http://127.0.0.1:8000")
	if len(ts) != 2 || unknown != 0 || missing != 0 || ts[0].side != "T" || ts[1].side != "CT" || ts[1].FrameID != 4 || ts[0].Landing.X != 110 || ts[0].LandingSource != "effect" {
		t.Fatalf("incorrect extraction: %+v %d %d", ts, unknown, missing)
	}
	for _, occurrence := range ts {
		link, err := url.Parse(occurrence.URL)
		if err != nil || link.Query().Get("hidePlayers") != "4,6,9" {
			t.Fatalf("learning link must hide the complete roster except the thrower: %s", occurrence.URL)
		}
	}
	round.Frames[0].Players[2] = entity.PlayerFrame{}
	_, unknown, _ = extractGrenades(round, st, "")
	if unknown != 1 {
		t.Fatal("legacy side must not be inferred")
	}
}

func TestGrenadeClusters(t *testing.T) {
	ts := []grenadeThrow{}
	for _, p := range []entity.Point{{X: 0}, {X: 90}, {X: 180}, {X: 270}, {X: 360}, {X: 0, Z: 200}} {
		ts = append(ts, grenadeThrow{Landing: p})
	}
	cs := clusterGrenades(ts, 100, 80)
	if len(cs) != 3 || cs[0].Count != 3 || cs[1].Count != 2 || cs[2].Count != 1 {
		t.Fatalf("chain or floor merged: %+v", cs)
	}
	for _, c := range cs {
		if c.Count != len(c.Occurrences) {
			t.Fatal("count mismatch")
		}
	}
}

func TestGrenadeSummaryHTTP(t *testing.T) {
	s, err := newAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, id := range []string{"a", "b", "c"} {
		mapName := "de_ancient"
		if id == "c" {
			mapName = "de_nuke"
		}
		st := State{ID: id, Name: id, Status: "ready", Rounds: []int{1, 13}, Meta: &entity.ReplayMeta{UUID: id, MapName: mapName}}
		s.library[id] = st
		os.Mkdir(filepath.Join(s.root, id), 0700)
		for _, n := range st.Rounds {
			side := 2
			if n == 13 {
				side = 3
			}
			p := entity.ProjectileFrame{EntityID: 5, Type: common.EqSmoke, ThrowerID: 1, X: 100}
			f := entity.Frame{Round: n, Players: map[int]entity.PlayerFrame{1: {Team: side}}, Projectiles: map[int]entity.ProjectileFrame{5: p}}
			r := entity.ReplayRound{UUID: id, Round: n, Frames: []entity.Frame{f}}
			if err := writeJSONAtomic(filepath.Join(s.root, id, strconv.Itoa(n)+".json"), r); err != nil {
				t.Fatal(err)
			}
		}
	}
	w := call(s, "POST", "/api/skills/grenades", `{"demoIds":["a","a","b","c"],"side":"both"}`)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var report grenadeReport
	json.Unmarshal(w.Body.Bytes(), &report)
	if len(report.Groups) != 4 {
		t.Fatalf("maps/sides not separated: %+v", report.Groups)
	}
	for _, g := range report.Groups {
		want := 2
		if g.Map == "de_nuke" {
			want = 1
		}
		if g.TotalThrows != want || g.Top10[0].Count != want {
			t.Fatal("duplicate demos counted or matches not combined")
		}
		for _, o := range g.Top10[0].Occurrences {
			u, _ := url.Parse(o.URL)
			if u.Query().Get("grenadeId") != "5" || u.Query().Get("frameId") != "0" || u.Fragment != s.Token() {
				t.Fatal("invalid learning link")
			}
		}
	}
	for _, body := range []string{`{"demoIds":[],"side":"T"}`, `{"demoIds":["a"],"side":"bad"}`, `{"demoIds":["a"],"side":"T","radius":-1}`, `{"demoIds":["missing"],"side":"T"}`, `{"demoIds":["a"],"side":"T"} {}`} {
		if w := call(s, "POST", "/api/skills/grenades", body); w.Code != 400 {
			t.Fatalf("invalid request accepted: %s", body)
		}
	}
	if w := call(s, "GET", "/api/skills/grenades", ""); w.Code != 405 {
		t.Fatal("GET summary allowed")
	}
	if w := call(s, "GET", "/skills", ""); w.Code != 200 {
		t.Fatal("skills refresh failed")
	}
	legacy := entity.ReplayRound{UUID: "a", Round: 1, Frames: []entity.Frame{{Projectiles: map[int]entity.ProjectileFrame{1: {Type: common.EqSmoke}}}}}
	writeJSONAtomic(filepath.Join(s.root, "a", "1.json"), legacy)
	if w := call(s, "POST", "/api/skills/grenades", `{"demoIds":["a"],"side":"CT"}`); w.Code != 409 || !strings.Contains(w.Body.String(), "重新解析") {
		t.Fatal("legacy data silently accepted")
	}
}
