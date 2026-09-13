package engine

import (
	"fmt"
	"os"
	"testing"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/events"
)

// This regression uses xxttggxg.dem, whose first two round-2 infernos have
// different entity IDs and lower Z positions than their flying grenades.
func TestDemoRoundTwoFireEffects(t *testing.T) {
	path := os.Getenv("CS_FIRE_TEST_FILE")
	if path == "" {
		t.Skip("set CS_FIRE_TEST_FILE to xxttggxg.dem")
	}
	for _, ratio := range []int{1, 4, 8} {
		t.Run(fmt.Sprintf("frame_ratio_%d", ratio), func(t *testing.T) {
			f, err := os.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			e := NewDemoEngine(EngineConfig{FrameRatio: ratio, RoundLimit: 2})
			defer e.Close()
			if err = e.InitParser(f); err != nil {
				t.Fatal(err)
			}
			want := map[string]common.EquipmentType{"Diff": common.EqMolotov, "damage": common.EqIncendiary}
			infernos := map[int]string{}
			e.parser.RegisterEventHandler(func(ev events.InfernoStart) {
				if e.builder.currentRound != 2 {
					return
				}
				thrower := ev.Inferno.Thrower()
				if thrower != nil && want[thrower.Name] != common.EqUnknown {
					infernos[ev.Inferno.Entity.ID()] = thrower.Name
				}
			})
			if _, err = e.ExtractMetadata(); err != nil {
				t.Fatal(err)
			}
			found := map[string]bool{}
			for {
				round, err := e.ParseNextRound(nil)
				if err != nil {
					t.Fatal(err)
				}
				if round == nil {
					break
				}
				if round.Round != 2 {
					continue
				}
				for id, name := range infernos {
					count := 0
					var firstTime, lastTime int64
					for _, frame := range round.Frames {
						proj, ok := frame.Projectiles[id]
						if !ok {
							continue
						}
						if proj.Type != want[name] || !proj.IsExploded || proj.TTL <= 0 {
							t.Fatalf("%s inferno %d at %d: type=%v exploded=%v TTL=%d", name, id, frame.TimeMs, proj.Type, proj.IsExploded, proj.TTL)
						}
						if count == 0 {
							firstTime = frame.TimeMs
						}
						lastTime = frame.TimeMs
						count++
					}
					if count < 2 {
						t.Fatalf("%s inferno has only %d visible frames", name, count)
					}
					wantDuration := int64(7000)
					if name == "damage" {
						wantDuration = 5500
					}
					span := lastTime - firstTime
					if span < wantDuration-150 || span > wantDuration+50 {
						t.Fatalf("%s fire lasts %dms, want approximately %dms", name, span, wantDuration)
					}
					found[name] = true
					t.Logf("%s: type=%v frames=%d visible span=%dms", name, want[name], count, lastTime-firstTime)
				}
			}
			for name := range want {
				if !found[name] {
					t.Errorf("missing %s fire", name)
				}
			}
		})
	}
}
