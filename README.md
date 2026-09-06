# cs2-sandbox

基于 `dev` 分支的 CS2 本地 Demo 工具，直接保留原 Web 版 `App.vue`、`DemoLibrary.vue`、`ReplayPlayer.vue` 和原有全局样式。不是另做一套精简播放器 UI。双击 `bin/cs2-sandbox.exe`，默认浏览器立即打开页面。

Demo 库中的“解析 DEMO”可浏览本机文件夹，也可直接粘贴 `.dem` 的绝对路径。后端直接打开原始文件，不上传或复制原始 Demo。解析完成后显示原版比赛卡片，点击回合进入播放器。本次运行中可保留多场比赛，新增 Demo 不会覆盖已有比赛。

- 保留原版可折叠侧导、Demo 库、地图/队伍/玩家筛选、Eco/Half/Full/Pistol 回合过滤。
- 保留玩家完整信息卡、回合结果和经济面板、显示设置、击杀信息、道具分析、导演剪辑、原版时间轴、地图缩放、画笔及纯净模式。
- EXE 内嵌 Vue/Pixi 前端及地图/图标资源；不需要安装 Node、Go、数据库或 WebView2 来运行。
- Go 原生解析，按 1:4 抽样。逐回合写入 `%LOCALAPPDATA%\cs2-sandbox\`，浏览器只持有当前回合。
- 无账号、租户、权限角色、quota、邮件、云同步、WASM 解析或 IndexedDB 同步。浏览器直接通过本地 API 读取原生解析的元数据和回合 JSON。
- 导演剪辑的“导出为新 Demo”保存到本地库（保存的是回放数据，不是重新编码 Valve `.dem`）；页面录制保留浏览器原生 MP4/WebM 格式，不加载 FFmpeg WASM。回放链接仅限本机本次服务运行。
- 监听随机的 `127.0.0.1` 端口；“退出本地工具”关闭服务但保留 Demo 库、元数据、源文件路径和解析缓存（包括导演剪辑）。重启后直接播放，无需重新解析；关闭浏览器标签不会退出服务。库内移除操作删除该记录及缓存，绝不删除原始 `.dem`。
- 仍只需分发一个 EXE，无需安装。首次运行自动创建用户数据目录，替换/移动 EXE 不影响已保存回放；迁移电脑可复制整个数据目录。缓存完整时不依赖原 `.dem`，解析中断或缓存缺失会标记失败并提示重新解析。使用文件级原子写入，独占数据目录避免多个实例同时写入；测试数据使用独立临时目录。
- Windows 新版使用机器级单实例标识，与 EXE 名字、位置和监听端口无关。重复点击只通知已有进程打开浏览器页面，随后立即退出，不创建第二个 server。退出或崩溃后标识由 Windows 释放；`--no-browser` 重复启动只退出，不打开页面。不同 Windows 账户若无权访问已运行实例，也不会启动第二个服务。

单实例实现使用 [Windows 全局命名对象](https://learn.microsoft.com/en-us/windows/win32/termserv/kernel-object-namespaces) 与 [自动重置事件](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-createeventw)，不依赖端口扫描、进程名或永久锁文件。

## 构建

开发环境：Windows x64、Go 1.24+、Node.js 20+、pnpm 11+。

```powershell
.\build-local.ps1
```

或者：

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm build
cd ..
go build -mod=vendor -trimpath -ldflags="-s -w -H windowsgui" -o bin/cs2-sandbox.exe ./cmd/local
```

请分发 `cs2-sandbox.exe`。此前的 `cs2-demo-replay.exe` 是旧原型，不属于此版本。

诊断启动：`cs2-sandbox.exe --no-browser --listen 127.0.0.1:18765`。普通运行不需要参数。测试用控制台构建可去掉 `-H windowsgui`，终端会打印页面地址。

## 当前代码结构

| 路径 | 本地版职责 |
| --- | --- |
| `cmd/local` | EXE 启动、回环监听、默认浏览器、服务退出 |
| `pkg/localapp` | 文件夹浏览、原生解析任务、进度、多比赛库和单回合接口 |
| `pkg/engine`、`pkg/demoinfocs` | 复用 dev 的完整原生解析器 |
| `frontend/src/App.vue`、`components/DemoLibrary`、`components/ReplayPlayer` | 原 Web 版布局、筛选和播放器 UI |
| `frontend/src/local`、`composables/useReplayData.ts` | 本机文件选择、会话令牌、本地 JSON 数据适配 |
| `frontend/src/components/ReplayPlayer/MapCanvas.vue` | 复用 dev 的地图渲染、玩家和道具显示 |
| `frontend/vite.local.config.ts` | 仅打包本地入口及地图/图标 |
| `web/localdist` | 前端构建结果，编译时嵌入 EXE |

原 `cmd/server`、账号/数据库模块保留作为历史参考，不在本地 EXE 的依赖和构建路径中。旧 Web 说明移到 `docs/legacy-web.md`。构建会检查前端依赖图，拒绝把认证、WASM、IndexedDB 或浏览器端 Protobuf 解析链路重新打入本地版。

## 测试

```powershell
go test ./pkg/localapp
cd frontend
pnpm test:local
cd ..
$env:CS_DEMO_TEST_FILE='C:\path\match.dem'
go test -v ./pkg/localapp -run TestRealDemo
```

集成测试直接读取外部 Demo，遍历所有回合，检查元数据、帧时间顺序、回合边界以及 API 会话隔离，结束自动清理临时数据。未知地图会提示缺少底图，解析错误显示在页面。内嵌解析器已回移上游 AnimGraph 2 的 `CGlobalSymbol` / `CUtlBinaryBlock` 修复，详见 [兼容性说明](docs/parser-compatibility.md)。未来 CS2 协议更新仍需持续同步。
