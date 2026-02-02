package entity

import (
	"sort"

	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"
)

// 投掷物渲染配置
type ProjectileRenderConfig struct {
	// 爆炸半径（游戏坐标单位）
	ExplosionRadius float64 `json:"explosionRadius"`
	// 生效时间（例如手雷炸烟效果时间）
	DurationInMs int64 `json:"durationInMs"`
	// 是否可以炸开烟雾（仅手雷）
	CanClearSmoke bool `json:"canClearSmoke,omitempty"`
	// 是否可以灭火（烟雾弹特有）
	CanExtinguishFire bool `json:"canExtinguishFire,omitempty"`
}

// 投掷物渲染优先级（数值越小优先级越高）
var projectileRenderPriority = map[common.EquipmentType]int{
	common.EqDecoy:      1, // 诱饵弹优先级最高
	common.EqHE:         2, // 高爆手雷
	common.EqFlash:      3, // 闪光弹
	common.EqSmoke:      4, // 烟雾弹
	common.EqMolotov:    5, // T 火（燃烧瓶）
	common.EqIncendiary: 5, // CT 火（燃烧弹）- 与 Molotov 同优先级
}

var projectileRenderConfig = map[common.EquipmentType]ProjectileRenderConfig{
	common.EqDecoy: {
		ExplosionRadius: 50,
		DurationInMs:    15000,
	},
	common.EqSmoke: {
		ExplosionRadius:   160, // 烟雾弹爆炸范围 160 游戏坐标
		DurationInMs:      20000,
		CanExtinguishFire: true,
	},
	common.EqMolotov: {
		ExplosionRadius: 200, // T 火（燃烧瓶）范围 200 游戏坐标
		DurationInMs:    7000,
	},
	common.EqIncendiary: {
		ExplosionRadius: 160, // CT 火（燃烧弹）范围 160 游戏坐标
		DurationInMs:    7000,
	},
	common.EqHE: {
		ExplosionRadius: 160, // HE 手雷爆炸范围 160 游戏坐标
		DurationInMs:    3000,
		CanClearSmoke:   true,
	},
	common.EqFlash: {
		ExplosionRadius: 640,
		DurationInMs:    500, // 闪光弹效果时间
	},
}

// GetProjectileConfig returns the default projectile render configuration
func GetProjectileConfig() map[common.EquipmentType]ProjectileRenderConfig {
	return projectileRenderConfig
}

// GetProjectileConfigByType returns the default projectile render configuration for a given projectile type
func GetProjectileConfigByType(equipmentType common.EquipmentType) ProjectileRenderConfig {
	return projectileRenderConfig[equipmentType]
}

// GetProjectileRenderPriority returns the render priority for a projectile type (lower number = higher priority)
func GetProjectileRenderPriority(equipmentType common.EquipmentType) int {
	if priority, ok := projectileRenderPriority[equipmentType]; ok {
		return priority
	}
	return 999 // Unknown types have lowest priority
}

// SortProjectilesByPriority sorts projectile entity IDs by:
// 1. Type priority (Decoy > HE > Flash > Smoke > Fire)
// 2. TTL (higher TTL = newer = higher priority)
func SortProjectilesByPriority(projectiles map[int]ProjectileFrame) []int {
	// Extract entity IDs
	entityIDs := make([]int, 0, len(projectiles))
	for id := range projectiles {
		entityIDs = append(entityIDs, id)
	}

	// Sort by type priority first, then by TTL (descending)
	sort.Slice(entityIDs, func(i, j int) bool {
		projI := projectiles[entityIDs[i]]
		projJ := projectiles[entityIDs[j]]

		// Compare type priority first
		priorityI := GetProjectileRenderPriority(projI.Type)
		priorityJ := GetProjectileRenderPriority(projJ.Type)

		if priorityI != priorityJ {
			return priorityI < priorityJ // Lower priority number = render first
		}

		// If same priority, sort by TTL (higher TTL = newer = render first)
		return projI.TTL > projJ.TTL
	})

	return entityIDs
}

// SortInventoryByType sorts inventory equipment types by their numeric value for consistent display
func SortInventoryByType(inventory []common.EquipmentType) {
	sort.Slice(inventory, func(i, j int) bool {
		return inventory[i] < inventory[j]
	})
}
