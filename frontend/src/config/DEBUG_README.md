# 调试功能说明文档

本文档介绍 CS2 Demo Viewer 中的调试功能配置和使用方法。

---

## 📋 目录

- [概述](#概述)
- [配置文件](#配置文件)
- [Frame Data Viewer（帧数据查看器）](#frame-data-viewer帧数据查看器)
- [OPFS Storage Viewer（存储查看器）](#opfs-storage-viewer存储查看器)
- [控制台调试工具](#控制台调试工具)
- [生产环境配置](#生产环境配置)

---

## 概述

为了便于开发调试和问题排查，项目内置了两个可配置的调试工具：

1. **Frame Data Viewer** - 查看当前帧的完整数据结构
2. **OPFS Storage Viewer** - 查看浏览器存储中的所有回放文件

这些工具可以通过配置文件统一管理，支持在生产环境中关闭。

---

## 配置文件

**文件位置**: `frontend/src/config/debug.ts`

```typescript
export const DEBUG_CONFIG = {
  /**
   * 启用帧数据查看器
   * 在时间轴控制栏显示调试按钮，点击后在新标签页查看当前帧数据
   */
  enableFrameDataViewer: true,

  /**
   * 启用 OPFS 存储查看器
   * 在 Demo Library 头部显示 OPFS 按钮，点击后查看存储详情
   */
  enableOPFSStorageViewer: true,
};
```

### 使用方式

```typescript
import { DEBUG_CONFIG } from '@/config/debug';

// 在组件中使用
if (DEBUG_CONFIG.enableFrameDataViewer) {
  // 显示调试按钮
}
```

---

## Frame Data Viewer（帧数据查看器）

### 功能说明

查看当前播放帧的完整数据结构，包括玩家状态、投掷物、击杀事件等。

### 使用位置

**时间轴控制栏** - 播放控制区域的右侧

### 触发方式

1. 播放回放时，时间轴上会显示一个 **⚡ 闪电图标** 的调试按钮
2. 按钮显示当前帧号：`Frame 1234`
3. 点击按钮后，在新标签页打开帧数据详情

### 显示内容

以 JSON 格式展示当前帧的完整数据：

```json
{
  "timeMs": 12345,
  "tick": 1234,
  "round": 1,
  "roundTime": {
    "phase": "live",
    "timeRemaining": 95.5
  },
  "players": {
    "1": {
      "id": 1,
      "name": "Player1",
      "team": 2,
      "x": 1234.5,
      "y": 567.8,
      "alive": true,
      "health": 100,
      "armor": 100,
      "inventory": ["4", "1", "32"],
      "activeWeapon": "4"
    }
  },
  "projectiles": { ... },
  "killEvents": { ... }
}
```

### 适用场景

✅ 调试玩家位置不准确  
✅ 排查投掷物渲染问题  
✅ 验证数据结构正确性  
✅ 分析回合时间计算  
✅ 检查击杀事件记录  

### 界面样式

- 🌑 深色主题（与主应用一致）
- 💻 等宽字体（Courier New）
- 📝 语法高亮
- 📱 自适应换行

---

## OPFS Storage Viewer（存储查看器）

### 功能说明

查看浏览器 OPFS（Origin Private File System）中存储的所有回放文件详情。

### 使用位置

**Demo Library 页面** - 页面头部，"上传 Demo" 按钮左侧

### 触发方式

点击 **📁 OPFS** 按钮（黄色，文件夹图标）

### 显示内容

在新标签页打开一个精美的页面，包含以下信息：

#### 1. 💾 Storage Usage（存储使用情况）

```
Used: 145.67 MB
Quota: 10240.00 MB
Usage: 1.42%
```

#### 2. 📍 Physical Storage Path（物理存储路径）

根据浏览器和操作系统自动识别，显示 OPFS 数据的可能存储位置。

**macOS + Chrome 示例：**
```
Browser: Chrome
OS: macOS
Path: ~/Library/Application Support/Google/Chrome/Default/File System/
```

**支持的浏览器/系统组合：**
- Chrome/Edge on macOS/Windows/Linux
- Safari on macOS
- Firefox on macOS/Windows/Linux

**⚠️ 注意：** 路径为估算值，OPFS 数据以索引/加密格式存储。

#### 3. 📁 OPFS File Structure（文件结构）

```
Total: 2 replay(s)

📦 UUID: 550e8400-e29b-41d4-a716-446655440000
  📄 meta.pb (182 bytes)
  📄 round_1.pb (145678 bytes)
  📄 round_2.pb (132456 bytes)
  📄 round_3.pb (128934 bytes)

📦 UUID: 660e8400-e29b-41d4-a716-446655440001
  📄 meta.pb (182 bytes)
  📄 round_1.pb (156789 bytes)
```

#### 4. 💡 Console Commands（控制台命令）

页面底部提供控制台命令提示，用于高级调试：

```javascript
await window.debugOPFS.listFiles()
await window.debugOPFS.downloadFile(uuid, 'meta.pb')
await window.debugOPFS.downloadFile(uuid, 'round_1.pb')
await window.debugOPFS.getStorageUsage()
window.debugOPFS.showStoragePath()
```

### 适用场景

✅ 验证数据是否成功保存  
✅ 检查文件大小是否正常  
✅ 排查存储相关 bug  
✅ 监控存储空间使用  
✅ 开发时快速查看 OPFS 状态  
✅ 下载 protobuf 文件进行分析  

### 界面样式

- 🌌 深色渐变背景
- 📦 卡片式布局（圆角、半透明）
- 🎯 信息层次清晰
- 💻 代码块高亮
- ✨ 现代化设计风格

---

## 控制台调试工具

除了 UI 按钮，还提供了一套控制台 API 用于更深入的调试。

### 全局对象：`window.debugOPFS`

在浏览器控制台（F12）中可用，页面加载时自动注册。

### API 列表

#### 1. 列出所有文件

```javascript
await window.debugOPFS.listFiles()
```

**返回值：**
```javascript
[
  {
    uuid: "550e8400-e29b-41d4-a716-446655440000",
    files: [
      "meta.pb (182 bytes)",
      "round_1.pb (145678 bytes)",
      "round_2.pb (132456 bytes)"
    ]
  }
]
```

**控制台输出：**
```
📁 OPFS File Structure:
============================================================
📦 UUID: 550e8400-e29b-41d4-a716-446655440000
  📄 meta.pb (182 bytes)
  📄 round_1.pb (145678 bytes)
  📄 round_2.pb (132456 bytes)

============================================================
Total: 1 replay(s)
```

#### 2. 下载指定文件

```javascript
// 下载 metadata
await window.debugOPFS.downloadFile('550e8400-e29b-41d4-a716-446655440000', 'meta.pb')

// 下载某个回合
await window.debugOPFS.downloadFile('550e8400-e29b-41d4-a716-446655440000', 'round_1.pb')
```

文件会自动下载到浏览器下载目录，命名格式：`{uuid}_{filename}`

**使用场景：**
- 导出 protobuf 文件进行离线分析
- 使用 `protoc` 命令行工具解码
- 验证二进制数据完整性

#### 3. 查看存储使用情况

```javascript
await window.debugOPFS.getStorageUsage()
```

**控制台输出：**
```
💾 Storage Usage:
============================================================
Used: 145.67 MB
Quota: 10240.00 MB
Usage: 1.42%
============================================================
```

**返回值：**
```javascript
{
  usage: 152756224,   // 字节
  quota: 10737418240  // 字节
}
```

#### 4. 显示物理存储路径

```javascript
window.debugOPFS.showStoragePath()
```

**控制台输出：**
```
📍 OPFS Physical Storage Location (Estimated):
======================================================================
Browser: Chrome
OS: macOS
Origin: http://localhost:8080

Probable Path:
  ~/Library/Application Support/Google/Chrome/Default/File System/

⚠️  WARNING:
   - This path is an ESTIMATION based on browser defaults
   - OPFS data is stored in indexed/encrypted format
   - Direct file access is NOT recommended
   - Use window.debugOPFS.downloadFile() instead!
======================================================================
```

**返回值：**
```javascript
{
  browser: "Chrome",
  os: "macOS",
  basePath: "~/Library/Application Support/Google/Chrome/Default/File System/",
  origin: "http://localhost:8080"
}
```

### 组合使用示例

```javascript
// 1. 列出所有回放
const files = await window.debugOPFS.listFiles()

// 2. 获取第一个回放的 UUID
const uuid = files[0].uuid

// 3. 下载该回放的所有文件
await window.debugOPFS.downloadFile(uuid, 'meta.pb')
await window.debugOPFS.downloadFile(uuid, 'round_1.pb')
await window.debugOPFS.downloadFile(uuid, 'round_2.pb')

// 4. 查看存储使用情况
await window.debugOPFS.getStorageUsage()
```

---

## 生产环境配置

### 关闭调试功能

编辑 `frontend/src/config/debug.ts`：

```typescript
export const DEBUG_CONFIG = {
  enableFrameDataViewer: false,      // 关闭帧数据查看器
  enableOPFSStorageViewer: false,    // 关闭存储查看器
};
```

### 使用环境变量

```typescript
export const DEBUG_CONFIG = {
  // 仅在开发环境启用
  enableFrameDataViewer: import.meta.env.DEV,
  enableOPFSStorageViewer: import.meta.env.DEV,
};
```

### 构建时优化

关闭调试功能后，相关代码会在构建时被 Tree-shaking 优化掉（如果使用条件判断）。

---

## 技术实现

### 数据流架构

```
┌─────────────────┐
│   WASM Parser   │
│   (Go Binary)   │
└────────┬────────┘
         │ Protobuf Binary
         ▼
┌─────────────────┐
│  Proto Decoder  │
│  (protobufjs)   │
└────────┬────────┘
         │ JavaScript Object
         ▼
┌─────────────────┐
│   OPFS Storage  │
│  (Binary .pb)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌─────────┐
│ Frame │ │  OPFS   │
│ Debug │ │  Debug  │
└───────┘ └─────────┘
```

### 关键技术点

1. **Protobuf 二进制存储**
   - 使用 Protocol Buffers 替代 JSON
   - 数据体积减少 40-60%
   - 解析速度提升 2-3 倍

2. **OPFS 文件系统**
   - 浏览器私有文件系统
   - 支持大文件存储
   - 性能优于 IndexedDB

3. **动态 HTML 生成**
   - 使用 Blob URL 打开新标签页
   - 内联 CSS 样式
   - 无需额外资源加载

4. **浏览器检测**
   - 通过 `navigator.userAgent` 识别浏览器
   - 通过 `navigator.platform` 识别操作系统
   - 提供准确的路径估算

---

## 常见问题

### Q1: 为什么 OPFS 按钮不显示？

**A**: 检查以下配置：
1. `debug.ts` 中 `enableOPFSStorageViewer` 是否为 `true`
2. 确保已重新构建前端：`npm run build`
3. 刷新浏览器页面（Ctrl/Cmd + Shift + R 强制刷新）

### Q2: 如何解析下载的 .pb 文件？

**A**: 使用 protoc 命令行工具：
```bash
# 解码 meta.pb
protoc --decode=entity.ReplayMetaPB \
  pkg/engine/entity/replay.proto < 550e8400_meta.pb

# 解码 round_1.pb
protoc --decode=entity.ReplayRoundPB \
  pkg/engine/entity/replay.proto < 550e8400_round_1.pb
```

### Q3: Frame Debug 按钮在哪里？

**A**: 播放回放时，在时间轴进度条的右侧区域，显示为 `⚡ Frame 1234` 的按钮。

### Q4: OPFS 数据能直接在文件系统中看到吗？

**A**: 不能。OPFS 数据以加密索引格式存储，无法直接访问。建议使用 `window.debugOPFS.downloadFile()` 导出文件。

### Q5: 控制台提示找不到 window.debugOPFS？

**A**: 确保：
1. 页面已完全加载
2. 已导入 `opfs-storage.ts` 模块
3. 在正确的域名/端口下运行（不是 file:// 协议）

---

## 相关文件

```
frontend/
├── src/
│   ├── config/
│   │   ├── debug.ts                 # 调试配置文件
│   │   └── DEBUG_README.md          # 本文档
│   ├── components/
│   │   ├── DemoLibrary/
│   │   │   └── DemoLibrary.vue      # OPFS 调试按钮实现
│   │   └── ReplayPlayer/
│   │       └── TimelineControl.vue  # Frame 调试按钮实现
│   └── composables/
│       └── opfs-storage.ts          # OPFS 存储和调试工具
```

---

## 版本历史

- **v1.1.0** (2026-01-31)
  - 新增 OPFS Storage Viewer
  - 新增物理路径显示
  - 优化控制台调试 API

- **v1.0.0** (2026-01-30)
  - 初始版本
  - Frame Data Viewer
  - 基础调试配置

---

## 反馈与建议

如有问题或建议，请通过以下方式反馈：
- 提交 Issue 到项目仓库
- 联系开发团队
- 提交 Pull Request 改进文档

---

**最后更新**: 2026-01-31  
**维护者**: CS2 Demo Viewer 开发团队
