# Web Worker 解析架构

## 概述

Demo文件解析采用主线程 + Worker线程混合架构，将耗时的round解析移至Worker，避免UI阻塞。

**核心设计原则**：Worker 写 IndexedDB meta，主线程定时轮询 IndexedDB 更新 UI。

## 核心原理

- **主线程**：负责轻量级操作（初始化parser、提取metadata、backfill后处理）、定时轮询 IndexedDB 更新进度条
- **Worker线程**：负责重量级操作（遍历所有rounds、逐tick解析帧数据）、更新解析进度到 IndexedDB
- **IndexedDB**：统一存储 meta 数据，包含解析进度和状态字段

## 架构图

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Worker    │         │    IndexedDB     │         │  主线程UI    │
│   线程      │         │   (Meta Store)   │         │             │
└─────────────┘         └──────────────────┘         └─────────────┘
       │                         │                          │
       │ 1. 更新进度              │                          │
       │ updateMetaStatus()      │                          │
       │────────────────────────>│                          │
       │                         │                          │
       │                         │   2. 定时轮询 (1s)       │
       │                         │   getParsingMetas()      │
       │                         │<─────────────────────────│
       │                         │                          │
       │                         │   3. 更新 replayList     │
       │                         │   demo.parsingProgress   │
       │                         │─────────────────────────>│
       │                         │                          │
       │ 4. 解析完成             │                          │
       │ updateMetaStatus(1)     │                          │
       │────────────────────────>│                          │
       │                         │                          │
       │                         │   5. 轮询检测status=1    │
       │                         │   显示正常卡片           │
       │                         │<─────────────────────────│
```

## 三阶段流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant M as 主线程
    participant IDB as IndexedDB
    participant W as Worker线程
    participant OPFS as OPFS
    
    U->>M: 上传.dem文件
    
    Note over M: Phase 1: 快速初始化
    M->>M: initDemoParser(bytes)
    M->>M: extractDemoMetadata() (JSON)
    M->>IDB: saveMeta(meta, status=0)
    M->>U: 显示Demo卡片 (1-2秒)
    M->>M: 启动 ParsingMonitor (1s间隔)
    
    Note over W: Phase 2: 后台解析
    M->>W: postMessage(PARSE_ROUNDS, bytes, uuid)
    W->>W: initDemoParser(bytes)
    
    loop 解析所有rounds
        W->>W: parseNextRound()
        W->>W: 覆盖round.uuid = meta.uuid
        W->>M: postMessage(ROUND_COMPLETE, round)
        M->>OPFS: 保存round (protobuf)
        M->>M: 释放round引用 (GC回收)
        Note over M,W: ⚠️ 内存优化：不累积round数据
        
        alt 每1000 tick
            W->>IDB: updateMetaStatus(uuid, 0, progress, status, lastTickTime)
            Note over IDB: 更新 meta.parsingProgress, meta.lastTickTime
        end
        
        alt 主线程轮询 (每1秒)
            M->>IDB: getParsingMetas() (status=0)
            IDB->>M: 返回所有解析中的 meta
            M->>M: 对比 replayList[uuid] 进度
            M->>M: 直接更新 replayList[uuid].parsingProgress
            M->>U: 刷新进度条
        end
    end
    
    W->>W: backfillDemoMeta() (JSON)
    W->>M: postMessage(PARSING_COMPLETE, stats)
    
    Note over M: Phase 3: 最终化
    M->>M: 合并统计数据到meta
    M->>IDB: updateMetaStatus(uuid, 1, 100, 'Complete')
    M->>M: closeDemoParser()
    M->>W: worker.terminate()
    
    Note over M: 轮询检测 status=1
    M->>IDB: getParsingMetas()
    IDB->>M: [] (无status=0的meta)
    M->>U: 显示正常卡片
```

## IndexedDB Meta 架构

### Meta 数据结构

