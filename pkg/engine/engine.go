package engine

import (
	"fmt"
	"io"
	"log"
	"time"

	"github.com/google/uuid"
	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
	"github.com/bugkingzht/cs-demobox/pkg/engine/reflector"
)

type Engine interface {
	BuildReplay(r io.Reader, onStatus func(string)) (*entity.ReplayMeta, []*entity.ReplayRound, error)
}

type DemoEngine struct {
	resolveFreezeTime bool
}

func NewDemoEngine(config EngineConfig) *DemoEngine {
	return &DemoEngine{
		resolveFreezeTime: config.ResolveFreezeTime,
	}
}

func (e *DemoEngine) BuildReplay(r io.Reader, onStatus func(string)) (*entity.ReplayMeta, []*entity.ReplayRound, error) {
	if onStatus != nil {
		onStatus("Creating demo parser...")
	}
	log.Println("[3/5] Creating demo parser...")
	p := demoinfocs.NewParser(r)
	defer p.Close()

	// Generate UUID for this parsing session
	uuid := uuid.New().String()
	log.Printf("Generated UUID for this match: %s", uuid)

	b := &replayBuilder{
		parser:            p,
		bombState:         "carried",
		activeProjectiles: make(map[int]entity.ProjectileFrame),
		currentKillEvents: make(map[int]entity.KillEvent),
		resolveFreezeTime: e.resolveFreezeTime,
		inFreezeTime:      true, // Start in freeze time
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
			return nil, nil, err
		}
		if !more {
			break
		}

		// HACK & FIXME: Temporarily truncate to only keep the first two rounds
		// Currently for testing purposes only
		if b.currentRound > 2 {
			break
		}

		// Skip frames during freeze time if resolveFreezeTime is false
		if !b.resolveFreezeTime && b.inFreezeTime {
			continue
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

	// Group frames by round
	roundFramesMap := make(map[int][]entity.Frame)
	maxRound := 0
	for _, frame := range frames {
		roundFramesMap[frame.Round] = append(roundFramesMap[frame.Round], frame)
		if frame.Round > maxRound {
			maxRound = frame.Round
		}
	}

	// Create ReplayMeta
	meta := &entity.ReplayMeta{
		UUID:             uuid,
		UploaderUID:      "000000", // Default uploader UID (6 digits)
		UploadTime:       time.Now().UnixMilli(),
		ProjectileRender: entity.GetProjectileConfig(),
		MapName:          mapName,
		TeamCT:           gs.TeamCounterTerrorists().ClanName(),
		TeamT:            gs.TeamTerrorists().ClanName(),
		ScoreCT:          gs.TeamCounterTerrorists().Score(),
		ScoreT:           gs.TeamTerrorists().Score(),
		TotalRounds:      maxRound,
		TotalFrames:      reflector.GetPlaybackFrames(p),
		TotalDurationMs:  reflector.GetPlaybackTime(p),
	}

	// Create ReplayRound array
	rounds := make([]*entity.ReplayRound, 0, maxRound)
	for roundNum := 1; roundNum <= maxRound; roundNum++ {
		if roundFrames, ok := roundFramesMap[roundNum]; ok {
			rounds = append(rounds, &entity.ReplayRound{
				UUID:   uuid,
				Round:  roundNum,
				Frames: roundFrames,
			})
		}
	}

	log.Printf("Parsed %d rounds with UUID: %s", len(rounds), uuid)
	if onStatus != nil {
		onStatus(fmt.Sprintf("Parsed %d rounds", maxRound))
	}
	return meta, rounds, nil
}

type replayBuilder struct {
	parser            demoinfocs.Parser
	currentRound      int
	bombState         string
	bombSite          string
	activeProjectiles map[int]entity.ProjectileFrame
	currentKillEvents map[int]entity.KillEvent
	prevFrame         *entity.Frame
	resolveFreezeTime bool
	inFreezeTime      bool
	// Round time tracking
	roundStartTick  int // Tick when the round started (freeze time begins)
	freezeEndTick   int // Tick when freeze time ended
	bombPlantedTick int // Tick when bomb was planted
	roundEndTick    int // Tick when round ended
}

func (b *replayBuilder) frameOne() entity.Frame {
	timeMs := b.parser.CurrentTime().Milliseconds()

	gs := b.parser.GameState()
	currentTick := gs.IngameTick()

	// Build players map instead of slice
	playersMap := make(map[int]entity.PlayerFrame)
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
		// Sort inventory by equipment type ID for consistent display
		entity.SortInventoryByType(inventory)

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

		playerFrame := entity.PlayerFrame{
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
		}
		playersMap[pl.UserID] = playerFrame
	}

	// Generate sorted player IDs for rendering
	sortedPlayers := entity.SortPlayersByID(playersMap)

	// Calculate round time info
	roundTimeInfo := b.calculateRoundTime(gs, currentTick)

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
		entityID := proj.Entity.ID()

		// Build trajectory from checkpoints that haven't been passed yet
		var trajectory []entity.Point

		// Start with checkpoints from demo parser
		for _, checkpoint := range proj.Trajectory {
			// Skip invalid checkpoint positions
			if checkpoint.Position.X == 0 && checkpoint.Position.Y == 0 && checkpoint.Position.Z == 0 {
				continue
			}

			checkX, checkY, checkZ := checkpoint.Position.X, checkpoint.Position.Y, checkpoint.Position.Z

			// Check if this checkpoint has been passed
			// If we have a previous position, check if we're moving away from the checkpoint
			hasPassed := false
			if prevProj, exists := prevFrameProjectiles[entityID]; exists {
				distToPrev := distance(prevProj.X, prevProj.Y, prevProj.Z, checkX, checkY, checkZ)
				distToCurrent := distance(pos.X, pos.Y, pos.Z, checkX, checkY, checkZ)

				// If distance is increasing (moving away), we've passed the checkpoint
				if distToCurrent > distToPrev {
					hasPassed = true
				}
			}

			// Only add checkpoints that haven't been passed yet
			if !hasPassed {
				trajectory = append(trajectory, entity.Point{X: checkX, Y: checkY, Z: checkZ})
			}
		}

		throwerName := ""
		throwerID := 0
		if proj.Thrower != nil {
			throwerName = proj.Thrower.Name
			throwerID = proj.Thrower.UserID
		}

		// Ensure we have a valid equipment type
		equipType := proj.WeaponInstance.Type
		if equipType == common.EqUnknown {
			// Skip projectiles with unknown equipment type
			continue
		}

		flyingProjectiles[entityID] = entity.ProjectileFrame{
			Type:        equipType, // Use the validated equipment type
			X:           pos.X,
			Y:           pos.Y,
			Z:           pos.Z,
			ThrowerName: throwerName,
			ThrowerID:   throwerID,
			EntityID:    entityID,
			Trajectory:  trajectory,
			IsExploded:  false, // Flying projectiles are not exploded yet
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

	// Generate sorted projectile IDs for rendering (by type priority and TTL)
	sortedProjs := entity.SortProjectilesByPriority(projectiles)

	return entity.Frame{
		TimeMs:           timeMs,
		Tick:             currentTick,
		Round:            b.currentRound,
		RoundTime:        roundTimeInfo,
		Players:          playersMap,
		SortedPlayers:    sortedPlayers,
		KillEvents:       killEvents,
		Projectiles:      projectiles,
		SortedProjs:      sortedProjs,
		DroppedEquipment: droppedEquipment,
		Bomb:             bombFrame,
	}
}

// Helper functions for projectile trajectory calculation

// abs returns the absolute value of a float64
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// distance calculates the 3D Euclidean distance between two points
func distance(x1, y1, z1, x2, y2, z2 float64) float64 {
	dx := x2 - x1
	dy := y2 - y1
	dz := z2 - z1
	return dx*dx + dy*dy + dz*dz // Return squared distance for performance (no sqrt needed for comparison)
}

// calculateRoundTime determines the current round phase and remaining time
func (b *replayBuilder) calculateRoundTime(gs demoinfocs.GameState, currentTick int) entity.RoundTimeInfo {
	// Get server tick rate from header
	tickRate := b.parser.TickRate()
	if tickRate == 0 {
		tickRate = 128 // Default to 128 tick if not available
	}

	// Get ConVars for time limits from game rules
	convars := gs.Rules().ConVars()

	// Extract time configuration from ConVars
	var freezeTime float64
	var roundTime float64
	var c4Timer float64

	if convars != nil {
		if ft, ok := convars["mp_freezetime"]; ok {
			freezeTime = parseFloat(ft)
		}
		if rt, ok := convars["mp_roundtime"]; ok {
			roundTime = parseFloat(rt) * 60 // ConVar is in minutes, convert to seconds
		}
		if c4, ok := convars["mp_c4timer"]; ok {
			c4Timer = parseFloat(c4)
		}
	}

	// Apply defaults if ConVars are not available or zero
	freezeTime = GetFreezeTimeOrDefault(freezeTime)
	roundTime = GetRoundTimeOrDefault(roundTime)
	c4Timer = GetC4TimerOrDefault(c4Timer)

	// Determine phase and calculate remaining time
	var phase entity.RoundPhase
	var timeRemaining float64

	// Check if round has ended
	if b.roundEndTick > 0 && currentTick >= b.roundEndTick {
		phase = entity.RoundPhaseEnd
		timeRemaining = 0
	} else if b.bombPlantedTick > 0 && currentTick >= b.bombPlantedTick {
		// Bomb is planted - countdown to explosion
		phase = entity.RoundPhaseBombPlanted
		elapsedTicks := currentTick - b.bombPlantedTick
		elapsedSeconds := float64(elapsedTicks) / tickRate
		timeRemaining = c4Timer - elapsedSeconds
		if timeRemaining < 0 {
			timeRemaining = 0
		}
	} else if b.inFreezeTime {
		// In freeze time
		phase = entity.RoundPhaseFreezeTime
		elapsedTicks := currentTick - b.roundStartTick
		elapsedSeconds := float64(elapsedTicks) / tickRate
		timeRemaining = freezeTime - elapsedSeconds
		if timeRemaining < 0 {
			timeRemaining = 0
		}
	} else if b.freezeEndTick > 0 {
		// Normal round time (after freeze time)
		phase = entity.RoundPhaseNormal
		elapsedTicks := currentTick - b.freezeEndTick
		elapsedSeconds := float64(elapsedTicks) / tickRate
		timeRemaining = roundTime - elapsedSeconds
		if timeRemaining < 0 {
			timeRemaining = 0
		}
	} else {
		// Fallback: treat as freeze time
		phase = entity.RoundPhaseFreezeTime
		timeRemaining = freezeTime
	}

	return entity.RoundTimeInfo{
		Phase:         phase,
		TimeRemaining: timeRemaining,
	}
}

// parseFloat is a helper to parse string to float64
func parseFloat(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}
