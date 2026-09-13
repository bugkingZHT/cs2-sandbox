# 射击显示

射击效果由 `WeaponFire` 驱动，不使用 `buttons` 判断是否开火。按住攻击键不代表武器发射了子弹；真人的输入按键也可能没有与武器状态在同一帧中出现。

CS2 的 `WeaponFire` 来自武器实体 `m_fLastShotTime` 的更新。绑定实体时记录已有值，只有后续时间增加才触发事件，避免创建实体或重复状态更新把历史射击重新触发。刀、C4 和投掷物的事件不计入枪火；电击枪计入。

引擎按玩家累计两张输出帧之间的事件，在 `shotsFired` 中输出次数，并保存最后一枪的 `shotYaw`。输出后清空累计，回合开始时也清空。前端直接使用这些字段，即使采样时已经松开攻击键、换刀或死亡，也不会因此隐藏刚发生的射击。没有开火事件时不绘制射线。旧缓存不补算，也不回退到按键推断。

JSON、Protobuf 和前端转换保持一致。`xxttggxg.dem` 前两回合去重后有 275 次真人枪械开火；默认采样下，181 次的下一张采样帧没有左键标记。回归测试覆盖逐帧、1:4、1:8 采样，并按玩家、回合核对仍在输出帧中的玩家的开火计数；已断开且不在输出中的玩家不参与这项比较。

同一时刻可能有多张输出帧；播放器只选择最后一张。解析时把同一时刻前面帧中的射击移到最后一张，避免零时长状态帧吞掉射击，同时保持计数不重复。

验证：

```powershell
$env:CS_SHOT_TEST_FILE = 'C:\Users\A\Desktop\xxttggxg.dem'
go test -mod=vendor ./pkg/engine -run 'TestRecordGunshots|TestDemoShooting' -count=1 -v
go test -mod=vendor ./pkg/engine/entity
```

前端的 `test-player-display.mjs` 验证射线几何、右键开火、空按攻击键、换刀、死亡、瞄准方向和下一帧清除效果；`test-local-data.mjs` 验证数据加载时保留开火字段。
