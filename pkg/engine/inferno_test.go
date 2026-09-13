package engine

import (
	"testing"
	"time"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/sendtables"
	"github.com/golang/geo/r3"
)

type infernoTestEntity struct {
	sendtables.Entity
	values map[string]any
}

func (e *infernoTestEntity) ID() int             { return 42 }
func (e *infernoTestEntity) Position() r3.Vector { return r3.Vector{X: 10, Y: 20, Z: -416} }
func (e *infernoTestEntity) PropertyValue(name string) (sendtables.PropertyValue, bool) {
	value, ok := e.values[name]
	return sendtables.PropertyValue{Any: value}, ok
}

func TestInfernoNetworkState(t *testing.T) {
	for _, tt := range []struct {
		name       string
		values     map[string]any
		serverTick uint32
		want       common.EquipmentType
		ttl        int64
	}{
		{"molotov at ignition", nil, 100, common.EqMolotov, 7000},
		{"incendiary lifetime comes from entity", map[string]any{"m_nInfernoType": int32(1), "m_nFireLifetime": float32(5.5)}, 164, common.EqIncendiary, 4500},
		{"partial recording starts during fire", nil, 420, common.EqMolotov, 2000},
		{"expired while entity still exists", nil, 548, common.EqUnknown, 0},
		{"smoke extinguished all flame cells", map[string]any{"m_bFireIsBurning.0000": false}, 164, common.EqUnknown, 0},
		{"post effect is not burning", map[string]any{"m_bInPostEffectTime": true}, 164, common.EqUnknown, 0},
		{"a remaining flame still burns", map[string]any{"m_fireCount": int32(2), "m_bFireIsBurning.0000": false, "m_bFireIsBurning.0001": true}, 164, common.EqMolotov, 6000},
		{"unknown type is not guessed from owner team", map[string]any{"m_nInfernoType": int32(99)}, 164, common.EqUnknown, 0},
		{"missing type is not guessed from nearby trajectory", map[string]any{"m_nInfernoType": nil}, 164, common.EqUnknown, 0},
		{"missing lifetime", map[string]any{"m_nFireLifetime": nil}, 164, common.EqUnknown, 0},
		{"server clock precedes ignition", nil, 99, common.EqUnknown, 0},
	} {
		t.Run(tt.name, func(t *testing.T) {
			values := map[string]any{
				"m_nInfernoType": int32(0), "m_nFireEffectTickBegin": int32(100),
				"m_nFireLifetime": float32(7), "m_bInPostEffectTime": false,
				"m_fireCount": int32(1), "m_bFireIsBurning.0000": true,
			}
			for key, value := range tt.values {
				values[key] = value
			}
			e := &infernoTestEntity{values: values}
			// A CT carrying a molotov still produces a molotov inferno.
			thrower := &common.Player{UserID: 5, Name: "Thrower", Team: common.TeamCounterTerrorists}
			inf := common.NewInferno(nil, e, thrower)
			fire, ok := infernoProjectile(inf, tt.serverTick, time.Second/64)
			if ok != (tt.ttl > 0) || fire.Type != tt.want || fire.TTL != tt.ttl {
				t.Fatalf("type=%v TTL=%d visible=%v; want type=%v TTL=%d", fire.Type, fire.TTL, ok, tt.want, tt.ttl)
			}
			if ok && (fire.EntityID != 42 || fire.ThrowerID != 5 || fire.ThrowerName != "Thrower" || !fire.IsExploded || fire.Z != -416) {
				t.Fatalf("lost inferno identity or position: %+v", fire)
			}
		})
	}
}
