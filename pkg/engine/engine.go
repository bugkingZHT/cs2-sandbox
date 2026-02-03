package engine

import (
	"fmt"
	"io"
	"log"
	"runtime"
	"sort"
	"time"

	"github.com/google/uuid"
	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
	"github.com/bugkingzht/cs-demobox/pkg/engine/reflector"
)

type Engine interface {
	InitParser(r io.Reader) error
	ExtractMetadata() (*entity.ReplayMeta, error)
	ParseNextRound(onStatus func(string)) (*entity.ReplayRound, error)
	BackfillMeta(meta *entity.ReplayMeta) (*entity.ReplayMeta, error)
	GetTotalParsedFrames() int
	Close() error
}

type DemoEngine struct {
	resolveFreezeTime bool
	// Singleton state for streaming parsing
	parser            demoinfocs.Parser
	builder           *replayBuilder
	uuid              string
	initialized       bool
	eofReached        bool // Track if EOF has been reached
	totalParsedFrames int  // Track total frames parsed across all rounds
}

func NewDemoEngine(config EngineConfig) *DemoEngine {
	return &DemoEngine{
		resolveFreezeTime: config.ResolveFreezeTime,
	}
}

func (e *DemoEngine) InitParser(r io.Reader) error {
	if e.initialized {
		return fmt.Errorf("parser already initialized")
	}

	log.Println("[InitParser] Creating demo parser...")
	p := demoinfocs.NewParser(r)
	e.parser = p

	// Generate UUID for this parsing session
	e.uuid = uuid.New().String()
	log.Printf("[InitParser] Generated UUID for this match: %s", e.uuid)

	// Create replayBuilder with parser reference
	e.builder = &replayBuilder{
		parser:            p,
		bombState:         "carried",
		activeProjectiles: make(map[int]entity.ProjectileFrame),
		currentKillEvents: make(map[int]entity.KillEvent),
		playerRegistry:    make(map[int]entity.PlayerInfo),
		resolveFreezeTime: e.resolveFreezeTime,
		inFreezeTime:      true, // Start in freeze time
	}

	e.builder.registerEventHandlers()
	e.initialized = true
	e.totalParsedFrames = 0 // Reset frame counter

	log.Println("[InitParser] Parser initialized successfully")
	return nil
}

func (e *DemoEngine) ExtractMetadata() (*entity.ReplayMeta, error) {
	if !e.initialized {
		return nil, fmt.Errorf("parser not initialized, call InitParser first")
	}

	log.Println("[ExtractMetadata] Extracting metadata from header...")

	// Parse the first frame to ensure game state is initialized
	more, err := e.parser.ParseNextFrame()
	if err != nil {
		return nil, fmt.Errorf("failed to parse first frame: %w", err)
	}
	if !more {
		return nil, fmt.Errorf("no frames available in demo file")
	}

	gs := e.parser.GameState()
	// Get map name using reflection from the unexported header
	mapName := reflector.GetMapName(e.parser)
	// Fallback to ConVars if reflection fails
	if mapName == "unknown" {
		if convars := gs.Rules().ConVars(); convars != nil {
			if name, ok := convars["host_map"]; ok {
				mapName = name
			}
		}
	}

	// Create ReplayMeta with header info only (no frame traversal)
	// Note: TotalFrames and TotalDurationMs are 0 here because in CS2 demos,
	// this information is only available in CDemoFileInfo message at the end of the demo.
	// These will be backfilled in Phase 3 after parsing is complete.
	meta := &entity.ReplayMeta{
		UUID:             e.uuid,
		UploaderUID:      "000000", // Default uploader UID (6 digits)
		UploadTime:       time.Now().UnixMilli(),
		EngineVersion:    EngineVersion, // Set engine version from config
		ProjectileRender: entity.GetProjectileConfig(),
		MapName:          mapName,
	}

	log.Printf("[ExtractMetadata] Metadata extracted: Map=%s, UUID=%s, EngineVersion=%s", mapName, e.uuid, EngineVersion)
	return meta, nil
}

