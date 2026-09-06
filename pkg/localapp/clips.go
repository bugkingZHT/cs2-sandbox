package localapp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
	"github.com/google/uuid"
)

// saveClip replaces the original cloud publish step with a local replay entry.
// This saves replay data, not a newly encoded Valve .dem file.
func (s *Server) saveClip(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		w.WriteHeader(405)
		return
	}
	var req struct {
		Meta   entity.ReplayMeta `json:"meta"`
		Frames []json.RawMessage `json:"frames"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<20)).Decode(&req); err != nil {
		fail(w, err, 400)
		return
	}
	if req.Meta.MapName == "" || len(req.Frames) == 0 {
		fail(w, fmt.Errorf("剪辑必须包含地图及回放帧"), 400)
		return
	}
	var previous float64
	for i, raw := range req.Frames {
		var frame struct {
			Round  int     `json:"round"`
			TimeMs float64 `json:"timeMs"`
		}
		if err := json.Unmarshal(raw, &frame); err != nil || frame.Round != 1 || frame.TimeMs < 0 || (i > 0 && frame.TimeMs < previous) {
			fail(w, fmt.Errorf("剪辑回合或时间轴无效"), 400)
			return
		}
		previous = frame.TimeMs
	}
	id := uuid.NewString()
	meta := req.Meta
	meta.UUID = id
	meta.UploaderUID = ""
	meta.OriginPath = ""
	meta.UploadTime = time.Now().UnixMilli()
	meta.TotalRounds = 1
	meta.TotalParsedFrames = len(req.Frames)
	meta.TotalRawFrames = len(req.Frames)
	meta.Status = 1
	meta.ParsingProgress = 100
	meta.ParsingStatus = "本地剪辑"
	meta.ScoreCT = 0
	meta.ScoreT = 0
	meta.RoundResults = nil
	if meta.FileName == "" {
		meta.FileName = "clip"
	}
	dir := filepath.Join(s.root, id)
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Mkdir(dir, 0700); err != nil {
		fail(w, err, 500)
		return
	}
	err := writeJSONAtomic(filepath.Join(dir, "1.json"), struct {
		UUID   string            `json:"uuid"`
		Round  int               `json:"round"`
		Frames []json.RawMessage `json:"frames"`
	}{id, 1, req.Frames})
	if err != nil {
		os.RemoveAll(dir)
		fail(w, err, 500)
		return
	}
	st := State{ID: id, Name: meta.FileName, Status: "ready", Progress: 100, Message: "本地剪辑", Rounds: []int{1}, Meta: &meta}
	if err := s.persist(st); err != nil {
		fail(w, err, 500)
		return
	}
	s.library[id] = st
	send(w, st)
}
