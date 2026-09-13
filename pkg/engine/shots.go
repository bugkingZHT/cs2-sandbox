package engine

import (
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/events"
	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

type shotSample struct {
	count int
	yaw   float32
}

// Playback selects the final frame at a given timestamp. Move shot events out
// of earlier, zero-duration snapshots so they are neither skipped nor duplicated.
func moveCoincidentShots(previous, current *entity.Frame) {
	if previous == nil || previous.Round != current.Round || previous.TimeMs != current.TimeMs {
		return
	}
	for id, earlier := range previous.Players {
		if earlier.ShotsFired == 0 {
			continue
		}
		latest, present := current.Players[id]
		if !present {
			continue
		}
		if latest.ShotsFired == 0 {
			latest.ShotYaw = earlier.ShotYaw
		}
		latest.ShotsFired += earlier.ShotsFired
		current.Players[id] = latest
		earlier.ShotsFired = 0
		earlier.ShotYaw = 0
		previous.Players[id] = earlier
	}
}

func (b *replayBuilder) recordShot(ev events.WeaponFire) {
	if ev.Shooter == nil || ev.Weapon == nil || b.currentRound <= 0 || (b.inFreezeTime && !b.resolveFreezeTime) {
		return
	}
	class := ev.Weapon.Class()
	if !(class >= common.EqClassPistols && class <= common.EqClassRifle) && ev.Weapon.Type != common.EqZeus {
		return // Knife swings and grenade throws are WeaponFire events too.
	}
	if b.pendingShots == nil {
		b.pendingShots = make(map[int]shotSample)
	}
	shot := b.pendingShots[ev.Shooter.UserID]
	shot.count++
	shot.yaw = ev.Shooter.ViewDirectionX()
	b.pendingShots[ev.Shooter.UserID] = shot
}