func (e *DemoEngine) ParseNextRound(onStatus func(string)) (*entity.ReplayRound, error) {
	if !e.initialized {
		return nil, fmt.Errorf("parser not initialized, call InitParser first")
	}

	// If EOF was already reached, return nil immediately
	if e.eofReached {
		log.Println("[ParseNextRound] EOF already reached, no more rounds")
		return nil, nil
	}

	// Capture current round number at start
	startRound := e.builder.currentRound
	var frames []entity.Frame
	frameCount := 0

	log.Printf("[ParseNextRound] Starting to parse round %d...", startRound)

	for {
		// Boundary detection: stop if entered next round
		if e.builder.currentRound > startRound && len(frames) > 0 {
			log.Printf("[ParseNextRound] Round boundary detected (moved from %d to %d), returning %d frames", startRound, e.builder.currentRound, len(frames))
			break
		}

		// Skip frames during freeze time if resolveFreezeTime is false
		if !e.builder.resolveFreezeTime && e.builder.inFreezeTime {
			// Still need to parse next frame even if skipping
			more, err := e.parser.ParseNextFrame()
			if err != nil {
				if err == io.EOF {
					e.eofReached = true
					if len(frames) > 0 {
						return &entity.ReplayRound{UUID: e.uuid, Round: startRound, Frames: frames}, nil
					}
					return nil, nil
				}
				return nil, err
			}
			if !more {
				e.eofReached = true
				if len(frames) > 0 {
					return &entity.ReplayRound{UUID: e.uuid, Round: startRound, Frames: frames}, nil
				}
				return nil, nil
			}
			continue
		}

		frameCount++
		e.totalParsedFrames++ // Increment global frame counter
		gs := e.parser.GameState()
		currentTick := gs.IngameTick()

		// Log status and notify callback every 1000 frames
		if frameCount%1000 == 0 {
			msg := fmt.Sprintf("%d", e.totalParsedFrames) // Send only frame count
			log.Printf("  Parsed %d total frames (round %d, tick: %d)\n", e.totalParsedFrames, startRound, currentTick)
			if onStatus != nil {
				onStatus(msg)
			}
			// Yield to JS main thread to keep UI responsive
			time.Sleep(time.Millisecond)
		}

		// Frame construction - process current frame
		if len(frames) > 0 {
			e.builder.prevFrame = &frames[len(frames)-1]
		}
		frames = append(frames, e.builder.frameOne())

		// Parse next frame at the END of loop
		more, err := e.parser.ParseNextFrame()
		if err != nil {
			if err == io.EOF {
				// EOF reached, mark it to prevent further calls
				e.eofReached = true
				log.Printf("[ParseNextRound] EOF reached, returning round %d with %d frames", startRound, len(frames))
				return &entity.ReplayRound{
					UUID:   e.uuid,
					Round:  startRound,
					Frames: frames,
				}, nil
			}
			return nil, err
		}
		if !more {
			// No more frames, mark EOF to prevent further calls
			e.eofReached = true
			log.Printf("[ParseNextRound] No more frames, returning round %d with %d frames", startRound, len(frames))
			return &entity.ReplayRound{
				UUID:   e.uuid,
				Round:  startRound,
				Frames: frames,
			}, nil
		}
	}

	log.Printf("[ParseNextRound] Completed round %d with %d frames", startRound, len(frames))

	// Force garbage collection after each round to release memory
	runtime.GC()
	log.Printf("[ParseNextRound] 🗑️ GC triggered after completing round %d", startRound)

	return &entity.ReplayRound{
		UUID:   e.uuid,
		Round:  startRound,
		Frames: frames,
	}, nil
}