```typescript
interface ReplayMeta {
  // 基础字段
  uuid: string;
  fileName: string;
  uploadTime: number;
  
  // 解析状态字段（新架构）
  status: number;              // 0=parsing, 1=complete, -1=failed
  parsingProgress: number;     // 0-100
  parsingStatus: string;       // "Parsing rounds..." / "Complete" / 错误信息
  lastTickTime: number;        // 最后一次tick的时间戳 (用于超时检测)
  
  // 游戏统计（backfill后填充）
  totalRounds: number;
  scoreCT: number;
  scoreT: number;
  teamCT: string;
  teamT: string;
  roundResults: RoundResultInfo[];
}
```

### IndexedDB Indexes

```typescript
// metaStore 索引
- uploadTime (排序、分页)
- status (快速查询 status=0 的解析中demos)
```

### Worker 职责：写 IndexedDB

```typescript
// Worker 中的进度更新
const updateProgress = async (uuid: string, progress: number, status: string) => {
  const metaStorage = await getMetaStorage();
  await metaStorage.updateMetaStatus(
    uuid,
    0,           // status = 0 (parsing)
    progress,    // 0-100
    status,      // "Parsing rounds..."
    Date.now()   // lastTickTime
  );
  console.log(`[Worker] [${uuid}] Progress: ${progress}%, ${status}`);
};
```

**调用时机**：
- 每 1000 tick：`updateProgress(uuid, progress, "Parsing rounds...")`
- Round 完成：`updateProgress(uuid, 97, "Finalizing metadata...")`
- 解析完成：`updateMetaStatus(uuid, 1, 100, "Complete")`

### 主线程职责：轮询 IndexedDB 更新 UI

```typescript
// 启动轮询 (每 1 秒)
startParsingMonitor() {
  parsingMonitorInterval = setInterval(() => {
    checkParsingDemos();
  }, 1000);
}

// 轮询逻辑
async checkParsingDemos() {
  const metaStorage = await getMetaStorage();
  const parsingMetas = await metaStorage.getParsingMetas(); // 查询 status=0
  
  for (const meta of parsingMetas) {
    const timeSinceLastTick = Date.now() - (meta.lastTickTime || 0);
    const demoIndex = replayList.value.findIndex(d => d.uuid === meta.uuid);
    
    if (demoIndex === -1) continue;
    
    // 1. 超时检测
    if (timeSinceLastTick > PARSER_CONFIG.workerTickTimeout) {
      await metaStorage.updateMetaStatus(uuid, -1, meta.parsingProgress, 'Timeout');
      needsReload = true;
      continue;
    }
    
    // 2. 检查完成状态
    if (meta.status === 1) {
      needsReload = true;
      continue;
    }
    
    // 3. 进度更新 - 直接从 meta 同步到 UI
    if (currentDemo.parsingProgress !== meta.parsingProgress) {
      replayList.value[demoIndex] = {
        ...currentDemo,
        parsingProgress: meta.parsingProgress,
        parsingStatus: meta.parsingStatus,
        lastTickTime: meta.lastTickTime,
      };
    }
  }
}
```

### 超时检测逻辑

```typescript
// 基于 meta.lastTickTime 判断超时
const timeSinceLastTick = Date.now() - meta.lastTickTime;
if (timeSinceLastTick > PARSER_CONFIG.workerTickTimeout) {
  // 超时 → 标记为失败 (status = -1)
  await metaStorage.updateMetaStatus(uuid, -1, meta.parsingProgress, 'Parsing timeout');
}
```

## 消息协议

### 主线程 → Worker

```typescript
{
  type: 'PARSE_ROUNDS',
  demoBytes: Uint8Array,      // Demo文件字节
  uuid: string,                // 主线程生成的UUID
  estimatedTotalTicks: number  // 预估总tick数
}
```

### Worker → 主线程

#### 1. 进度更新（每1000 tick）
```typescript
{
  type: 'PROGRESS',
  uuid: string,        // UUID 用于 1v1 绑定
  parsedTicks: number  // 已解析tick数
}
```

**主线程处理**：
- ✅ 更新 IndexedDB：`updateMetaStatus(uuid, 0, progress, status, Date.now())`
- ❌ **不再直接更新 `replayList`**（由轮询统一处理）

