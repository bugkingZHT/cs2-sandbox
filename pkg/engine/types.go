package engine

import (
	"github.com/markus-wa/demoinfocs-golang/v5/pkg/demoinfocs/common"
)

var ButtonWatching = []common.ButtonBitMask{
	common.ButtonAttack,
	common.ButtonAttack2,
}

type PlayerFrame struct {
	// 玩家在服务器中的唯一 ID
	ID int `json:"id"`
	// 玩家显示的名称
	Name string `json:"name"`
	// 玩家所属队伍 (2=T, 3=CT, 1=Spectator)
	Team int `json:"team"`

	// 玩家在地图上的 X 坐标
	X float64 `json:"x"`
	// 玩家在地图上的 Y 坐标
	Y float64 `json:"y"`
	// 玩家在地图上的 Z 坐标 (高度)
	Z float64 `json:"z"`

	// 玩家的水平视角方向 (0-360)
	Yaw float32 `json:"yaw"`
	// 玩家的垂直视角方向 (-90 到 90)
	Pitch float32 `json:"pitch"`

	// 玩家当前是否存活
	Alive bool `json:"alive"`
	// 玩家当前的生命值 (0-100)
	Health int `json:"health"`
	// 玩家当前的护甲值 (0-100)
	Armor int `json:"armor"`
	// 玩家当前持有的金钱
	Money int `json:"money"`

	// 玩家是否装备了头盔
	HasHelmet bool `json:"hasHelmet"`
	// 玩家是否携带了拆弹器 (仅限 CT)
	HasDefuseKit bool `json:"hasDefuseKit"`
	// 玩家当前是否正在开镜 (狙击枪等)
	IsScoped bool `json:"isScoped"`

	// 玩家被闪光弹致盲的剩余持续时间
	FlashDuration float32 `json:"flashDuration"`
	// 玩家当前是否处于完全致盲状态
	IsBlinded bool `json:"isBlinded"`

	// 玩家当前拥有的所有武器和道具列表
	Inventory []common.EquipmentType `json:"inventory"`
	// 玩家当前手持的武器类型
	ActiveWeapon common.EquipmentType `json:"activeWeapon"`

	// 玩家按键状态
	Buttons []uint64 `json:"buttons"`

	// 玩家本局比赛的总击杀数
	Kills int `json:"kills"`
	// 玩家本局比赛的总助攻数
	Assists int `json:"assists"`
	// 玩家本局比赛的总死亡数
	Deaths int `json:"deaths"`

	// 玩家整场比赛花费的总金额
	MoneySpentTotal int `json:"moneySpentTotal"`
	// 玩家本回合花费的金额
	MoneySpentThisRound int `json:"moneySpentThisRound"`
	// 玩家当前身上装备的总价值
	EquipmentValue int `json:"equipmentValue"`

	// 玩家的 64 位 Steam 唯一标识符
	SteamID uint64 `json:"steamID"`
	// 该玩家是否为机器人 (BOT)
	IsBot bool `json:"isBot"`
}

// 空间坐标点
type Point struct {
	// X 坐标
	X float64 `json:"x"`
	// Y 坐标
	Y float64 `json:"y"`
	// Z 坐标
	Z float64 `json:"z"`
}

// 详细投掷物信息
type ProjectileFrame struct {
	// 投掷物类型 (烟雾弹、闪光弹等)
	Type common.EquipmentType `json:"type"`
	// 当前 X 坐标
	X float64 `json:"x"`
	// 当前 Y 坐标
	Y float64 `json:"y"`
	// 当前 Z 坐标
	Z float64 `json:"z"`
	// 投掷该道具的玩家名称
	ThrowerName string `json:"throwerName"`
	// 投掷该道具的玩家 Steam ID
	ThrowerSteamID uint64 `json:"throwerSteamID"`
	// 投掷物实体的唯一 ID
	EntityID int `json:"entityID"`
	// 投掷物的飞行轨迹路径点
	Trajectory []Point `json:"trajectory"`
	// 投掷物是否已经爆炸或生效 (如烟雾已经散开、火堆正在燃烧)
	IsExploded bool `json:"isExploded"`
}

// 击杀事件信息
type KillEvent struct {
	// 击杀者 ID
	KillerID int `json:"killerId"`
	// 助攻者 ID
	AssistantID int `json:"assistantId"`
	// 使用的武器 ID
	WeaponID common.EquipmentType `json:"weaponId"`
}

// C4 炸弹信息
type BombFrame struct {
	// C4 的 X 坐标
	X float64 `json:"x"`
	// C4 的 Y 坐标
	Y float64 `json:"y"`
	// C4 的 Z 坐标
	Z float64 `json:"z"`
	// 当前是否已安放
	IsPlanted bool `json:"isPlanted"`
	// C4 的详细状态 (planting, defusing, planted, exploded, defused)
	State string `json:"state"`
	// 安放的包点 (A 或 B)
	Site string `json:"site"`
}

// 录像中的单一帧数据
type Frame struct {
	// 当前帧相对于开始的时间 (毫秒)
	TimeMs int64 `json:"timeMs"`
	// 游戏内的 Tick 数
	Tick int `json:"tick"`
	// 当前回合数
	Round int `json:"round"`
	// 当前帧所有玩家的状态信息
	Players    []PlayerFrame     `json:"players"`
	KillEvents map[int]KillEvent `json:"killEvents"`

	// 道具信息（烟、火、闪、雷）
	Projectiles []ProjectileFrame `json:"projectiles"`

	// 掉落在地上的物品信息（类型、位置）
	DroppedEquipment []DroppedEquipment `json:"droppedEquipment"`

	// C4 信息
	Bomb *BombFrame `json:"bomb"`
}

// 地面掉落的装备信息
type DroppedEquipment struct {
	// 装备类型
	Type common.EquipmentType `json:"type"`
	// 掉落位置的 X 坐标
	X float64 `json:"x"`
	// 掉落位置的 Y 坐标
	Y float64 `json:"y"`
	// 掉落位置的 Z 坐标
	Z float64 `json:"z"`
}

// 完整的录像数据
type Replay struct {
	// 包含的所有帧列表
	Frames []Frame `json:"frames"`
	// 地图名称
	MapName string `json:"mapName"`
	// CT队伍名称
	TeamCT string `json:"teamCT"`
	// T队伍名称
	TeamT string `json:"teamT"`
	// CT队伍得分
	ScoreCT int `json:"scoreCT"`
	// T队伍得分
	ScoreT int `json:"scoreT"`
}
