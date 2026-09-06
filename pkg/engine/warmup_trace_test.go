package engine

import (
	demoinfocs "github.com/bugkingzht/cs-demobox/pkg/demoinfocs"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/events"
	"os"
	"testing"
)

func TestTraceMatchStart(t *testing.T) {
	path := os.Getenv("CS_DEMO_TRACE_FILE")
	if path == "" {
		t.Skip("optional match-start diagnostic")
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	p := demoinfocs.NewParser(f)
	defer p.Close()
	report := func(name string) {
		g := p.GameState()
		t.Logf("%s tick=%d warmup=%v started=%v freeze=%v rounds=%d", name, g.IngameTick(), g.IsWarmupPeriod(), g.IsMatchStarted(), g.IsFreezetimePeriod(), g.TotalRoundsPlayed())
	}
	p.RegisterEventHandler(func(e events.RoundStart) { report("round_start") })
	p.RegisterEventHandler(func(e events.RoundEnd) { report("round_end") })
	p.RegisterEventHandler(func(e events.RoundFreezetimeEnd) { report("freeze_end") })
	p.RegisterEventHandler(func(e events.MatchStartedChanged) { report("match_started") })
	p.RegisterEventHandler(func(e events.IsWarmupPeriodChanged) { report("warmup_changed") })
	for i := 0; i < 40000; i++ {
		more, err := p.ParseNextFrame()
		if err != nil {
			t.Fatal(err)
		}
		if !more {
			break
		}
	}
}
