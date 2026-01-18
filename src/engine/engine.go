package engine

import (
	"io"
	"log"

	demoinfocs "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs"
	// "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"  // COMMENTED OUT: Not used without smoke tracking
	// "github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/events"  // COMMENTED OUT: Not used without smoke tracking
)

type PlayerFrame struct {
	ID    int     `json:"id"`
	Name  string  `json:"name"`
	Team  int     `json:"team"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Alive bool    `json:"alive"`
	Yaw   float32 `json:"yaw"`
}

type SmokeFrame struct {
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	StartTick  int     `json:"startTick"`
	EndTick    int     `json:"endTick"` // -1 if still active
	Trajectory []struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	} `json:"trajectory"`
}

type Frame struct {
	TimeMs  int64         `json:"timeMs"`
	Tick    int           `json:"tick"`
	Players []PlayerFrame `json:"players"`
	// Smokes  []SmokeFrame  `json:"smokes"` // COMMENTED OUT: Projectile/Smoke data
}

type Replay struct {
	Frames []Frame `json:"frames"`
}

func BuildReplay(r io.Reader) (*Replay, error) {
	log.Println("[3/5] Creating demo parser...")
	p := demoinfocs.NewParser(r)
	defer p.Close()

	var (
		frames       []Frame
		minX, maxX   float64
		minY, maxY   float64
		boundsInited bool
		frameCount   int

		// COMMENTED OUT: Projectile/Smoke tracking
		/*
			// Track active smokes: key = grenade entity ID
			activeSmokes = make(map[int]*SmokeFrame)
			// Track projectile trajectories before they become smokes
			smokeProjectiles = make(map[int]*common.GrenadeProjectile)
		*/
	)

	// COMMENTED OUT: Smoke event handlers
	/*
		// Register smoke start event
		p.RegisterEventHandler(func(e events.SmokeStart) {
			if e.GrenadeEntityID > 0 {
				proj := smokeProjectiles[e.GrenadeEntityID]
				smoke := &SmokeFrame{
					X:         e.Position.X,
					Y:         e.Position.Y,
					StartTick: p.GameState().IngameTick(),
					EndTick:   -1,
				}

				// Copy trajectory if available
				if proj != nil {
					for _, te := range proj.Trajectory {
						smoke.Trajectory = append(smoke.Trajectory, struct {
							X float64 `json:"x"`
							Y float64 `json:"y"`
						}{X: te.Position.X, Y: te.Position.Y})
					}
				}

				activeSmokes[e.GrenadeEntityID] = smoke
			}
		})

		// Register smoke expired event
		p.RegisterEventHandler(func(e events.SmokeExpired) {
			if smoke, ok := activeSmokes[e.GrenadeEntityID]; ok {
				smoke.EndTick = p.GameState().IngameTick()
			}
		})

		// Track grenade projectiles for trajectory
		p.RegisterEventHandler(func(e events.GrenadeProjectileThrow) {
			if e.Projectile.WeaponInstance.Type == common.EqSmoke {
				smokeProjectiles[e.Projectile.Entity.ID()] = e.Projectile
			}
		})
	*/

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

		gs := p.GameState()
		currentTick := gs.IngameTick()
		frameCount++

		// Log progress every 1000 frames
		if frameCount%1000 == 0 {
			log.Printf("  Parsed %d frames (tick: %d)...\n", frameCount, currentTick)
		}

		var players []PlayerFrame
		for _, pl := range gs.Participants().Playing() {
			pos := pl.Position()
			x, y := pos.X, pos.Y

			if !boundsInited {
				minX, maxX, minY, maxY = x, x, y, y
				boundsInited = true
			} else {
				if x < minX {
					minX = x
				}
				if x > maxX {
					maxX = x
				}
				if y < minY {
					minY = y
				}
				if y > maxY {
					maxY = y
				}
			}

			players = append(players, PlayerFrame{
				ID:    pl.UserID,
				Name:  pl.Name,
				Team:  int(pl.Team),
				X:     x,
				Y:     y,
				Alive: pl.IsAlive(),
				Yaw:   pl.ViewDirectionX(),
			})
		}

		// COMMENTED OUT: Collect active smokes for this frame
		/*
			// Collect active smokes for this frame
			var smokes []SmokeFrame
			for _, smoke := range activeSmokes {
				if smoke.StartTick <= currentTick && (smoke.EndTick == -1 || smoke.EndTick >= currentTick) {
					smokes = append(smokes, *smoke)
				}
			}
		*/

		frames = append(frames, Frame{
			TimeMs:  p.CurrentTime().Milliseconds(),
			Tick:    currentTick,
			Players: players,
			// Smokes:  smokes, // COMMENTED OUT: Projectile/Smoke data
		})
	}

	log.Printf("Parsed total %d frames. Normalizing coordinates...\n", frameCount)

	if boundsInited {
		width := maxX - minX
		height := maxY - minY
		if width == 0 {
			width = 1
		}
		if height == 0 {
			height = 1
		}

		for fi := range frames {
			for pi := range frames[fi].Players {
				pf := &frames[fi].Players[pi]
				pf.X = (pf.X - minX) / width
				pf.Y = (pf.Y - minY) / height
			}

			// COMMENTED OUT: Normalize smoke positions and trajectories
			/*
				// Normalize smoke positions and trajectories
				for si := range frames[fi].Smokes {
					sm := &frames[fi].Smokes[si]
					sm.X = (sm.X - minX) / width
					sm.Y = (sm.Y - minY) / height

					for ti := range sm.Trajectory {
						tp := &sm.Trajectory[ti]
						tp.X = (tp.X - minX) / width
						tp.Y = (tp.Y - minY) / height
					}
				}
			*/
		}

		log.Println("Normalization complete.")
	}

	return &Replay{Frames: frames}, nil
}
