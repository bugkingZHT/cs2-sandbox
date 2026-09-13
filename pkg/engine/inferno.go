package engine

import (
	"fmt"
	"math"
	"time"

	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

// Infernos have their own IDs, type and server-clock lifetime. Rendering them
// does not require guessing which flying projectile created them.
func infernoProjectile(inf *common.Inferno, serverTick uint32, tickTime time.Duration) (entity.ProjectileFrame, bool) {
	if inf == nil || inf.Entity == nil || tickTime <= 0 {
		return entity.ProjectileFrame{}, false
	}
	e := inf.Entity
	typeValue, _ := e.PropertyValue("m_nInfernoType")
	kind, ok := typeValue.Any.(int32)
	if !ok {
		return entity.ProjectileFrame{}, false
	}
	var equipment common.EquipmentType
	switch kind {
	case 0:
		equipment = common.EqMolotov
	case 1:
		equipment = common.EqIncendiary
	default:
		return entity.ProjectileFrame{}, false
	}
	postValue, _ := e.PropertyValue("m_bInPostEffectTime")
	if post, _ := postValue.Any.(bool); post {
		return entity.ProjectileFrame{}, false
	}
	startValue, _ := e.PropertyValue("m_nFireEffectTickBegin")
	startTick, hasStart := startValue.Any.(int32)
	lifetimeValue, _ := e.PropertyValue("m_nFireLifetime")
	lifetime, hasLifetime := lifetimeValue.Any.(float32)
	if !hasStart || !hasLifetime || int64(serverTick) < int64(startTick) || lifetime <= 0 || math.IsNaN(float64(lifetime)) || math.IsInf(float64(lifetime), 0) {
		return entity.ProjectileFrame{}, false
	}
	elapsed := time.Duration(int64(serverTick)-int64(startTick)) * tickTime
	ttl := (time.Duration(float64(lifetime)*float64(time.Second)) - elapsed).Milliseconds()
	if ttl <= 0 {
		return entity.ProjectileFrame{}, false
	}

	// The entity can survive after burning ends, including after smoke extinguishes it.
	countValue, _ := e.PropertyValue("m_fireCount")
	count, _ := countValue.Any.(int32)
	burning := false
	for i := int32(0); i < count; i++ {
		value, _ := e.PropertyValue(fmt.Sprintf("m_bFireIsBurning.%04d", i))
		if active, _ := value.Any.(bool); active {
			burning = true
			break
		}
	}
	if !burning {
		return entity.ProjectileFrame{}, false
	}

	pos := e.Position()
	fire := entity.ProjectileFrame{Type: equipment, EntityID: e.ID(), X: pos.X, Y: pos.Y, Z: pos.Z, IsExploded: true, TTL: ttl}
	if thrower := inf.Thrower(); thrower != nil {
		fire.ThrowerID, fire.ThrowerName = thrower.UserID, thrower.Name
	}
	return fire, true
}