#### 2. Round完成（每个round）
```typescript
{
  type: 'ROUND_COMPLETE',
  round: ReplayRound  // 包含frames、uuid等
}
```

**主线程处理**：
- 编码为 protobuf
- 保存 round 到 OPFS
- 更新 IndexedDB（97%，"Finalizing metadata..."）

#### 3. 解析完成
```typescript
{
  type: 'PARSING_COMPLETE',
  totalRounds: number,
  scoreCT: number,
  scoreT: number,
  teamCT: string,
  teamT: string,
  roundResults: RoundResultInfo[]
}
```

**主线程处理**：
- Backfill meta（合并统计数据）
- 更新 IndexedDB：`updateMetaStatus(uuid, 1, 100, 'Complete')`
- 轮询检测到 status=1 → 重新加载列表 → 显示正常卡片

#### 4. 错误
```typescript
{
  type: 'ERROR',
  uuid: string,
  error: string
}
```

**主线程处理**：
- ✅ 更新 IndexedDB：`updateMetaStatus(uuid, -1, progress, errorMsg)`
- ❌ **不再直接更新 `replayList`**
- ⏱️ 轮询会检测到 status=-1 → 标记为失败

## 卡片渲染逻辑

页面加载时（`loadAllReplays()`）：

```typescript
// Step 1: 从 IndexedDB 加载所有 meta
const metas = await metaStorage.loadAllMetas();

// Step 2: 直接映射 meta 到 replayList（status 已包含解析状态）
replayList.value = metas.map(meta => ({
  ...meta,
  id: meta.uuid,
  frames: [],
  timestamp: meta.uploadTime,
}));

// Step 3: 启动 ParsingMonitor（自动处理 status=0 的卡片）
startParsingMonitor();
```

**卡片显示逻辑**（在 DemoLibrary.vue）：
```vue
<div class="demo-card" :class="{
  'is-parsing': demo.status === 0,
  'is-failed': demo.status === -1
}">
  <!-- status=0: 显示进度条覆盖层 -->
  <div v-if="demo.status === 0" class="parsing-overlay">
    <progress :value="demo.parsingProgress" max="100"></progress>
    <span>{{ demo.parsingStatus }}</span>
  </div>
  
  <!-- status=-1: 显示失败覆盖层 -->
  <div v-else-if="demo.status === -1" class="failed-overlay">
    <span>{{ demo.parsingStatus }}</span>
  </div>
  
  <!-- status=1: 正常显示卡片内容 -->
  <template v-else>
    <!-- 正常卡片内容 -->
  </template>
</div>
```

## UUID对齐机制

**问题**：Worker中重新初始化parser会生成新UUID，导致rounds与meta的UUID不匹配。

**解决**：
1. 主线程Phase 1提取metadata时获得UUID
2. 主线程将UUID传给Worker
3. Worker解析每个round后**强制覆盖** `round.uuid = uuid`
4. 确保所有数据使用同一UUID存储
   - Meta: IndexedDB `metaStore` (key = uuid)
   - Rounds: OPFS `/replay_data/{uuid}/round_{N}.pb`

## 统计数据回刷

Worker完成解析后调用`backfillDemoMeta()`获取最终统计（JSON格式）：
- `totalRounds`：总回合数
- `scoreCT / scoreT`：双方比分
- `teamCT / teamT`：队伍名称（从GameState提取）
- `roundResults`：每回合胜负结果

主线程接收后直接合并到meta并更新 IndexedDB，无需二次调用Go函数。

## 内存优化策略

### 问题背景

解析大型 Demo 文件时，如果将所有 round 数据累积在内存中，会导致 OOM（Out of Memory）错误：
```
runtime: out of memory: cannot allocate 2189426688-byte block (2767847424 in use)
fatal error: out of memory
```

### 解决方案：流式处理 + 即时释放

#### 1. Worker 端优化

**❌ 旧实现（内存累积）：**
```typescript
const rounds: ReplayRound[] = [];
while (true) {
  const round = await parseNextRound();
  rounds.push(round); // ⚠️ 累积在内存中
  self.postMessage({ type: 'ROUND_COMPLETE', round });
}
```