func (e *DemoEngine) BackfillMeta(meta *entity.ReplayMeta) (*entity.ReplayMeta, error) {
	if !e.initialized {
		return nil, fmt.Errorf("parser not initialized, call InitParser first")
	}

	log.Println("[BackfillMeta] Backfilling metadata with final statistics...")

	gs := e.parser.GameState()

	log.Printf("[BackfillMeta] Current round: %d, Round results count: %d", e.builder.currentRound, len(e.builder.roundResults))
	if len(e.builder.roundResults) > 0 {
		log.Println("[BackfillMeta] Round results details:")
		for i, rr := range e.builder.roundResults {
			log.Printf("  [%d] Round %d: %s", i, rr.Round, rr.Result)
		}
	} else {
		log.Println("[BackfillMeta] WARNING: No round results found!")
	}

	// Sort player IDs for consistent ordering
	playerIDs := make([]int, 0, len(e.builder.playerRegistry))
	for id := range e.builder.playerRegistry {
		playerIDs = append(playerIDs, id)
	}
	sort.Ints(playerIDs)

	// Build sorted server player list
	serverPlayers := make([]entity.PlayerInfo, 0, len(playerIDs))
	for _, id := range playerIDs {
		serverPlayers = append(serverPlayers, e.builder.playerRegistry[id])
	}

	// Create updated meta preserving all original fields
	updatedMeta := &entity.ReplayMeta{
		UUID:             meta.UUID,
		UploaderUID:      meta.UploaderUID,
		UploadTime:       meta.UploadTime,
		EngineVersion:    meta.EngineVersion, // Preserve engine version
		ProjectileRender: meta.ProjectileRender,
		MapName:          meta.MapName,
		FileName:         meta.FileName,   // Preserve original filename
		OriginPath:       meta.OriginPath, // Preserve original file path
		// Preserve parsing state fields
		Status:          meta.Status,
		ParsingProgress: meta.ParsingProgress,
		ParsingStatus:   meta.ParsingStatus,
		LastTickTime:    meta.LastTickTime,
		// Update team info and scores
		// ATTENTION: This is the last frame, so need to switch T and CT to represent starting actual teams
		TeamCT:  gs.TeamTerrorists().ClanName(),
		TeamT:   gs.TeamCounterTerrorists().ClanName(),
		ScoreCT: gs.TeamTerrorists().Score(),
		ScoreT:  gs.TeamCounterTerrorists().Score(),

		TotalRounds:  e.builder.currentRound,
		RoundResults: e.builder.roundResults, // Add round results from builder
		ServerPlayer: serverPlayers,          // Add sorted player info
	}

	log.Printf("[BackfillMeta] Backfilled: TotalRounds=%d, ScoreCT=%d, ScoreT=%d, RoundResults=%d, ServerPlayers=%d",
		updatedMeta.TotalRounds, updatedMeta.ScoreCT, updatedMeta.ScoreT, len(updatedMeta.RoundResults), len(updatedMeta.ServerPlayer))
	return updatedMeta, nil
}

func (e *DemoEngine) GetTotalParsedFrames() int {
	return e.totalParsedFrames
}

func (e *DemoEngine) Close() error {
	if !e.initialized {
		return nil
	}

	log.Println("[Close] Closing parser...")
	if e.parser != nil {
		e.parser.Close()
	}
	e.parser = nil
	e.builder = nil
	e.uuid = ""
	e.initialized = false
	e.eofReached = false
	e.totalParsedFrames = 0 // Reset frame counter

	// Force GC to release parser and builder memory
	runtime.GC()
	log.Println("[Close] 🗑️ GC triggered - parser and builder memory released")

	log.Println("[Close] Parser closed successfully")
	return nil
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
	// Round results tracking
	roundResults []entity.RoundResultInfo // Store all round results
	// Player registry: track all players seen during match
	playerRegistry map[int]entity.PlayerInfo // Player ID -> PlayerInfo
}

