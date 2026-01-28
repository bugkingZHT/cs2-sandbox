package entity

import (
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