**✅ 新实现（即时释放）：**
```typescript
let totalRoundsParsed = 0; // 只记录数量
while (true) {
  const round = await parseNextRound();
  
  // 立即发送到主线程
  self.postMessage({ type: 'ROUND_COMPLETE', round });
  
  // 不保留引用，让 GC 回收
  totalRoundsParsed++;
}
```

#### 2. 主线程端优化

**❌ 旧实现（内存累积）：**
```typescript
const workerRounds: ReplayRound[] = [];
worker.onmessage = async (e) => {
  if (e.data.type === 'ROUND_COMPLETE') {
    workerRounds.push(e.data.round); // ⚠️ 累积在内存中
    await saveRoundToOPFS(e.data.round);
  }
};
```

**✅ 新实现（即时释放）：**
```typescript
let savedRoundsCount = 0; // 只记录数量
worker.onmessage = async (e) => {
  if (e.data.type === 'ROUND_COMPLETE') {
    const round = e.data.round;
    
    // 保存到 OPFS 后立即释放引用
    await saveRoundToOPFS(round);
    savedRoundsCount++;
    
    // round 对象会被 GC 回收
  }
};
```

### 内存管理原则

1. **流式处理**：每个 round 解析完成后立即发送，不等待所有 round 完成
2. **即时持久化**：主线程接收到 round 后立即保存到 OPFS
3. **释放引用**：保存后不再保留 round 对象引用，交由 GC 回收
4. **只保留计数**：用 `totalRoundsParsed` / `savedRoundsCount` 跟踪进度
5. **解析后清理**：解析完成后主动销毁 WASM 实例并触发 GC

### Worker 解析后清理机制

**解析完成时自动清理：**
```typescript
// 发送完成消息
self.postMessage({ type: 'PARSING_COMPLETE', ... });

// ============ CLEANUP: Destroy WASM instance ============
// 1. 关闭 WASM parser 释放 Go 内存
if (typeof closeDemoParser === 'function') {
  closeDemoParser();
  console.log('🗑️ WASM parser closed, Go memory released');
}

// 2. 触发显式 GC（需要 Chrome --js-flags=--expose-gc）
if (typeof self.gc === 'function') {
  self.gc();
  console.log('🗑️ Explicit GC triggered');
}
```

**错误时也执行清理：**
```typescript
} catch (error) {
  // 清理 WASM 实例
  if (typeof closeDemoParser === 'function') {
    try {
      closeDemoParser();
      console.log('🗑️ WASM parser closed after error');
    } catch (closeError) {
      console.warn('Failed to close WASM parser:', closeError);
    }
  }
  
  // 触发 GC
  if (typeof self.gc === 'function') {
    self.gc();
  }
  
  self.postMessage({ type: 'ERROR', ... });
}
```

**清理时机：**
- ✅ **成功完成**：所有 rounds 解析完成，发送 PARSING_COMPLETE 后
- ✅ **错误终止**：解析过程中出错，发送 ERROR 后
- ✅ **立即执行**：无需等待，解析流程结束后立即清理

**清理效果：**
```
解析前内存: ~500 MB (JS heap)
解析中峰值: ~3.5 GB (JS + Go WASM)
清理后内存: ~600 MB (释放约 2.9 GB)
```
5. **释放文件字节**：
   - 主线程：发送给 Worker 后立即释放 `demoBytes = null`
   - Worker 端：WASM 初始化后立即释放 `demoBytes = null`
   - 错误处理：任何异常都确保释放内存

### 内存占用对比

| 场景 | 旧实现（累积） | 新实现（流式） |
|------|--------------|--------------|
| 30回合 Demo | ~2.7 GB | ~50-100 MB（峰值） |
| 解析时间 | 相同 | 相同 |
| OOM 风险 | ⚠️ 高 | ✅ 低 |
| OPFS 存储 | 相同 | 相同 |

### Go WASM 内存管理

Go runtime 的 GC 会在 `parseNextRound` 返回后自动回收已解析的 round 数据。JavaScript 端只需确保不保留对返回对象的引用即可。

