# CS2 Demo 2D 回放查看器

一个基于 Go 的 Web 应用程序，用于在 2D 平面查看 CS2 比赛 Demo 回放。本项目利用 WebAssembly (WASM) 技术，直接在浏览器中解析 CS2 Demo 文件。

## 快速开始 (Quickstart)

只需两步即可运行本项目：

1. **构建项目**：
   ```bash
   make all
   ```
2. **启动服务**：
   ```bash
   make run-server
   ```
启动后，在浏览器访问 `http://localhost:8080`，即可上传 `.dem` 文件并查看回放。

---

## Makefile 使用指南

本项目提供了完善的 `Makefile` 以简化开发和构建流程。

### 核心命令

- `make help`: 查看所有可用的命令及其说明。
- `make all`: **推荐使用**。一键清理并重新构建 WASM 模块和后端服务器。
- `make build-wasm`: 仅编译 Go 源码为 WASM 模块，并同步更新 `wasm_exec.js`。
- `make build-server`: 仅编译后端 Go 服务器。
- `make run-server`: 编译并启动后端服务器。
- `make clean`: 清理所有生成的二进制文件和 WASM 产物。

### 开发常用

- `make run-dev`: 以开发模式直接通过 `go run` 启动服务器。
- `make build-wasm-dev`: 快速构建 WASM 模块。
- `make tidy`: 整理 Go 依赖。
- `make vendor`: 更新 `vendor` 目录，确保依赖离线可用。

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

## 功能特性

- **浏览器端解析**：基于 WASM，无需上传 Demo 到服务器，保护隐私且速度快。
- **2D 视觉呈现**：直观展示选手位置、朝向及存活状态。
- **播放控制**：支持进度拖动、暂停、倍速播放。
- **本地缓存**：利用 IndexedDB 缓存解析后的数据，二次加载秒开。
- **响应式 Canvas**：高性能渲染，适配不同分辨率。

## 技术栈

- **后端**: Go (Net/HTTP)
- **前端**: 原生 JavaScript + HTML5 Canvas
- **解析引擎**: Go + WASM ([demoinfocs-golang](https://github.com/markus-wa/demoinfocs-golang))
- **存储**: IndexedDB

## 许可证

[MIT License]
