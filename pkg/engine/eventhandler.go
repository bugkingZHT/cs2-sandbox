package engine

import (
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/events"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

func (b *replayBuilder) registerEventHandlers() {
	// Register round start handler to increment round counter
	b.parser.RegisterEventHandler(func(e events.RoundStart) {
		b.currentRound++
		b.bombState = "carried"
		b.bombSite = ""
		b.activeProjectiles = make(map[int]entity.ProjectileFrame)
		b.currentKillEvents = make(map[int]entity.KillEvent)
		b.inFreezeTime = true // Enter freeze time at round start
	})

	// Register freeze time end handler
	b.parser.RegisterEventHandler(func(e events.RoundFreezetimeEnd) {
		b.inFreezeTime = false // Exit freeze time
	})

	// Smoke event handlers
	b.parser.RegisterEventHandler(func(e events.SmokeStart) {
		throwerName := ""
		throwerID := 0
		if e.Thrower != nil {
			throwerName = e.Thrower.Name
			throwerID = e.Thrower.UserID
		}
		b.activeProjectiles[e.GrenadeEntityID] = entity.ProjectileFrame{
			Type:        common.EqSmoke, // Explicitly set equipment type
			X:           e.Position.X,
			Y:           e.Position.Y,
			Z:           e.Position.Z,
			ThrowerName: throwerName,
			ThrowerID:   throwerID,
			EntityID:    e.GrenadeEntityID,
			IsExploded:  true,
			TTL:         entity.GetProjectileConfigByType(common.EqSmoke).DurationInMs,
		}
	})
	b.parser.RegisterEventHandler(func(e events.SmokeExpired) {
		delete(b.activeProjectiles, e.GrenadeEntityID)
	})

	// Decoy event handlers
	b.parser.RegisterEventHandler(func(e events.DecoyStart) {
		throwerName := ""
		throwerID := 0
		if e.Thrower != nil {
			throwerName = e.Thrower.Name
			throwerID = e.Thrower.UserID
		}
		b.activeProjectiles[e.GrenadeEntityID] = entity.ProjectileFrame{
			Type:        common.EqDecoy, // Explicitly set equipment type
			X:           e.Position.X,
			Y:           e.Position.Y,
			Z:           e.Position.Z,
			ThrowerName: throwerName,
			ThrowerID:   throwerID,
			EntityID:    e.GrenadeEntityID,
			IsExploded:  true,
			TTL:         entity.GetProjectileConfigByType(common.EqDecoy).DurationInMs,
		}
	})
	b.parser.RegisterEventHandler(func(e events.DecoyExpired) {
		delete(b.activeProjectiles, e.GrenadeEntityID)
	})

	// Fire event handlers (Infernos)
	b.parser.RegisterEventHandler(func(e events.InfernoStart) {
		throwerName := ""
		throwerID := 0
		if thrower := e.Inferno.Thrower(); thrower != nil {
			throwerName = thrower.Name
			throwerID = thrower.UserID
		}
		b.activeProjectiles[e.Inferno.Entity.ID()] = entity.ProjectileFrame{
			Type:        common.EqMolotov, // Explicitly set equipment type
			X:           e.Inferno.Entity.Position().X,
			Y:           e.Inferno.Entity.Position().Y,
			Z:           e.Inferno.Entity.Position().Z,
			ThrowerName: throwerName,
			ThrowerID:   throwerID,
			EntityID:    e.Inferno.Entity.ID(),
			IsExploded:  true,
			TTL:         entity.GetProjectileConfigByType(common.EqMolotov).DurationInMs,
		}
	})
	b.parser.RegisterEventHandler(func(e events.InfernoExpired) {
		delete(b.activeProjectiles, e.Inferno.Entity.ID())
	})

	// Explosion event handlers
	b.parser.RegisterEventHandler(func(e events.HeExplode) {
		throwerName := ""
		throwerID := 0
		if e.Thrower != nil {
			throwerName = e.Thrower.Name
			throwerID = e.Thrower.UserID
		}
		b.activeProjectiles[e.GrenadeEntityID] = entity.ProjectileFrame{
			Type:        common.EqHE, // Explicitly set equipment type
			X:           e.Position.X,
			Y:           e.Position.Y,
			Z:           e.Position.Z,
			ThrowerName: throwerName,
			ThrowerID:   throwerID,
			EntityID:    e.GrenadeEntityID,
			IsExploded:  true,
			TTL:         entity.GetProjectileConfigByType(common.EqHE).DurationInMs,
		}
	})
	b.parser.RegisterEventHandler(func(e events.FlashExplode) {
		throwerName := ""
		throwerID := 0
		if e.Thrower != nil {
			throwerName = e.Thrower.Name
			throwerID = e.Thrower.UserID
		}
		b.activeProjectiles[e.GrenadeEntityID] = entity.ProjectileFrame{
			Type:        common.EqFlash, // Explicitly set equipment type
			X:           e.Position.X,
			Y:           e.Position.Y,
			Z:           e.Position.Z,
			ThrowerName: throwerName,
			ThrowerID:   throwerID,
			EntityID:    e.GrenadeEntityID,
			IsExploded:  true,
			TTL:         entity.GetProjectileConfigByType(common.EqFlash).DurationInMs,
		}
	})

	// Bomb event handlers
	b.parser.RegisterEventHandler(func(e events.BombPlantBegin) { b.bombState = "planting"; b.bombSite = string(e.Site) })
	b.parser.RegisterEventHandler(func(e events.BombPlanted) { b.bombState = "planted"; b.bombSite = string(e.Site) })
	b.parser.RegisterEventHandler(func(e events.BombDefuseStart) { b.bombState = "defusing" })
	b.parser.RegisterEventHandler(func(e events.BombDefused) { b.bombState = "defused" })
	b.parser.RegisterEventHandler(func(e events.BombExplode) { b.bombState = "exploded" })
	b.parser.RegisterEventHandler(func(e events.BombDropped) { b.bombState = "dropped" })
	b.parser.RegisterEventHandler(func(e events.BombPickup) { b.bombState = "carried" })

	// Kill event handler
	b.parser.RegisterEventHandler(func(e events.Kill) {
		killerID := 0
		if e.Killer != nil {
			killerID = e.Killer.UserID
		}
		assistantID := 0
		if e.Assister != nil {
			assistantID = e.Assister.UserID
		}
		weaponID := common.EqUnknown
		if e.Weapon != nil && e.Weapon.Type != common.EqUnknown {
			weaponID = e.Weapon.Type
		}

		if e.Victim != nil {
			b.currentKillEvents[e.Victim.UserID] = entity.KillEvent{
				KillerID:    killerID,
				AssistantID: assistantID,
				WeaponID:    weaponID,
			}
		}
	})
}
