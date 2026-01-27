package engine

import (
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/events"
)

func (b *replayBuilder) registerEventHandlers() {
	// Register round start handler to increment round counter
	b.parser.RegisterEventHandler(func(e events.RoundStart) {
		b.currentRound++
		b.bombState = "carried"
		b.bombSite = ""
		b.activeSmokes = make(map[int]ProjectileFrame)
		b.activeDecoys = make(map[int]ProjectileFrame)
		b.activeFires = make(map[int]ProjectileFrame)
		b.activeExplosions = make(map[int]ProjectileFrame)
		b.currentKillEvents = make(map[int]KillEvent)
	})

	// Smoke event handlers
	b.parser.RegisterEventHandler(func(e events.SmokeStart) {
		throwerName := ""
		var throwerSteamID uint64
		if e.Thrower != nil {
			throwerName = e.Thrower.Name
			throwerSteamID = e.Thrower.SteamID64
		}
		b.activeSmokes[e.GrenadeEntityID] = ProjectileFrame{
			Type:           common.EqSmoke,
			X:              e.Position.X,
			Y:              e.Position.Y,
			Z:              e.Position.Z,
			ThrowerName:    throwerName,
			ThrowerSteamID: throwerSteamID,
			EntityID:       e.GrenadeEntityID,
			IsExploded:     true,
		}
	})
	b.parser.RegisterEventHandler(func(e events.SmokeExpired) {
		delete(b.activeSmokes, e.GrenadeEntityID)
	})

	// Decoy event handlers
	b.parser.RegisterEventHandler(func(e events.DecoyStart) {
		throwerName := ""
		var throwerSteamID uint64
		if e.Thrower != nil {
			throwerName = e.Thrower.Name
			throwerSteamID = e.Thrower.SteamID64
		}
		b.activeDecoys[e.GrenadeEntityID] = ProjectileFrame{
			Type:           common.EqDecoy,
			X:              e.Position.X,
			Y:              e.Position.Y,
			Z:              e.Position.Z,
			ThrowerName:    throwerName,
			ThrowerSteamID: throwerSteamID,
			EntityID:       e.GrenadeEntityID,
			IsExploded:     true,
		}
	})
	b.parser.RegisterEventHandler(func(e events.DecoyExpired) {
		delete(b.activeDecoys, e.GrenadeEntityID)
	})

	// Fire event handlers (Infernos)
	b.parser.RegisterEventHandler(func(e events.InfernoStart) {
		throwerName := ""
		var throwerSteamID uint64
		if thrower := e.Inferno.Thrower(); thrower != nil {
			throwerName = thrower.Name
			throwerSteamID = thrower.SteamID64
		}
		b.activeFires[e.Inferno.Entity.ID()] = ProjectileFrame{
			Type:           common.EqMolotov,
			X:              e.Inferno.Entity.Position().X,
			Y:              e.Inferno.Entity.Position().Y,
			Z:              e.Inferno.Entity.Position().Z,
			ThrowerName:    throwerName,
			ThrowerSteamID: throwerSteamID,
			EntityID:       e.Inferno.Entity.ID(),
			IsExploded:     true,
		}
	})
	b.parser.RegisterEventHandler(func(e events.InfernoExpired) {
		delete(b.activeFires, e.Inferno.Entity.ID())
	})

	// Explosion event handlers
	b.parser.RegisterEventHandler(func(e events.HeExplode) {
		throwerName := ""
		var throwerSteamID uint64
		if e.Thrower != nil {
			throwerName = e.Thrower.Name
			throwerSteamID = e.Thrower.SteamID64
		}
		b.activeExplosions[e.GrenadeEntityID] = ProjectileFrame{
			Type:           common.EqHE,
			X:              e.Position.X,
			Y:              e.Position.Y,
			Z:              e.Position.Z,
			ThrowerName:    throwerName,
			ThrowerSteamID: throwerSteamID,
			EntityID:       e.GrenadeEntityID,
			IsExploded:     true,
		}
	})
	b.parser.RegisterEventHandler(func(e events.FlashExplode) {
		throwerName := ""
		var throwerSteamID uint64
		if e.Thrower != nil {
			throwerName = e.Thrower.Name
			throwerSteamID = e.Thrower.SteamID64
		}
		b.activeExplosions[e.GrenadeEntityID] = ProjectileFrame{
			Type:           common.EqFlash,
			X:              e.Position.X,
			Y:              e.Position.Y,
			Z:              e.Position.Z,
			ThrowerName:    throwerName,
			ThrowerSteamID: throwerSteamID,
			EntityID:       e.GrenadeEntityID,
			IsExploded:     true,
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
		if e.Weapon != nil {
			weaponID = e.Weapon.Type
		}

		if e.Victim != nil {
			b.currentKillEvents[e.Victim.UserID] = KillEvent{
				KillerID:    killerID,
				AssistantID: assistantID,
				WeaponID:    weaponID,
			}
		}
	})
}
