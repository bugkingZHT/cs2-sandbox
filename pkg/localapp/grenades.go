package localapp

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

type grenadeRequest struct {
	DemoIDs         []string `json:"demoIds"`
	Side            string   `json:"side"`
	Radius          float64  `json:"radius"`
	HeightTolerance float64  `json:"heightTolerance"`
}

type grenadeThrow struct {
	DemoID        string       `json:"demoId"`
	DemoName      string       `json:"demoName"`
	Round         int          `json:"round"`
	EntityID      int          `json:"entityId"`
	Thrower       string       `json:"thrower"`
	FrameID       int          `json:"frameId"`
	TimeMs        int64        `json:"timeMs"`
	Tick          int          `json:"tick"`
	Landing       entity.Point `json:"landing"`
	LandingSource string       `json:"landingSource"`
	URL           string       `json:"url"`
	side          string
	kind          string
}
type grenadeCluster struct {
	Count       int            `json:"count"`
	Center      entity.Point   `json:"center"`
	Occurrences []grenadeThrow `json:"occurrences"`
}
type grenadeGroup struct {
	Map         string           `json:"map"`
	Side        string           `json:"side"`
	Kind        string           `json:"kind"`
	TotalThrows int              `json:"totalThrows"`
	Top10       []grenadeCluster `json:"top10"`
}
type grenadeReport struct {
	Radius          float64        `json:"radius"`
	HeightTolerance float64        `json:"heightTolerance"`
	Method          string         `json:"method"`
	Groups          []grenadeGroup `json:"groups"`
	Warnings        []string       `json:"warnings"`
}

func grenadeKind(n int) string {
	switch n {
	case 502, 503:
		return "fire"
	case 504:
		return "flash"
	case 505:
		return "smoke"
	case 506:
		return "he"
	}
	return ""
}

// Deduplicate by projectile identity within each round, never by player or frame.
// First explosion is the effect location. A disappearing flying projectile uses
// its final recorded trajectory endpoint (or last observed position) explicitly.
func extractGrenades(round entity.ReplayRound, st State, baseURL string) ([]grenadeThrow, int, int) {
	type track struct {
		throw      grenadeThrow
		exploded   bool
		seenFlying bool
		lastFrame  int
	}
	tracks := map[int]*track{}
	all := []*track{}
	// Include the whole round roster, including players absent from metadata.
	playerIDs := map[int]bool{}
	for _, player := range st.Meta.ServerPlayer {
		playerIDs[player.ID] = true
	}
	for _, frame := range round.Frames {
		for id := range frame.Players {
			playerIDs[id] = true
		}
	}
	roster := make([]int, 0, len(playerIDs))
	for id := range playerIDs {
		roster = append(roster, id)
	}
	sort.Ints(roster)
	for i, f := range round.Frames {
		for id, p := range f.Projectiles {
			kind := grenadeKind(int(p.Type))
			if kind == "" {
				continue
			}
			t := tracks[id]
			if t == nil || i > t.lastFrame+1 || (t.exploded && !p.IsExploded) {
				side := ""
				switch f.Players[p.ThrowerID].Team {
				case 2:
					side = "T"
				case 3:
					side = "CT"
				}
				q := url.Values{"demo_uuid": {st.Meta.UUID}, "round": {strconv.Itoa(round.Round)}, "frameId": {strconv.Itoa(i)}, "grenadeId": {strconv.Itoa(id)}}
				hidden := []string{}
				for _, playerID := range roster {
					if playerID != p.ThrowerID {
						hidden = append(hidden, strconv.Itoa(playerID))
					}
				}
				q.Set("hidePlayers", strings.Join(hidden, ","))
				t = &track{throw: grenadeThrow{DemoID: st.ID, DemoName: st.Name, Round: round.Round, EntityID: id, Thrower: p.ThrowerName, FrameID: i, TimeMs: f.TimeMs, Tick: f.Tick, side: side, kind: kind, URL: baseURL + "/replayer?" + q.Encode()}}
				tracks[id] = t
				all = append(all, t)
			}
			t.lastFrame = i
			if !p.IsExploded {
				t.seenFlying = true
			}
			if t.exploded {
				continue
			}
			t.throw.Landing = entity.Point{X: p.X, Y: p.Y, Z: p.Z}
			t.throw.LandingSource = "last-observed"
			if p.IsExploded {
				t.exploded = true
				t.throw.LandingSource = "effect"
			} else if len(p.Trajectory) > 0 {
				t.throw.Landing = p.Trajectory[len(p.Trajectory)-1]
				t.throw.LandingSource = "trajectory-end"
			}
		}
	}
	result := []grenadeThrow{}
	unknown, missingThrow := 0, 0
	for _, t := range all {
		// Inferno entities are separate from thrown fire projectiles, not extra throws.
		if !t.seenFlying {
			if t.throw.kind != "fire" {
				missingThrow++
			}
			continue
		}
		if t.throw.side == "" {
			unknown++
			continue
		}
		result = append(result, t.throw)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].FrameID != result[j].FrameID {
			return result[i].FrameID < result[j].FrameID
		}
		return result[i].EntityID < result[j].EntityID
	})
	return result, unknown, missingThrow
}

