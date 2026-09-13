package engine

import (
	"fmt"
	"os"
	"reflect"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/events"
	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

func TestRecordGunshots(t *testing.T) {
	b := &replayBuilder{currentRound: 1}
	human := &common.Player{UserID: 1}
	bot := &common.Player{UserID: 2, IsBot: true}
	for _, weapon := range []common.EquipmentType{common.EqAK47, common.EqRevolver, common.EqZeus} {
		b.recordShot(events.WeaponFire{Shooter: human, Weapon: common.NewEquipment(weapon)})
	}
	b.recordShot(events.WeaponFire{Shooter: bot, Weapon: common.NewEquipment(common.EqUSP)})
	for _, weapon := range []common.EquipmentType{common.EqKnife, common.EqBomb, common.EqHE, common.EqMolotov, common.EqUnknown} {
		b.recordShot(events.WeaponFire{Shooter: human, Weapon: common.NewEquipment(weapon)})
	}
	b.recordShot(events.WeaponFire{Shooter: human})
	b.recordShot(events.WeaponFire{Weapon: common.NewEquipment(common.EqAK47)})
	b.inFreezeTime = true
	b.recordShot(events.WeaponFire{Shooter: human, Weapon: common.NewEquipment(common.EqAK47)})
	b.inFreezeTime = false
	b.currentRound = 0
	b.recordShot(events.WeaponFire{Shooter: human, Weapon: common.NewEquipment(common.EqAK47)})
	if b.pendingShots[1].count != 3 || b.pendingShots[2].count != 1 {
		t.Fatalf("gunshots must be retained independently of buttons/bot status; utility and excluded phases must not count: %+v", b.pendingShots)
	}
}

func TestCoincidentShotFrames(t *testing.T) {
	first := entity.Frame{Round: 1, TimeMs: 100, Players: map[int]entity.PlayerFrame{1: {ShotsFired: 2, ShotYaw: 90}, 2: {ShotsFired: 1, ShotYaw: 45}}}
	last := entity.Frame{Round: 1, TimeMs: 100, Players: map[int]entity.PlayerFrame{1: {ShotsFired: 1, ShotYaw: 180}, 2: {}}}
	moveCoincidentShots(&first, &last)
	if first.Players[1].ShotsFired != 0 || first.Players[2].ShotsFired != 0 || last.Players[1].ShotsFired != 3 || last.Players[1].ShotYaw != 180 || last.Players[2].ShotYaw != 45 {
		t.Fatal("coincident snapshots lost, duplicated or changed shot aim")
	}
	for _, next := range []entity.Frame{{Round: 2, TimeMs: 100}, {Round: 1, TimeMs: 101}} {
		moveCoincidentShots(&last, &next)
		if last.Players[1].ShotsFired != 3 {
			t.Fatal("shot moved to another time or round")
		}
	}
}

func TestDemoShooting(t *testing.T) {
	path := os.Getenv("CS_SHOT_TEST_FILE")
	if path == "" {
		t.Skip("set CS_SHOT_TEST_FILE to a real demo")
	}
	for _, ratio := range []int{1, 4, 8} {
		t.Run(fmt.Sprintf("ratio_%d", ratio), func(t *testing.T) { checkDemoShooting(t, path, ratio) })
	}
}

func checkDemoShooting(t *testing.T, path string, ratio int) {
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	e := NewDemoEngine(EngineConfig{FrameRatio: ratio, RoundLimit: 2})
	defer e.Close()
	if err := e.InitParser(f); err != nil {
		t.Fatal(err)
	}
	type shot struct {
		round, tick, id int
		buttons         bool
		weapon          common.EquipmentType
	}
	var shots []shot
	unique := map[string]bool{}
	warnings := 0
	e.parser.RegisterEventHandler(func(ev events.ParserWarn) {
		if strings.Contains(ev.Message, "user command buttons") {
			warnings++
		}
	})
	e.parser.RegisterEventHandler(func(ev events.WeaponFire) {
		if ev.Shooter == nil || ev.Shooter.IsBot || ev.Weapon == nil || e.builder.currentRound < 1 || e.builder.currentRound > 2 || e.builder.inFreezeTime {
			return
		}
		class := ev.Weapon.Class()
		if (class < common.EqClassPistols || class > common.EqClassRifle) && ev.Weapon.Type != common.EqZeus {
			return
		}
		shots = append(shots, shot{e.builder.currentRound, e.parser.GameState().IngameTick(), ev.Shooter.UserID, ev.Shooter.IsPressingButton(common.ButtonAttack), ev.Weapon.Type})
		if ev.Weapon.Entity != nil {
			v, ok := ev.Weapon.Entity.PropertyValue("m_fLastShotTime")
			if ok && v.Any != nil {
				unique[fmt.Sprintf("%d/%d/%f", ev.Shooter.UserID, ev.Weapon.Entity.ID(), v.Float())] = true
			}
		}
	})
	if _, err := e.ExtractMetadata(); err != nil {
		t.Fatal(err)
	}
	rounds := map[int][]entity.Frame{}
	for {
		round, err := e.ParseNextRound(nil)
		if err != nil {
			t.Fatal(err)
		}
		if round == nil {
			break
		}
		rounds[round.Round] = round.Frames
	}
	noButtonAtEvent, noButtonAtSample, deadAtSample, switched := 0, 0, 0, 0
	for _, s := range shots {
		if !s.buttons {
			noButtonAtEvent++
		}
		frames := rounds[s.round]
		i := sort.Search(len(frames), func(i int) bool { return frames[i].Tick >= s.tick })
		if i == len(frames) {
			continue
		}
		p := frames[i].Players[s.id]
		if !slices.Contains(p.Buttons, uint64(1)) {
			noButtonAtSample++
		}
		if !p.Alive {
			deadAtSample++
		}
		if p.ActiveWeapon != s.weapon {
			switched++
		}
	}
	if len(shots) == 0 {
		t.Fatal("no human gunshots found")
	}
	if len(unique) != len(shots) {
		t.Fatalf("weapon timestamp was dispatched repeatedly: %d events, %d unique shots", len(shots), len(unique))
	}
	want, got := map[[2]int]int{}, map[[2]int]int{}
	for _, shot := range shots {
		// A player can disconnect in the same packet as their final shot. Only
		// compare events for players still present in the corresponding output.
		frames := rounds[shot.round]
		i := sort.Search(len(frames), func(i int) bool { return frames[i].Tick >= shot.tick })
		if i == len(frames) {
			continue
		}
		if _, present := frames[i].Players[shot.id]; !present {
			continue
		}
		want[[2]int{shot.round, shot.id}]++
	}
	for round, frames := range rounds {
		for i, frame := range frames {
			for id, player := range frame.Players {
				if !e.builder.playerRegistry[id].IsBot && player.ShotsFired > 0 {
					if i+1 < len(frames) && frames[i+1].TimeMs == frame.TimeMs {
						t.Errorf("shot sample at %dms is hidden by another frame with the same playback time", frame.TimeMs)
					}
					got[[2]int{round, id}] += player.ShotsFired
				}
			}
		}
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("sampled shots lost or leaked between players/rounds: got %v, want %v", got, want)
	}
	t.Logf("human gunshots=%d, no attack button at event=%d, no attack button in next sample=%d, dead in next sample=%d, switched weapon=%d", len(shots), noButtonAtEvent, noButtonAtSample, deadAtSample, switched)
	t.Logf("unique weapon last-shot timestamps=%d, button decode warnings=%d", len(unique), warnings)
}