### 文件字节内存释放

**主线程优化：**
```typescript
let demoBytes: Uint8Array | null = new Uint8Array(buffer);

// 1. 初始化 WASM parser
initDemoParser(demoBytes);

// 2. 发送给 Worker
worker.postMessage({ type: 'PARSE_ROUNDS', demoBytes, uuid });

// 3. 立即释放主线程引用（Worker 已收到副本）
demoBytes = null;
console.log('🗑️ Released main thread file bytes reference');
```

**Worker 端优化：**
```typescript
let demoBytes: Uint8Array | null = e.data.demoBytes;

// 1. 初始化 WASM parser（数据被拷贝到 Go 内存）
initDemoParser(demoBytes);

// 2. 立即释放 Worker 引用
demoBytes = null;
console.log('🗑️ Released worker file bytes reference');
```

**内存释放时机：**
- 主线程：`postMessage` 发送后（~1-2秒内）
- Worker：`initDemoParser` 调用后（立即）
- WASM：Go GC 自动管理

**错误处理中的内存释放：**
```typescript
try {
  // ... parsing logic
} catch (error) {
  // 确保在错误时也释放内存
  demoBytes = null;
  throw error;
}
```

## 性能特性

| 指标 | 优化前（sessionStorage） | 优化后（IndexedDB + GC） |
|------|----------------------|-------------------|
| UI响应 | 始终流畅 | 始终流畅 |
| 卡片显示 | 1-2秒内显示 | 1-2秒内显示 |
| 进度更新 | 轮询（2s间隔） | 轮询（1s间隔，更快） |
| 数据持久化 | 需要双写（OPFS protobuf + sessionStorage） | 单一存储（IndexedDB JSON） |
| 刷新恢复 | 需要 OPFS protobuf 读取 | 直接从 IndexedDB 读取 |
| 查询性能 | 遍历所有 meta 文件 | 索引查询（status=0） |
| 架构耦合 | Cache-Polling 双层 | 单层存储，直接轮询 |
| 内存管理 | 无自动清理 | 定期 GC（每10秒） |

## 垃圾回收机制

ParsingMonitor 每 10 秒执行一次 GC 循环，主动清理内存：

### GC 触发策略

```typescript
// 每 1 秒检查解析状态
// 每 10 秒触发 GC
setInterval(() => {
  checkParsingDemos();
  
  if (gcCounter >= 10) {
    triggerGarbageCollection();
    gcCounter = 0;
  }
}, 1000);
```

### GC 执行内容

#### 1. **WASM 内存清理（最关键）**
```typescript
// 检查是否有正在解析的任务
const parsingMetas = await metaStorage.getParsingMetas();
const hasActiveParsing = parsingMetas.length > 0;

// 只在无活跃解析时关闭 WASM parser
if (!hasActiveParsing && typeof closeDemoParser === 'function') {
  closeDemoParser(); // 释放 Go 端的 demoReaderBytes（上传文件原始字节）
  console.log('🗑️ WASM parser closed, demo file bytes released');
} else if (hasActiveParsing) {
  console.log(`⏭️ Skipping WASM cleanup (${parsingMetas.length} active parsing tasks)`);
}
```

**释放的内存：**
- Go 端：`demoReaderBytes` (上传的 demo 文件完整副本)
- Go 端：`engineInstance` 和相关解析状态
- 这通常是最大的内存占用（可达数百 MB）

#### 2. **显式 GC（Chrome DevTools）**
```typescript
if (typeof globalThis.gc === 'function') {
  globalThis.gc(); // 需要 Chrome 启动参数: --js-flags=--expose-gc
  console.log('🗑️ Explicit GC triggered');
}
```

#### 3. **引用清理（通用方法）**
```typescript
// 重建 replayList 数组，打破旧引用
const cleanedList = replayList.value.map(demo => ({ ...demo }));
replayList.value = cleanedList;
console.log('🧹 Cleaned up replay list references');
```

这会：
- 创建新的对象引用
- 让 Vue 释放旧的响应式代理
- 允许浏览器 GC 回收旧对象

