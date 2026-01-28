package engine

import (
	"fmt"
	"io"
	"log"
	"time"

	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
	"github.com/bugkingzht/cs-demobox/pkg/engine/reflector"
)

type Engine interface {
	BuildReplay(r io.Reader, onStatus func(string)) (*entity.Replay, error)
}

type DemoEngine struct {
	resolveFreezeTime bool
}

func NewDemoEngine(config EngineConfig) *DemoEngine {
	return &DemoEngine{
		resolveFreezeTime: config.ResolveFreezeTime,
	}
}

func (e *DemoEngine) BuildReplay(r io.Reader, onStatus func(string)) (*entity.Replay, error) {
	if onStatus != nil {
		onStatus("Creating demo parser...")
	}
	log.Println("[3/5] Creating demo parser...")
	p := demoinfocs.NewParser(r)
	defer p.Close()

	b := &replayBuilder{
		parser:            p,
		bombState:         "carried",
		activeProjectiles: make(map[int]entity.ProjectileFrame),
		currentKillEvents: make(map[int]entity.KillEvent),
	}

	b.registerEventHandlers()

	if onStatus != nil {
		onStatus("Parsing frames...")
	}
	log.Println("Parsing frames...")

	var frames []entity.Frame
	frameCount := 0
	for {
		more, err := p.ParseNextFrame()
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, err
		}
		if !more {
			break
		}

		// HACK & FIXME: Temporarily truncate to only keep the first two rounds
		// Currently for testing purposes only
		if b.currentRound > 2 {
			break
		}

		frameCount++
		gs := p.GameState()
		currentTick := gs.IngameTick()

		// Log status and notify callback every 1000 frames
		if frameCount%1000 == 0 {
			msg := fmt.Sprintf("Parsed %d frames (tick: %d)...", frameCount, currentTick)
			log.Printf("  %s\n", msg)
			if onStatus != nil {
				onStatus(msg)
			}
			// Yield to JS main thread to keep UI responsive
			time.Sleep(time.Millisecond)
		}

		if len(frames) > 0 {
			b.prevFrame = &frames[len(frames)-1]
		}
		frames = append(frames, b.frameOne())
	}

	msg := fmt.Sprintf("Parsed total %d frames. Normalizing coordinates...", frameCount)
	log.Println(msg)
	if onStatus != nil {
		onStatus(msg)
	}

	gs := p.GameState()
	// Get map name using reflection from the unexported header
	mapName := reflector.GetMapName(p)
	// Fallback to ConVars if reflection fails
	if mapName == "unknown" {
		if convars := gs.Rules().ConVars(); convars != nil {
			if name, ok := convars["host_map"]; ok {
				mapName = name
			}
		}
	}

	return &entity.Replay{
		Frames:           frames,
		ProjectileRender: entity.GetProjectileConfig(),
		MapName:          mapName,
		TeamCT:           gs.TeamCounterTerrorists().ClanName(),
		TeamT:            gs.TeamTerrorists().ClanName(),
		ScoreCT:          gs.TeamCounterTerrorists().Score(),
		ScoreT:           gs.TeamTerrorists().Score(),
	}, nil
}

type replayBuilder struct {
	parser            demoinfocs.Parser
	currentRound      int
	bombState         string
	bombSite          string
	activeProjectiles map[int]entity.ProjectileFrame
	currentKillEvents map[int]entity.KillEvent
	prevFrame         *entity.Frame
}

