# CS2 Demo 解析兼容修复

## 燃烧效果直接读取 Inferno 网络状态

`example-nuke.dem` 第二回合最早的两处火焰属于 两名测试玩家（分别投掷燃烧瓶和燃烧弹）。原实现把 `InfernoStart` 写成 `EqUnknown`，再用上一输出帧的附近弹体猜类型。距离平方与线性阈值混用使匹配范围只有约 14 单位，而样本中的弹体与火焰起点相差约 67 和 42 单位，最终导出未知类型、TTL 为 0。

最终方案移除了空间匹配及烟雾距离灭火推测。每个输出帧直接读取 `GameState.Infernos()`：

- `m_nInfernoType`：0 为燃烧瓶，1 为燃烧弹；不按投掷者阵营猜类型。
- `m_hOwnerEntity`：通过解析器的 `Inferno.Thrower()` 获取投掷者。
- `m_nFireEffectTickBegin` 与 `m_nFireLifetime`：使用 `CNETMsg_Tick` 的服务器时钟计算剩余时长，不能使用 demo 相对 tick；样本中两种火分别为 7 秒和 5.5 秒。
- `m_bFireIsBurning` 与 `m_bInPostEffectTime`：实体还存在但已停止燃烧时，不再输出效果；也不从上一帧复制已消失的火焰。

这些是当前样本实际传输的实体字段。字段定义亦可参照 [CounterStrikeSharp CInferno](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.CInferno.html)，燃烧点状态读取可参照 [demoinfocs Inferno 实现](https://github.com/markus-wa/demoinfocs-golang/blob/master/pkg/demoinfocs/common/inferno.go)。不支持的火焰类型或缺失的关键状态不会通过附近弹体、投掷者阵营进行猜测。此修复识别火焰效果及所属玩家，不将独立的 inferno ID 冒充原弹体 ID。

`TestInfernoNetworkState` 覆盖真实时长、回放从燃烧中途开始、提前灭火、残留效果、部分火点存活及缺失字段。`TestDemoRoundTwoFireEffects` 在 1:1、1:4、1:8 采样下验证上述两处火焰的类型、正 TTL 和完整持续时间：

```powershell
$env:CS_FIRE_TEST_FILE="$env:USERPROFILE/Desktop/example.dem"
go test -mod=vendor -count=1 -v ./pkg/engine -run 'TestInfernoNetworkState|TestDemoRoundTwoFireEffects'
```

已解析的缓存需用新构建重新解析，才能补齐这些燃烧效果。

## 文件头缺少地图名的录制兼容

`example-nuke.dem`（network protocol 14181）的首条 `CDemoFileHeader.map_name` 为空，第二条 demo command 中的 `CSVCMsg_ServerInfo.map_name` 为 `de_nuke`；`host_map` 也为空。`example-dust2.dem` 同样缺少文件头地图名，但 ServerInfo 提供 `de_dust2`。因此不能只在第一条 command 之后读取文件头，也不能只依赖 ConVar 兜底。

修复在内嵌解析器中用 ServerInfo 补齐空的 Header.MapName，保留已有文件头值。共享 engine 在地图缺失时最多继续解析 64 条开场 command，遇到地图名或正式比赛开始即停止；最后一条预读 command 留给回合迭代器处理，保持帧统计和采样位置。原有 `host_map` 兜底保留，BackfillMeta 也会补齐稍后才出现的地图名。本地与 WASM 共用此逻辑。

`pkg/engine/map_metadata_test.go` 用真实 protobuf demo 消息流覆盖正常文件头、空地图名、延迟 signon、预读上限及最终回填、全部来源缺失，并检查消费 command 数和原始帧计数。真实文件测试新增非空地图断言及可选 `CS_DEMO_TEST_MAP` 预期值。

本机完整解析与缓存重载回归：`example-nuke.dem` 为 `de_nuke`，24 回合、61,011 帧，与原缓存帧数一致；Ancient 对照文件为 `de_ancient`，24 回合、37,194 帧。WASM 编译通过。已有 `entry.json` 不会因源码更新自动迁移，使用新构建重新解析后才会写入修复后的地图名。

```powershell
$env:CS_DEMO_TEST_FILE="$env:USERPROFILE/Desktop/example.dem"
$env:CS_DEMO_TEST_MAP='de_nuke'
go test -mod=vendor -count=1 -v ./pkg/localapp -run '^TestRealDemo$'
go test -mod=vendor ./pkg/engine -run TestMapMetadataSources
```

项目使用的是 `pkg/demoinfocs` 内嵌源码，而不是直接引用上游 Go module；仅执行 `go get -u` 不会更新实际解析器。

## 原因与上游来源

Spirit vs Falcons / Ancient 的测试文件在解析初期报 `unable to find existing entity 158`。实体编号错误是数据流已经错位的后果，不应通过跳过实体或开启忽略 panic 来规避。

本次按上游原实现回移两个字段解码修复，保留项目自己的 engine 和解析器改动：

- `CGlobalSymbol`：以 NUL 结尾的字符串，不能退回默认 varuint32 解码。上游 [PR #653](https://github.com/markus-wa/demoinfocs-golang/pull/653)，提交 `696210ba10a327b1b68dea67215aab6627d66666`。
- `CUtlBinaryBlock`：先读 varuint32 长度，再完整读取二进制内容。上游 [PR #646](https://github.com/markus-wa/demoinfocs-golang/pull/646)，提交 `950dc1692345a8a1ef0b7c09babf220116aa78b2`。

仅补第一项后该文件仍在开始阶段失败（实体编号变为 2982048）；补齐两项后完整解析到 EOF。没有替换为 v6 预发布版本，也没有关闭解析异常检查。

## 回归

`field_decoder_test.go` 覆盖两个类型在全部 8 个位偏移下的解码、空值、二进制零字节、多字节长度，并校验后续字段仍对齐。

```powershell
go test ./pkg/demoinfocs/sendtables/sendtablescs2
$env:CS_DEMO_TEST_FILE='C:\path\example-ancient.dem'
go test -count=1 -v ./pkg/localapp -run TestRealDemo
```

真实文件集成测试完整消费 Demo 并遍历每个回合的 JSON，验证时间顺序和回合边界。原始大型 `.dem` 不提交仓库。此修复针对已复现的新字段兼容问题，不代表未来 CS2 协议更新无需继续同步。

本机回归结果（1:4 抽样后的输出帧）：

- `example-ancient.dem`：完整到 EOF，24 个正式回合，37,194 帧。
- `vitality-vs-the-mongolz-m2-dust2.dem`：完整到 EOF，16 个正式回合，31,352 帧。
- `go test -mod=vendor ./...` 通过；真实文件测试需要显式设置上述环境变量，默认跳过。

本地入口恢复 `ResolveFreezeTime: false`：不输出热身、尚未开赛和冻结时间。正式回合编号取 `TotalRoundsPlayed()+1`，开赛重置清空同回合暂存帧，跨回合的第一帧留给下一次读取；结果在 RoundEnd 立即保存。Ancient 原先多出的开场片段及第一回合长时间等待已移除。集成测试校验无冻结帧、回合编号与结果对应、进度单调递增及解析中的库卡片。

文件窗口仅提交本机路径，后端接受后立即显示卡片。底边进度按读取文件字节推进，解析及写入完成才达到 100%；刷新页面恢复正在运行的任务。路径校验失败保留窗口及输入，不再调用旧上传/配额/强制删除流程。