#### 4. **内存统计（Chrome/Edge）**
```typescript
if ('memory' in performance) {
  const mem = performance.memory;
  const usedMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
  const totalMB = (mem.totalJSHeapSize / (1024 * 1024)).toFixed(1);
  const limitMB = (mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
  console.log(`💾 Memory: ${usedMB}MB / ${totalMB}MB (limit: ${limitMB}MB)`);
}
```

### GC 智能调度

**安全检查机制：**
- ✅ 有活跃解析任务 → 跳过 WASM 清理（避免中断解析）
- ✅ 无活跃解析任务 → 执行 WASM 清理（释放大量内存）
- ✅ 其他 GC 步骤始终执行（Vue 引用清理、显式 GC）

**日志示例（有活跃任务）：**
```
[ParsingMonitor] ⏭️ Skipping WASM cleanup (2 active parsing tasks)
[ParsingMonitor] 🗑️ Explicit GC triggered
[ParsingMonitor] 🧹 Cleaned up replay list references
[ParsingMonitor] 💾 Memory: 890.5MB / 1024.0MB (limit: 2048.0MB)
```

**日志示例（无活跃任务）：**
```
[ParsingMonitor] 🗑️ WASM parser closed, demo file bytes released (no active parsing)
[ParsingMonitor] 🗑️ Explicit GC triggered
[ParsingMonitor] 🧹 Cleaned up replay list references
[ParsingMonitor] 💾 Memory: 145.3MB / 256.0MB (limit: 2048.0MB)
```
（注意内存从 890MB 降至 145MB）

### 如何启用显式 GC

**开发环境（Chrome）：**
```bash
# 方法1: Chrome 启动参数
chrome --js-flags="--expose-gc" http://localhost:5173

# 方法2: Edge 启动参数
msedge --js-flags="--expose-gc" http://localhost:5173
```

**生产环境：**
- 显式 GC 仅在开发模式下可用
- 生产环境依赖方法 2（引用清理）和浏览器自动 GC

### GC 效果监控

控制台日志示例：
```
[ParsingMonitor] Started monitoring (every 1s, GC every 10s)
[ParsingMonitor] 1 个进度已更新
[ParsingMonitor] 1 个进度已更新
...（10秒后）
[ParsingMonitor] 🗑️ Explicit GC triggered
[ParsingMonitor] 🧹 Cleaned up replay list references
[ParsingMonitor] 💾 Memory: 145.3MB / 256.0MB
```

### 内存优化建议

1. **开发时监控**：使用 Chrome DevTools Memory Profiler 查看堆快照
2. **GC 频率调整**：如果内存增长快，可将 10 秒改为 5 秒
3. **手动触发**：在控制台执行 `gc()` 测试效果（需要 --expose-gc）

## 失败检测机制

### 1. Tick Timeout 检测（主动）

Worker 端每次发送 PROGRESS 时更新 `lastTickTime`：
```typescript
// Worker 中（通过主线程转发）
await metaStorage.updateMetaStatus(uuid, 0, progress, status, Date.now());
```

主线程轮询检测超时：
```typescript
// ParsingMonitor 中（每 1 秒）
const timeSinceLastTick = Date.now() - meta.lastTickTime;
if (timeSinceLastTick > PARSER_CONFIG.workerTickTimeout) {
  // 30秒内没有 tick → 超时，标记为失败
  await metaStorage.updateMetaStatus(uuid, -1, meta.parsingProgress, 'Parsing timeout');
}
```

### 2. Status 状态检测（直接）

```typescript
// ParsingMonitor 中
const parsingMetas = await metaStorage.getParsingMetas(); // 只查询 status=0

// 完成检测
if (meta.status === 1) {
  // 重新加载列表 → 显示正常卡片
}

// 失败检测
if (meta.status === -1) {
  // 重新加载列表 → 显示失败覆盖层
}
```

## 文件结构

