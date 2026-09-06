# CS2 AnimGraph 2 兼容修复

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
$env:CS_DEMO_TEST_FILE='C:\path\spirit-vs-falcons-m2-ancient.dem'
go test -count=1 -v ./pkg/localapp -run TestRealDemo
```

真实文件集成测试完整消费 Demo 并遍历每个回合的 JSON，验证时间顺序和回合边界。原始大型 `.dem` 不提交仓库。此修复针对已复现的新字段兼容问题，不代表未来 CS2 协议更新无需继续同步。

本机回归结果（1:4 抽样后的输出帧）：

- `spirit-vs-falcons-m2-ancient.dem`：完整到 EOF，24 个正式回合，37,194 帧。
- `vitality-vs-the-mongolz-m2-dust2.dem`：完整到 EOF，16 个正式回合，31,352 帧。
- `go test -mod=vendor ./...` 通过；真实文件测试需要显式设置上述环境变量，默认跳过。

本地入口恢复 `ResolveFreezeTime: false`：不输出热身、尚未开赛和冻结时间。正式回合编号取 `TotalRoundsPlayed()+1`，开赛重置清空同回合暂存帧，跨回合的第一帧留给下一次读取；结果在 RoundEnd 立即保存。Ancient 原先多出的开场片段及第一回合长时间等待已移除。集成测试校验无冻结帧、回合编号与结果对应、进度单调递增及解析中的库卡片。

文件窗口仅提交本机路径，后端接受后立即显示卡片。底边进度按读取文件字节推进，解析及写入完成才达到 100%；刷新页面恢复正在运行的任务。路径校验失败保留窗口及输入，不再调用旧上传/配额/强制删除流程。
