# CS2 Demo 2D 回放查看器

一个基于 Go 的 Web 应用程序，用于在 2D 平面查看 CS2 比赛 Demo 回放。本项目利用 WebAssembly (WASM) 技术，直接在浏览器中解析 CS2 Demo 文件。

## 快速开始 (Quickstart)

### 方式一：生产模式（推荐）

只需三步即可运行本项目：

```bash
# 1. 检查环境（可选）
make check

# 2. 构建所有组件（Proto + WASM + Frontend + Backend）
make all

# 3. 启动服务器
make start
```

启动后，在浏览器访问 `http://localhost:8080`，即可上传 `.dem` 文件并查看回放。

### 方式二：开发模式

适合开发调试，支持热重载：

```bash
# 一键启动后端 + 前端开发服务器
make dev-full
```

- 后端运行在：`http://localhost:8080`
- 前端运行在：`http://localhost:5173`（支持 HMR 热更新）

---

## Makefile 使用指南

本项目提供了完善的 `Makefile` 以简化开发和构建流程。

### 查看所有命令

```bash
make help
```

### 核心命令

| 命令 | 说明 |
|------|------|
| `make check` | 检查开发环境（Go, npm, protoc, make） |
| `make all` | **推荐**。一键清理并重新构建所有组件 |
| `make start` | 启动服务器（需要先 `make all`） |
| `make dev-full` | 开发模式：同时运行后端 + 前端，支持热重载 |
| `make clean` | 清理所有生成的二进制文件 |

### 分阶段构建

| 命令 | 说明 |
|------|------|
| `make proto` | 生成 Protobuf 代码（Go + 复制到前端） |
| `make build-wasm` | 仅编译 WASM 模块 |
| `make build-frontend` | 仅构建前端 |
| `make build-server` | 仅编译后端服务器 |

### 开发常用

| 命令 | 说明 |
|------|------|
| `make dev` | 开发模式运行后端（需要另开终端运行 `make frontend-dev`） |
| `make frontend-dev` | 开发模式运行前端 |
| `make frontend-install` | 安装前端依赖 |
| `make test` | 运行 Go 测试 |
| `make fmt` | 格式化 Go 代码 |
| `make tidy` | 整理 Go 依赖 |

---

## 项目结构

```
.
├── cmd/
│   ├── server/          # 后端 HTTP 服务器，用于提供静态文件服务
│   │   └── main.go
│   └── wasm/            # WASM 核心，导出解析接口给前端
│       └── main.go
├── src/
│   └── engine/          # 核心解析引擎逻辑（Demo 解析与坐标转换）
│       └── engine.go
├── web/
│   └── static/          # 静态资源文件
│       ├── index.html   # 主页面
│       ├── app.js       # 前端控制逻辑与 Canvas 渲染
│       ├── wasm_exec.js # Go WASM 运行时
│       └── main.wasm    # 编译生成的 WASM 模块
├── Makefile             # 自动化构建脚本
├── go.mod               # 依赖管理
└── README.md
```

## 环境要求

- Go 1.24 或更高版本
- Make 工具（推荐）

### 浏览器兼容性

本项目使用了现代浏览器技术（OPFS - Origin Private File System），需要以下浏览器版本：

- **Chrome / Edge**: 86 或更高版本 ✅
- **Safari**: 15.2 或更高版本 ✅  
- **Firefox**: 111 或更高版本 ✅

> **注意**: 旧版本浏览器可能无法正常运行，建议使用最新版本以获得最佳体验。

## 功能特性

- **浏览器端解析**：基于 WASM，无需上传 Demo 到服务器，保护隐私且速度快。
- **2D 视觉呈现**：直观展示选手位置、朝向及存活状态。
- **播放控制**：支持进度拖动、暂停、倍速播放。
- **高效存储**：使用 Protocol Buffers 二进制序列化 + OPFS 文件系统，数据体积减少 40-60%，加载速度提升 2-3 倍。
- **响应式 Canvas**：高性能渲染，适配不同分辨率。

## 技术栈

- **后端**: Go (Net/HTTP)
- **前端**: Vue 3 + TypeScript + PixiJS
- **解析引擎**: Go + WASM ([demoinfocs-golang](https://github.com/markus-wa/demoinfocs-golang))
- **数据序列化**: Protocol Buffers
- **存储**: OPFS (Origin Private File System)

## 许可证

[MIT License]