func (b *replayBuilder) frameOne() entity.Frame {
	timeMs := b.parser.CurrentTime().Milliseconds()

	gs := b.parser.GameState()
	currentTick := gs.IngameTick()

	var players []entity.PlayerFrame
	for _, pl := range gs.Participants().Playing() {
		pos := pl.Position()
		x, y := pos.X, pos.Y
		// Extract inventory - only add valid equipment types
		var inventory []common.EquipmentType
		for _, w := range pl.Weapons() {
			if w.Type != common.EqUnknown {
				inventory = append(inventory, w.Type)
			}
		}

		activeWeapon := common.EqUnknown
		if aw := pl.ActiveWeapon(); aw != nil && aw.Type != common.EqUnknown {
			activeWeapon = aw.Type
		}

		buttons := []uint64{}
		for _, button := range entity.ButtonWatching {
			if pl.IsPressingButton(button) {
				buttons = append(buttons, uint64(button))
			}
		}

		players = append(players, entity.PlayerFrame{
			ID:                  pl.UserID,
			Name:                pl.Name,
			Team:                int(pl.Team),
			X:                   x,
			Y:                   y,
			Z:                   pos.Z,
			Alive:               pl.IsAlive(),
			Yaw:                 pl.ViewDirectionX(),
			Pitch:               pl.ViewDirectionY(),
			Health:              pl.Health(),
			Armor:               pl.Armor(),
			Money:               pl.Money(),
			HasHelmet:           pl.HasHelmet(),
			HasDefuseKit:        pl.HasDefuseKit(),
			IsScoped:            pl.IsScoped(),
			FlashDuration:       pl.FlashDuration,
			IsBlinded:           pl.IsBlinded(),
			Inventory:           inventory,
			ActiveWeapon:        activeWeapon,
			Buttons:             buttons,
			Kills:               pl.Kills(),
			Assists:             pl.Assists(),
			Deaths:              pl.Deaths(),
			MoneySpentTotal:     pl.MoneySpentTotal(),
			MoneySpentThisRound: pl.MoneySpentThisRound(),
			EquipmentValue:      pl.EquipmentValueCurrent(),
			SteamID:             pl.SteamID64,
			IsBot:               pl.IsBot,
		})
	}

	// Extract bomb info
	var bombFrame *entity.BombFrame
	if b_ent := gs.Bomb(); b_ent != nil {
		bPos := b_ent.Position()
		bombFrame = &entity.BombFrame{
			X:         bPos.X,
			Y:         bPos.Y,
			Z:         bPos.Z,
			IsPlanted: b.bombState == "planted" || b.bombState == "defusing" || b.bombState == "defused" || b.bombState == "exploded",
			State:     b.bombState,
			Site:      b.bombSite,
		}
	}

	// Extract projectiles
	// Create three maps as requested:
	// 1. Flying projectiles (from grenade projectiles in current game state)
	// 2. Active projectiles (from b.activeProjectiles map)
	// 3. Previous frame projectiles (from b.prevFrame.Projectiles)

	// Create maps for the three sources
	flyingProjectiles := make(map[int]entity.ProjectileFrame)
	activeProjectiles := b.activeProjectiles
	prevFrameProjectiles := make(map[int]entity.ProjectileFrame)

	if b.prevFrame != nil {
		prevFrameProjectiles = b.prevFrame.Projectiles
	}

	// Process flying projectiles (in flight)
	for _, proj := range gs.GrenadeProjectiles() {
		// Add nil checks before accessing entity properties to prevent panics
		if proj.Entity == nil || proj.WeaponInstance == nil {
			continue
		}
		pos := proj.Position()

		var trajectory []entity.Point
		for _, v := range proj.Trajectory {
			// Add safety check for trajectory positions
			if v.Position.X == 0 && v.Position.Y == 0 && v.Position.Z == 0 {
				// Skip invalid trajectory points
				continue
			}
			trajectory = append(trajectory, entity.Point{X: v.Position.X, Y: v.Position.Y, Z: v.Position.Z})
		}

		throwerName := ""
		var throwerSteamID uint64
		if proj.Thrower != nil {
			throwerName = proj.Thrower.Name
			throwerSteamID = proj.Thrower.SteamID64
		}

		// Ensure we have a valid equipment type
		equipType := proj.WeaponInstance.Type
		if equipType == common.EqUnknown {
			// Skip projectiles with unknown equipment type
			continue
		}

		flyingProjectiles[proj.Entity.ID()] = entity.ProjectileFrame{
			Type:           equipType, // Use the validated equipment type
			X:              pos.X,
			Y:              pos.Y,
			Z:              pos.Z,
			ThrowerName:    throwerName,
			ThrowerSteamID: throwerSteamID,
			EntityID:       proj.Entity.ID(),
			Trajectory:     trajectory,
			IsExploded:     false, // Flying projectiles are not exploded yet
		}
	}

	// First, combine all three maps into a new combined map
	combinedProjectiles := make(map[int]entity.ProjectileFrame)

	// Add all projectiles from previous frame to the combined map first
	for id, proj := range prevFrameProjectiles {
		combinedProjectiles[id] = proj
	}

	// Add all flying projectiles to the combined map (may overwrite previous frame projectiles)
	for id, proj := range flyingProjectiles {
		combinedProjectiles[id] = proj
	}

	// Add all active projectiles to the combined map (highest priority, may overwrite others)
	for id, proj := range activeProjectiles {
		// For active projectiles, they are considered exploded
		updatedProj := proj
		updatedProj.IsExploded = true
		combinedProjectiles[id] = updatedProj
	}

	// Now iterate through the combined map to calculate explode and TTL values
	projectiles := make(map[int]entity.ProjectileFrame)

	for id, proj := range combinedProjectiles {
		// Determine if this projectile comes from active projectiles
		isFromActive := false
		if _, exists := activeProjectiles[id]; exists {
			isFromActive = true
		}

		// Get the previous frame projectile if it exists
		prevProj, prevExists := prevFrameProjectiles[id]

		// Calculate IsExploded: if in active map, IsExploded = true; otherwise, inherit from previous frame
		isExploded := false
		if isFromActive {
			isExploded = true
		} else if prevExists {
			isExploded = prevProj.IsExploded
		}

		// Calculate TTL according to the rules
		var ttl int64 = 0
		if prevExists {
			if !prevProj.IsExploded && isExploded {
				// If in previous frame was not exploded, but now is exploded, assign initial TTL
				ttl = entity.GetProjectileConfigByType(proj.Type).DurationInMs
			} else if prevProj.IsExploded && isExploded {
				// If in both frames exploded, calculate TTL based on time difference
				ttl = prevProj.TTL - int64(timeMs-b.prevFrame.TimeMs)
			} else {
				// Otherwise, inherit TTL from previous frame if it exists
				ttl = prevProj.TTL
			}
		} else if isExploded {
			// New projectile that's exploded, assign initial TTL
			ttl = entity.GetProjectileConfigByType(proj.Type).DurationInMs
		}

		// Only add to current frame if TTL is positive (not expired)
		_, inActive := activeProjectiles[id]
		_, inFlying := flyingProjectiles[id]
		if ttl <= 0 && !inActive && !inFlying {
			// clear expired projectiles and continue
			delete(projectiles, id)
			continue
		}

		// Create the final projectile for the current frame
		finalProj := proj
		finalProj.IsExploded = isExploded
		finalProj.TTL = ttl
		projectiles[id] = finalProj
	}

	// Clear activeProjectiles and rebuild it based on current frame
	// Active projectiles are those that are exploded and have positive TTL
	newActiveProjectiles := make(map[int]entity.ProjectileFrame)
	for id, proj := range projectiles {
		if proj.IsExploded && proj.TTL > 0 {
			newActiveProjectiles[id] = proj
		}
	}
	b.activeProjectiles = newActiveProjectiles

	// Extract dropped equipment - only add valid equipment types
	var droppedEquipment []entity.DroppedEquipment
	for _, w := range gs.Weapons() {
		if w.Entity == nil {
			continue
		}
		if w.Owner == nil && w.Type != common.EqUnknown {
			pos := w.Entity.Position()
			// Filter out invalid position coordinates
			if pos.X != 0 || pos.Y != 0 || pos.Z != 0 {
				droppedEquipment = append(droppedEquipment, entity.DroppedEquipment{
					Type: w.Type,
					X:    pos.X,
					Y:    pos.Y,
					Z:    pos.Z,
				})
			}
		}
	}

	// Copy current kill events to the frame
	killEvents := make(map[int]entity.KillEvent)
	for k, v := range b.currentKillEvents {
		killEvents[k] = v
	}

	return entity.Frame{
		TimeMs:           timeMs,
		Tick:             currentTick,
		Round:            b.currentRound,
		Players:          players,
		KillEvents:       killEvents,
		Projectiles:      projectiles,
		DroppedEquipment: droppedEquipment,
		Bomb:             bombFrame,
	}
}
