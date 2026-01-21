package engine

import (
	"fmt"
	"io"
	"log"
	"time"

	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/events"
)

func BuildReplay(r io.Reader, onStatus func(string)) (*Replay, error) {
	if onStatus != nil {
		onStatus("Creating demo parser...")
	}
	log.Println("[3/5] Creating demo parser...")
	p := demoinfocs.NewParser(r)
	defer p.Close()

	var (
		frames       []Frame
		frameCount   int
		currentRound int

		// Bomb tracking
		bombState string = "carried"
		bombSite  string
	)

	// Register round start handler to increment round counter
	p.RegisterEventHandler(func(e events.RoundStart) {
		currentRound++
		bombState = "carried"
		bombSite = ""
	})

	// Bomb event handlers
	p.RegisterEventHandler(func(e events.BombPlantBegin) { bombState = "planting"; bombSite = string(e.Site) })
	p.RegisterEventHandler(func(e events.BombPlanted) { bombState = "planted"; bombSite = string(e.Site) })
	p.RegisterEventHandler(func(e events.BombDefuseStart) { bombState = "defusing" })
	p.RegisterEventHandler(func(e events.BombDefused) { bombState = "defused" })
	p.RegisterEventHandler(func(e events.BombExplode) { bombState = "exploded" })
	p.RegisterEventHandler(func(e events.BombDropped) { bombState = "dropped" })
	p.RegisterEventHandler(func(e events.BombPickup) { bombState = "carried" })

	if onStatus != nil {
		onStatus("Parsing frames...")
	}
	log.Println("Parsing frames...")
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
		if currentRound > 2 {
			break
		}

		gs := p.GameState()
		currentTick := gs.IngameTick()
		frameCount++

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
				UsingItem:           pl.IsPressingButton(common.ButtonAttack) || pl.IsPressingButton(common.ButtonAttack2),
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
		if b := gs.Bomb(); b != nil {
			bPos := b.Position()
			bombFrame = &BombFrame{
				X:         bPos.X,
				Y:         bPos.Y,
				Z:         bPos.Z,
				IsPlanted: bombState == "planted" || bombState == "defusing" || bombState == "defused" || bombState == "exploded",
				State:     bombState,
				Site:      bombSite,
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
			})
		}
		for _, inf := range gs.Infernos() {
			if inf.Entity == nil {
				continue
			}
			pos := inf.Entity.Position()

			throwerName := ""
			var throwerSteamID uint64
			if thrower := inf.Thrower(); thrower != nil {
				throwerName = thrower.Name
				throwerSteamID = thrower.SteamID64
			}

			projectiles = append(projectiles, ProjectileFrame{
				Type:           common.EqMolotov, // Infernos are usually from molotovs/incendiaries
				X:              pos.X,
				Y:              pos.Y,
				Z:              pos.Z,
				ThrowerName:    throwerName,
				ThrowerSteamID: throwerSteamID,
				EntityID:       inf.Entity.ID(),
			})
		}

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

		frames = append(frames, Frame{
			TimeMs:           p.CurrentTime().Milliseconds(),
			Tick:             currentTick,
			Round:            currentRound,
			Players:          players,
			Projectiles:      projectiles,
			DroppedEquipment: droppedEquipment,
			Bomb:             bombFrame,
		})
	}

	msg := fmt.Sprintf("Parsed total %d frames. Normalizing coordinates...", frameCount)
	log.Println(msg)
	if onStatus != nil {
		onStatus(msg)
	}

	gs := p.GameState()
	// Get map name from ConVars
	mapName := "unknown"
	if convars := gs.Rules().ConVars(); convars != nil {
		if name, ok := convars["host_map"]; ok {
			mapName = name
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