// trackPlayer adds or updates a player in the player registry
func (b *replayBuilder) trackPlayer(pl *common.Player) {
	if pl == nil {
		return
	}

	// Add player to registry if not already tracked
	if _, exists := b.playerRegistry[pl.UserID]; !exists {
		b.playerRegistry[pl.UserID] = entity.PlayerInfo{
			ID:      pl.UserID,
			Name:    pl.Name,
			Team:    int(pl.Team),
			SteamID: pl.SteamID64,
			IsBot:   pl.IsBot,
		}
	}
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
		// Extract inventory - for flashbangs, use FlashbangCount() to get actual count
		// For other equipment, count based on Weapons() entities
		var inventory []common.EquipmentType
		for _, w := range pl.Weapons() {
			if w.Type == common.EqUnknown {
				continue
			}
			// For flashbangs, use the FlashbangCount() method to get actual count
			if w.Type == common.EqFlash {
				// Only add flashbangs once based on FlashbangCount()
				flashbangCount := int(pl.FlashbangCount())
				for i := 0; i < flashbangCount; i++ {
					inventory = append(inventory, w.Type)
				}
			} else {
				// For other equipment, add once per entity
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
			X:             x,
			Y:             y,
			Z:             pos.Z,
			Alive:         pl.IsAlive(),
			Yaw:           pl.ViewDirectionX(),
			Pitch:         pl.ViewDirectionY(),
			Health:        pl.Health(),
			Armor:         pl.Armor(),
			Money:         pl.Money(),
			HasHelmet:     pl.HasHelmet(),
			HasDefuseKit:  pl.HasDefuseKit(),
			IsScoped:      pl.IsScoped(),
			FlashDuration: pl.FlashDuration,
			IsBlinded:     pl.IsBlinded(),
			Inventory:     inventory,
			ActiveWeapon:  activeWeapon,
			Buttons:       buttons,
			Kills:         pl.Kills(),
			Assists:       pl.Assists(),
			Deaths:        pl.Deaths(),
		}
		playersMap[pl.UserID] = playerFrame

		// Track this player in the player registry
		b.trackPlayer(pl)
	}

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

		// Build trajectory from checkpoints
		// Strategy: Try to find valid checkpoints from proj.Trajectory that are ahead of current position
		// If found, use them; otherwise, reuse previous frame's trajectory
		var trajectory []entity.Point

		// Get previous frame's trajectory for this projectile
		var prevTrajectory []entity.Point
		if prevProj, exists := prevFrameProjectiles[entityID]; exists {
			prevTrajectory = prevProj.Trajectory
		}

		// Iterate through all checkpoints from proj.Trajectory to find valid ones ahead of current position
		const reachedThreshold = 100.0 // Approximately 10 units squared distance
		for _, checkpoint := range proj.Trajectory {
			// Skip invalid checkpoint positions
			if checkpoint.Position.X == 0 && checkpoint.Position.Y == 0 && checkpoint.Position.Z == 0 {
				continue
			}

			checkX, checkY, checkZ := checkpoint.Position.X, checkpoint.Position.Y, checkpoint.Position.Z
			distToCheckpoint := distance(pos.X, pos.Y, pos.Z, checkX, checkY, checkZ)

			// Only include checkpoints that are not yet reached (beyond threshold)
			if distToCheckpoint >= reachedThreshold {
				trajectory = append(trajectory, entity.Point{X: checkX, Y: checkY, Z: checkZ})
			}
		}

		// If we found valid checkpoints from proj.Trajectory, use them
		// Otherwise, reuse previous trajectory (maintains stability when proj.Trajectory is empty/invalid)
		if len(trajectory) == 0 && len(prevTrajectory) > 0 {
			trajectory = prevTrajectory
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

	// Extract dropped equipment - only track grenades/throwables (C4 + grenades)
	// Ignore dropped weapons to reduce frame data size significantly
	var droppedEquipment []entity.DroppedEquipment
	for _, w := range gs.Weapons() {
		if w.Entity == nil {
			continue
		}
		if w.Owner != nil {
			continue
		}
		// Only track dropped grenades/throwables (no owner and is grenade type)
		if !entity.IsGrenadeOrThrowable(w.Type) {
			continue
		}
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
		KillEvents:       killEvents,
		Projectiles:      projectiles,
		SortedProjs:      sortedProjs,
		DroppedEquipment: droppedEquipment,
		Bomb:             bombFrame,
	}
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
