# Local HTTP contract

服务由 cs2-sandbox 启动，端口动态分配。「AI 技能」提示词中的连接地址为 `http://127.0.0.1:<port>/#<token>`。

所有 API 请求携带 `X-Local-Token: <token>`。token 是 URL fragment 中的 64 位小写十六进制字符串，不放入 query 或 body。连接过期返回 403。保留服务的 loopback 限制，不开放 CORS。

## Tools

`GET /api/library` 返回 State 数组。选择 `status == "ready"` 的条目，请求使用 `id`（缓存 ID），不是 `meta.uuid`。`name` 是文件名，`meta.mapName` 是地图，`rounds` 是解析完成的回合列表。

`POST /api/skills/grenades`，`Content-Type: application/json`：

```json
{"demoIds":["cache-id"],"side":"T","radius":120,"heightTolerance":80}
```

- `demoIds`: 1–50 个已完成的本地缓存 ID，重复 ID 只计一次。扫描所选对局全部已解析回合及所有玩家。
- `side`: `T` / `CT` / `both`。以出手帧玩家 `team`（2 / 3）为准，包含换边和加时。
- `radius`: XY 距离容差，16–512 游戏单位，省略或 0 使用 120。
- `heightTolerance`: 绝对 Z 高差容差，16–256，省略或 0 使用 80。
- 400: 参数或对局选择错误；409: 缓存损坏或缺少出手阵营，需要重新解析。发生错误时不返回部分排名。

响应包括 `radius`, `heightTolerance`, `method`, `warnings`, `groups`。

每个 group 包含 `map`, `side`, `kind`（`smoke`, `flash`, `fire`, `he`）, `totalThrows`, `top10`。没有投掷的分类不出现在 groups 中。

每个 cluster 包含 `count`, `center: {x,y,z}`, `occurrences`。`count` 是投掷次数，不是不同玩家或回合数。`center` 为实际落点锚点；按最多邻居选锚，水平距离和高差同时符合才归组，归组后移除，最多十组。平局按缓存 ID、回合、帧、实体顺序，结果可重复。

每条 occurrence 包含 `demoId`, `demoName`, `round`, `entityId`, `thrower`, `frameId`, `timeMs`, `tick`, `landing`, `landingSource`, `url`。frameId 为该回合缓存帧的零基索引。同一实体连续出现只计一次；消失后重用的实体另计一次。

`landingSource` 为 `effect`（首次生效位置）、`trajectory-end`（最后飞行轨迹端点估计）或 `last-observed`（最后观测位置估计）。独立火堆实体不再计数。采样未捕获的投掷无法补造；仅有生效帧的烟、闪、雷被排除并在 warnings 中记录。

`url` 形如 `http://127.0.0.1:<port>/replayer?demo_uuid=...&round=...&frameId=...&grenadeId=...&hidePlayers=2%2C3%2C4#<token>`。`hidePlayers` 是逗号分隔的其他玩家 ID，包含该回合完整玩家名单并排除投掷者；保留该参数。打开后只显示投掷者，暂停到出手帧并进入道具解析，可手动查看按键、人物位置和瞄点。退出道具解析仍保留链接指定的隐藏状态，用户可通过玩家小眼睛手动恢复。它是含会话凭据的本地链接，不可公开分享。
