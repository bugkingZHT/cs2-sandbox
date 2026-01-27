package engine

import (
	"fmt"
	"io"
	"log"
	"time"

	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"

	"github.com/bugkingzht/cs-demobox/pkg/engine/reflector"
)

func BuildReplay(r io.Reader, onStatus func(string)) (*Replay, error) {
	if onStatus != nil {
		onStatus("Creating demo parser...")
	}
	log.Println("[3/5] Creating demo parser...")
	p := demoinfocs.NewParser(r)
	defer p.Close()

	b := &replayBuilder{
		parser:            p,
		bombState:         "carried",
		activeSmokes:      make(map[int]ProjectileFrame),
		activeDecoys:      make(map[int]ProjectileFrame),
		activeFires:       make(map[int]ProjectileFrame),
		activeExplosions:  make(map[int]ProjectileFrame),
		currentKillEvents: make(map[int]KillEvent),
	}

	b.registerEventHandlers()

	if onStatus != nil {
		onStatus("Parsing frames...")
	}
	log.Println("Parsing frames...")

	var frames []Frame
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

	return &Replay{
		Frames:  frames,
		MapName: mapName,
		TeamCT:  gs.TeamCounterTerrorists().ClanName(),
		TeamT:   gs.TeamTerrorists().ClanName(),
		ScoreCT: gs.TeamCounterTerrorists().Score(),
		ScoreT:  gs.TeamTerrorists().Score(),
	}, nil
}

type replayBuilder struct {
	parser            demoinfocs.Parser
	currentRound      int
	bombState         string
	bombSite          string
	activeSmokes      map[int]ProjectileFrame
	activeDecoys      map[int]ProjectileFrame
	activeFires       map[int]ProjectileFrame
	activeExplosions  map[int]ProjectileFrame
	currentKillEvents map[int]KillEvent
}

func (b *replayBuilder) frameOne() Frame {
	gs := b.parser.GameState()
	currentTick := gs.IngameTick()

	var players []PlayerFrame
	for _, pl := range gs.Participants().Playing() {
		pos := pl.Position()
		x, y := pos.X, pos.Y
		// Extract inventory
		var inventory []common.EquipmentType
		for _, w := range pl.Weapons() {
			inventory = append(inventory, w.Type)
		}

		activeWeapon := common.EqUnknown
		if aw := pl.ActiveWeapon(); aw != nil {
			activeWeapon = aw.Type
		}

		buttons := []uint64{}
		for _, button := range ButtonWatching {
			if pl.IsPressingButton(button) {
				buttons = append(buttons, uint64(button))
			}
		}

		players = append(players, PlayerFrame{
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
	var bombFrame *BombFrame
	if b_ent := gs.Bomb(); b_ent != nil {
		bPos := b_ent.Position()
		bombFrame = &BombFrame{
			X:         bPos.X,
			Y:         bPos.Y,
			Z:         bPos.Z,
			IsPlanted: b.bombState == "planted" || b.bombState == "defusing" || b.bombState == "defused" || b.bombState == "exploded",
			State:     b.bombState,
			Site:      b.bombSite,
		}
	}

	// Extract projectiles
	var projectiles []ProjectileFrame
	for _, proj := range gs.GrenadeProjectiles() {
		if proj.Entity == nil || proj.WeaponInstance == nil {
			continue
		}
		pos := proj.Position()

		var trajectory []Point
		for _, v := range proj.Trajectory {
			trajectory = append(trajectory, Point{X: v.Position.X, Y: v.Position.Y, Z: v.Position.Z})
		}

		throwerName := ""
		var throwerSteamID uint64
		if proj.Thrower != nil {
			throwerName = proj.Thrower.Name
			throwerSteamID = proj.Thrower.SteamID64
		}

		projectiles = append(projectiles, ProjectileFrame{
			Type:           proj.WeaponInstance.Type,
			X:              pos.X,
			Y:              pos.Y,
			Z:              pos.Z,
			ThrowerName:    throwerName,
			ThrowerSteamID: throwerSteamID,
			EntityID:       proj.Entity.ID(),
			Trajectory:     trajectory,
			IsExploded:     false,
		})
	}
	for _, smoke := range b.activeSmokes {
		projectiles = append(projectiles, smoke)
	}
	for _, decoy := range b.activeDecoys {
		projectiles = append(projectiles, decoy)
	}
	for _, fire := range b.activeFires {
		projectiles = append(projectiles, fire)
	}
	for _, explosion := range b.activeExplosions {
		projectiles = append(projectiles, explosion)
	}

	// Clear instantaneous explosions after recording them in the current frame
	b.activeExplosions = make(map[int]ProjectileFrame)

	// Extract dropped equipment
	var droppedEquipment []DroppedEquipment
	for _, w := range gs.Weapons() {
		if w.Entity == nil {
			continue
		}
		if w.Owner == nil {
			pos := w.Entity.Position()
			droppedEquipment = append(droppedEquipment, DroppedEquipment{
				Type: w.Type,
				X:    pos.X,
				Y:    pos.Y,
				Z:    pos.Z,
			})
		}
	}

	// Copy current kill events to the frame
	killEvents := make(map[int]KillEvent)
	for k, v := range b.currentKillEvents {
		killEvents[k] = v
	}

	return Frame{
		TimeMs:           b.parser.CurrentTime().Milliseconds(),
		Tick:             currentTick,
		Round:            b.currentRound,
		Players:          players,
		KillEvents:       killEvents,
		Projectiles:      projectiles,
		DroppedEquipment: droppedEquipment,
		Bomb:             bombFrame,
	}
}
