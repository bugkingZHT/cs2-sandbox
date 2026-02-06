package entity

import (
	"github.com/bugkingzht/cs-demobox/pkg/demoinfocs/common"
)

var ButtonWatching = []common.ButtonBitMask{
	common.ButtonAttack,
	common.ButtonAttack2,
}

type PlayerFrame struct {
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
}

// PlayerInfo 在对局元数据中保存的玩家基础信息（不随帧变化）

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
	// 投掷该道具的玩家对局内 ID (对应 PlayerFrame.ID)
	ThrowerID int `json:"throwerID"`
	// 投掷物实体的唯一 ID
	EntityID int `json:"entityID"`
	// 投掷物尚未经过的关键碰撞点（checkpoints）
	// 每帧只保存当前飞行路径上还未到达的碰撞点
	// 前端渲染时连接：当前坐标(X, Y) -> trajectory[0] -> trajectory[1] -> ...
	Trajectory []Point `json:"trajectory"`
	// 投掷物是否已经爆炸或生效 (如烟雾已经散开、火堆正在燃烧)
	IsExploded bool `json:"isExploded"`
	// Time To Live: 剩余生存时间 (毫秒)，当投掷物爆炸后表示距离消失的毫秒数
	TTL int64 `json:"ttl,omitempty"`
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

// 回合阶段状态
type RoundPhase string

const (
	// 冻结时间（买枪阶段）
	RoundPhaseFreezeTime RoundPhase = "freezetime"
	// 正常游戏时间
	RoundPhaseNormal RoundPhase = "normal"
	// C4 已安放，倒计时中
	RoundPhaseBombPlanted RoundPhase = "planted"
	// 回合结束
	RoundPhaseEnd RoundPhase = "end"
)

// 回合胜负结果类型
type RoundResult string

const (
	// CT 胜利（非拆弹获胜）
	RoundResultCTWin RoundResult = "ct_win"
	// T 胜利（非爆炸获胜）
	RoundResultTWin RoundResult = "t_win"
	// CT 拆弹获胜
	RoundResultBombDefused RoundResult = "bomb_defused"
	// T 炸弹爆炸获胜
	RoundResultBombExploded RoundResult = "bomb_exploded"
)

// 单回合结果信息
type RoundResultInfo struct {
	// 回合编号
	Round int `json:"round"`
	// 回合结果
	Result RoundResult `json:"result"`
}

// 回合时间信息
type RoundTimeInfo struct {
	// 当前回合阶段
	Phase RoundPhase `json:"phase"`
	// 倒计时剩余秒数（浮点数，保留小数）
	// FreezeTime: 冻结时间剩余秒数
	// Normal: 回合时间剩余秒数
	// BombPlanted: C4 爆炸倒计时剩余秒数
	// End: 0
	TimeRemaining float64 `json:"timeRemaining"`
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
	// 回合时间信息（阶段 + 倒计时）
	RoundTime RoundTimeInfo `json:"roundTime"`
	// 当前帧所有玩家的状态信息
	// 玩家 ID -> 玩家信息的映射
	Players map[int]PlayerFrame `json:"players"`
	// 击杀事件
	KillEvents map[int]KillEvent `json:"killEvents"`

	// 道具信息（烟、火、闪、雷）
	// 投掷物实体的唯一 ID -> 投掷物信息
	Projectiles map[int]ProjectileFrame `json:"projectiles"`
	// 投掷物渲染顺序
	// 类型优先：诱 -> 雷 -> 闪 -> 烟 -> 火
	// 时间其次：从新到旧
	SortedProjs []int `json:"sortedProjs"`

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

// 单个回合的录像数据
type ReplayRound struct {
	// 对局唯一标识符 UUID
	UUID string `json:"uuid"`
	// 回合编号
	Round int `json:"round"`
	// 包含的所有帧列表
	Frames []Frame `json:"frames"`
}

type PlayerInfo struct {
	// 玩家在服务器中的唯一 ID
	ID int `json:"id"`
	// 玩家显示的名称
	Name string `json:"name"`
	// 玩家所属队伍 (2=T, 3=CT, 1=Spectator)
	Team int `json:"team"`
	// 玩家的 64 位 Steam 唯一标识符
	SteamID uint64 `json:"steamID"`
	// 该玩家是否为机器人 (BOT)
	IsBot bool `json:"isBot"`
}

// 录像元数据（地图整体信息）
type ReplayMeta struct {
	// 对局唯一标识符 UUID
	UUID string `json:"uuid"`
	// 上传用户 UID (6位字符串)
	UploaderUID string `json:"uploaderUid"`
	// 上传时间戳 (Unix milliseconds)
	UploadTime int64 `json:"uploadTime"`
	// 引擎版本号
	EngineVersion string `json:"engineVersion"`

	// 服务器玩家信息
	ServerPlayer []PlayerInfo `json:"serverPlayer"`
	// 投掷物渲染配置
	ProjectileRender map[common.EquipmentType]ProjectileRenderConfig `json:"projectileRenderConfig"`
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
	// 总回合数
	TotalRounds int `json:"totalRounds"`
	// 总游戏帧数（含 round0/freeze 与未采样的帧）
	TotalRawFrames int `json:"totalRawFrames,omitempty"`
	// 总采样并保存的帧数（实际输出的 replay 帧数）
	TotalParsedFrames int `json:"totalParsedFrames,omitempty"`
	// 每回合胜负结果列表
	RoundResults []RoundResultInfo `json:"roundResults"`
	// 原始上传文件名（不带.dem后缀）
	FileName string `json:"fileName,omitempty"`
	// 原始上传文件路径（完整路径）
	OriginPath string `json:"originPath,omitempty"`

	// 解析状态统一字段
	Status          int    `json:"status"`                    // 0=解析中, 1=完成, -1=失败
	ParsingProgress int    `json:"parsingProgress,omitempty"` // 0-100
	ParsingStatus   string `json:"parsingStatus,omitempty"`   // 状态描述文本
	LastTickTime    int64  `json:"lastTickTime,omitempty"`    // 最后tick时间戳（用于超时检测）
}