// Densest observed landing anchors a cluster; remove its members, then repeat.
// Fixed anchors prevent chained nearby points from swallowing distant sites.
func clusterGrenades(throws []grenadeThrow, radius, height float64) []grenadeCluster {
	remaining := append([]grenadeThrow(nil), throws...)
	clusters := []grenadeCluster{}
	near := func(a, b entity.Point) bool {
		return math.Hypot(a.X-b.X, a.Y-b.Y) <= radius && math.Abs(a.Z-b.Z) <= height
	}
	for len(remaining) > 0 && len(clusters) < 10 {
		best, count := 0, 0
		for i, a := range remaining {
			n := 0
			for _, b := range remaining {
				if near(a.Landing, b.Landing) {
					n++
				}
			}
			if n > count {
				best, count = i, n
			}
		}
		center := remaining[best].Landing
		cluster := grenadeCluster{Count: count, Center: center, Occurrences: []grenadeThrow{}}
		next := []grenadeThrow{}
		for _, t := range remaining {
			if near(center, t.Landing) {
				cluster.Occurrences = append(cluster.Occurrences, t)
			} else {
				next = append(next, t)
			}
		}
		clusters = append(clusters, cluster)
		remaining = next
	}
	return clusters
}

func (s *Server) grenadeSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		w.WriteHeader(405)
		return
	}
	var req grenadeRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32768))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		fail(w, err, 400)
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		fail(w, fmt.Errorf("请求必须是单个 JSON 对象"), 400)
		return
	}
	if req.Side != "T" && req.Side != "CT" && req.Side != "both" {
		fail(w, fmt.Errorf("side 必须是 T、CT 或 both"), 400)
		return
	}
	if req.Radius == 0 {
		req.Radius = 120
	}
	if req.HeightTolerance == 0 {
		req.HeightTolerance = 80
	}
	if len(req.DemoIDs) == 0 || len(req.DemoIDs) > 50 || req.Radius < 16 || req.Radius > 512 || req.HeightTolerance < 16 || req.HeightTolerance > 256 {
		fail(w, fmt.Errorf("请选择 1–50 场对局；radius 范围 16–512，heightTolerance 范围 16–256"), 400)
		return
	}
	ids := map[string]bool{}
	states := []State{}
	s.mu.Lock()
	for _, id := range req.DemoIDs {
		st, ok := s.library[id]
		if !ok || st.Status != "ready" || st.Meta == nil || st.Meta.MapName == "" {
			s.mu.Unlock()
			fail(w, fmt.Errorf("对局 %s 不存在、尚未解析完成或缺少地图信息", id), 400)
			return
		}
		if !ids[id] {
			states = append(states, st)
			ids[id] = true
		}
	}
	s.mu.Unlock()
	sort.Slice(states, func(i, j int) bool { return states[i].ID < states[j].ID })
	report := grenadeReport{Radius: req.Radius, HeightTolerance: req.HeightTolerance, Method: "densest-anchor: XY radius + absolute Z tolerance; one throw per round/entity; top10 per map/side/kind", Groups: []grenadeGroup{}, Warnings: []string{}}
	type key struct{ Map, Side, Kind string }
	groups := map[key][]grenadeThrow{}
	for _, st := range states {
		rounds := append([]int(nil), st.Rounds...)
		sort.Ints(rounds)
		for _, n := range rounds {
			if r.Context().Err() != nil {
				return
			}
			data, err := os.ReadFile(filepath.Join(s.root, st.ID, strconv.Itoa(n)+".json"))
			var round entity.ReplayRound
			if err == nil {
				err = json.Unmarshal(data, &round)
			}
			if err != nil || round.Round != n || round.UUID != st.Meta.UUID || len(round.Frames) == 0 {
				fail(w, fmt.Errorf("%s 第 %d 回合缓存不可用，请重新解析", st.Name, n), 409)
				return
			}
			throws, unknown, missing := extractGrenades(round, st, "http://"+r.Host)
			if unknown > 0 {
				fail(w, fmt.Errorf("%s 第 %d 回合缺少投掷时阵营，旧缓存需用新版重新解析后分析（不能使用静态阵营推断换边）", st.Name, n), 409)
				return
			}
			if missing > 0 {
				report.Warnings = append(report.Warnings, fmt.Sprintf("%s 第 %d 回合有 %d 个道具缺少出手帧，未计入", st.Name, n, missing))
			}
			for _, t := range throws {
				if req.Side != "both" && req.Side != t.side {
					continue
				}
				// Fragment authenticates new tabs without sending the token in the HTTP URL.
				t.URL += "#" + s.token
				k := key{st.Meta.MapName, t.side, t.kind}
				groups[k] = append(groups[k], t)
			}
		}
	}
	for k, ts := range groups {
		report.Groups = append(report.Groups, grenadeGroup{Map: k.Map, Side: k.Side, Kind: k.Kind, TotalThrows: len(ts), Top10: clusterGrenades(ts, req.Radius, req.HeightTolerance)})
	}
	sort.Slice(report.Groups, func(i, j int) bool {
		a, b := report.Groups[i], report.Groups[j]
		if a.Map != b.Map {
			return a.Map < b.Map
		}
		if a.Side != b.Side {
			return a.Side < b.Side
		}
		return a.Kind < b.Kind
	})
	report.Warnings = append(report.Warnings, "落点优先使用首次生效坐标；trajectory-end / last-observed 是估计落点。闪光弹按爆闪位置统计。timeMs 为缓存时间轴毫秒，链接按出手帧定位。频次不代表战术效果。")
	send(w, report)
}
