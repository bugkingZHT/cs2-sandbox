package engine

import (
	"log"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/events"

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
		b.roundStartTick = b.parser.GameState().IngameTick()
		b.freezeEndTick = 0
		b.bombPlantedTick = 0
		b.roundEndTick = 0
		// Reset dropped equipment blacklist - will be built at round frame 0
		b.droppedEquipmentBlacklist = make(map[int]struct{})
		b.droppedBlacklistBuiltRound = -1
		// 不在 RoundStart 里重置 roundFreezeEndCost/Count，否则若事件顺序为 RoundFreezetimeEnd → RoundStart 会清掉本回合刚写入的数据；仅在 RoundFreezetimeEnd 写入，RoundEnd 使用即本回合数据
	})

	// Register freeze time end handler
	b.parser.RegisterEventHandler(func(e events.RoundFreezetimeEnd) {
		b.inFreezeTime = false
		b.freezeEndTick = b.parser.GameState().IngameTick()
	})

	// Register round end handler
	b.parser.RegisterEventHandler(func(e events.RoundEnd) {
		b.roundEndTick = b.parser.GameState().IngameTick()

		log.Printf("[RoundEnd] Round %d ended. Winner: %v, BombState: %s", b.currentRound, e.Winner, b.bombState)

		// Determine round result based on winner and bomb state
		var result entity.RoundResult

		// Check winner team: 2=T, 3=CT
		if e.Winner == common.TeamCounterTerrorists {
			// CT won
			if b.bombState == "defused" {
				result = entity.RoundResultBombDefused
			} else {
				result = entity.RoundResultCTWin
			}
		} else if e.Winner == common.TeamTerrorists {
			// T won
			if b.bombState == "exploded" {
				result = entity.RoundResultBombExploded
			} else {
				result = entity.RoundResultTWin
			}
		} else {
			// Normally never reach this point, but handle it gracefully
			log.Printf("[RoundEnd] WARNING: No clear winner (Winner=%v), using fallback logic", e.Winner)
			// Fallback: if no clear winner, check bomb state
			if b.bombState == "defused" {
				result = entity.RoundResultBombDefused
			} else if b.bombState == "exploded" {
				result = entity.RoundResultBombExploded
			} else {
				// Default to CT win if no clear result
				result = entity.RoundResultCTWin
			}
		}

		// 只写入 builder，不 append 到 roundResults；由 ParseNextRound 末尾统计经济后 append 到 meta
		b.lastRoundResult = &entity.RoundResultInfo{
			Round:  b.currentRound,
			Result: result,
		}
		log.Printf("[RoundEnd] Recorded result for round %d: %s", b.currentRound, result)
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
			Type:        common.EqUnknown,
			X:           e.Inferno.Entity.Position().X,
			Y:           e.Inferno.Entity.Position().Y,
			Z:           e.Inferno.Entity.Position().Z,
			ThrowerName: throwerName,
			ThrowerID:   throwerID,
			EntityID:    e.Inferno.Entity.ID(),
			IsExploded:  true,
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
	b.parser.RegisterEventHandler(func(e events.BombPlanted) {
		b.bombState = "planted"
		b.bombSite = string(e.Site)
		b.bombPlantedTick = b.parser.GameState().IngameTick()
	})
	b.parser.RegisterEventHandler(func(e events.BombDefuseStart) { b.bombState = "defusing" })
	b.parser.RegisterEventHandler(func(e events.BombDefuseAborted) { b.bombState = "planted" })
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
		weaponID := common.EqUnknown
		if e.Weapon != nil && e.Weapon.Type != common.EqUnknown {
			weaponID = e.Weapon.Type
		}

		if e.Victim != nil {
			b.currentKillEvents[e.Victim.UserID] = entity.KillEvent{
				KillerID: killerID,
				WeaponID: weaponID,
			}
		}
	})
}