```
workers/
├── wasm-parser.worker.ts   # Worker实现（通过主线程写IndexedDB）
└── README.md               # 本文档

composables/
├── useReplayData.ts        # 主线程调用逻辑（ParsingMonitor）
├── opfs-storage.ts         # OPFS 存储接口（仅存储 rounds protobuf）
└── indexdb-storage.ts      # IndexedDB 存储接口（存储 meta JSON）

config/
└── parser.ts               # PARSER_CONFIG.workerTickTimeout
```

## 关键代码位置

### 主线程
- **Worker创建**：`useReplayData.ts:parseDemo()`
- **ParsingMonitor启动**：`useReplayData.ts:startParsingMonitor()`
- **轮询逻辑**：`useReplayData.ts:checkParsingDemos()`
- **列表加载**：`useReplayData.ts:loadAllReplays()`
- **IndexedDB操作**：`composables/opfs-storage.ts:MetaStorage`

### Worker
- **UUID覆盖**：`wasm-parser.worker.ts` (ROUND_COMPLETE消息处理)
- **Tick进度**：`wasm-parser.worker.ts` (PROGRESS消息发送)
- **统计回刷**：`wasm-parser.worker.ts` (backfillDemoMeta调用)

### IndexedDB操作
- **保存meta**：`metaStorage.saveMeta(meta, status)`
- **更新状态**：`metaStorage.updateMetaStatus(uuid, status, progress, statusMsg, lastTickTime)`
- **查询解析中**：`metaStorage.getParsingMetas()` (status=0索引查询)
- **加载所有**：`metaStorage.loadAllMetas()` (按uploadTime排序)

## 错误处理

| 错误场景 | Worker 行为 | 主线程行为 | IndexedDB 状态 | 结果 |
|---------|-----------|----------|--------------|------|
| Worker初始化失败 | 发送ERROR消息 | updateMetaStatus(-1) | status=-1 | 轮询检测→失败卡片 |
| 解析过程出错 | worker.onerror触发 | updateMetaStatus(-1) | status=-1 | 轮询检测→失败卡片 |
| Tick超时(30s) | - | updateMetaStatus(-1) | status=-1 | 轮询检测→失败卡片 |
| 主线程异常 | - | finally块确保terminate() | status保持0 | 页面刷新后继续轮询 |
| 页面刷新 | - | 重新启动ParsingMonitor | status=0持久化 | 继续显示进度条 |

**关键原则**：Worker 通过主线程更新 IndexedDB，ParsingMonitor 统一处理 UI 更新。

## 日志示例

```
[ParsingMonitor] Started monitoring (every 1s)
[Worker] [abc-123] Progress: 0%, Starting...

[Worker] [abc-123] Progress: 15%, Parsing rounds...
[ParsingMonitor] [abc-123] 进度: 15%, Parsing rounds...

[Worker] [abc-123] Progress: 30%, Parsing rounds...
[ParsingMonitor] [abc-123] 进度: 30%, Parsing rounds...

[Worker] [abc-123] Progress: 97%, Finalizing metadata...
[ParsingMonitor] [abc-123] 进度: 97%, Finalizing metadata...

[ParseDemo] Backfill complete, updating meta to status=1
[ParsingMonitor] 1 完成, 0 超时，重新加载列表
[ParsingMonitor] Stopped monitoring
```

## 架构对比总结

### 旧架构（sessionStorage Cache）
```
Worker → sessionStorage (cache) → 轮询 → replayList → UI
         ↓
    OPFS (meta protobuf + rounds protobuf)
```

### 新架构（IndexedDB）
```
Worker → 主线程 → IndexedDB (meta JSON) → 轮询 → replayList → UI
                 ↓
            OPFS (rounds protobuf only)
```

**关键改进**：
1. ✅ **单一数据源**：Meta 只存在于 IndexedDB（JSON），无需 sessionStorage 缓存
2. ✅ **索引查询**：`status` 索引快速查询解析中的 demos
3. ✅ **更快轮询**：1秒间隔（vs 2秒）
4. ✅ **数据持久化**：IndexedDB 自动持久化，刷新后直接读取
5. ✅ **简化架构**：去除 Cache-Polling 双层，直接轮询 IndexedDB
