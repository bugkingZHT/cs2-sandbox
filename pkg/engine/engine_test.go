package engine

import (
	"os"
	"path/filepath"
	"testing"
)

// Validate the native round iterator without accumulating a match in memory or
// writing a multi-gigabyte JSON artifact into the user's checkout.
func TestParseDemoFile(t *testing.T) {
	path := os.Getenv("CS_DEMO_TEST_FILE")
	if path == "" {
		path = filepath.Join("..", "..", "test", "manifests", "test.dem")
	}
	f, err := os.Open(path)
	if os.IsNotExist(err) && os.Getenv("CS_DEMO_TEST_FILE") == "" {
		t.Skip("no local demo fixture")
	}
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	e := NewDemoEngine(EngineConfig{ResolveFreezeTime: true, FrameRatio: 4})
	defer e.Close()
	if err = e.InitParser(f); err != nil {
		t.Fatal(err)
	}
	meta, err := e.ExtractMetadata()
	if err != nil {
		t.Fatal(err)
	}
	if meta.UUID == "" || meta.MapName == "" {
		t.Fatal("missing replay metadata")
	}
	rounds, frames := 0, 0
	buttonFrames := 0
	buttonPlayers := make(map[int]bool)
	buttonMasks := make(map[uint64]bool)
	for {
		round, err := e.ParseNextRound(nil)
		if err != nil {
			t.Fatal(err)
		}
		if round == nil {
			break
		}
		if round.Round > 0 && len(round.Frames) > 0 {
			rounds++
			frames += len(round.Frames)
			for _, frame := range round.Frames {
				for id, player := range frame.Players {
					if len(player.Buttons) > 0 {
						buttonFrames++
						buttonPlayers[id] = true
					}
					for _, mask := range player.Buttons {
						buttonMasks[mask] = true
					}
				}
			}
		}
	}
	meta, err = e.BackfillMeta(meta)
	if err != nil {
		t.Fatal(err)
	}
	if rounds == 0 || frames == 0 || len(meta.ServerPlayer) == 0 {
		t.Fatal("no playable rounds or players")
	}
	if buttonFrames == 0 {
		t.Fatal("no player button states exported for grenade analysis")
	}
	t.Logf("map=%s rounds=%d frames=%d buttonFrames=%d buttonPlayers=%d masks=%v", meta.MapName, rounds, frames, buttonFrames, len(buttonPlayers), buttonMasks)
}
