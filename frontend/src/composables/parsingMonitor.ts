/**
 * ParsingMonitor - 解析任务监控器
 * 
 * 核心职责：
 * 1. 超时检测：监控解析任务，检测长时间无响应的任务并标记为失败
 * 2. 进度更新：实时同步 IndexedDB 中的解析进度到 UI
 * 3. 内存清理：定期触发 GC，清理已完成任务的内存（包括 WASM 端）
 */

import type { Ref } from 'vue';
import type { ReplayData } from '../types/replay';
import { getMetaStorage } from './indexdb-storage';
import { PARSER_CONFIG } from '@/config/parser';

/**
 * ParsingMonitor 配置接口
 */
export interface ParsingMonitorConfig {
  /** 回放列表的响应式引用 */
  replayList: Ref<ReplayData[]>;
  /** 重新加载所有回放的回调函数 */
  onReload: () => Promise<void>;
  /** 检查间隔（毫秒），默认 1000ms */
  checkInterval?: number;
  /** GC 触发周期（检查次数），默认 10 次 */
  gcCycle?: number;
}

/**
 * ParsingMonitor 类
 * 
 * 使用示例：
 * ```typescript
 * const monitor = new ParsingMonitor({
 *   replayList: replayList,
 *   onReload: loadAllReplays,
 * });
 * 
 * monitor.start();
 * 
 * // 组件卸载时
 * onUnmounted(() => {
 *   monitor.stop();
 * });
 * ```
 */
export class ParsingMonitor {
  private config: Required<ParsingMonitorConfig>;
  private intervalId: number | null = null;
  private gcCounter: number = 0;
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => string | undefined) | null = null;

  constructor(config: ParsingMonitorConfig) {
    this.config = {
      ...config,
      checkInterval: config.checkInterval ?? 1000,
      gcCycle: config.gcCycle ?? 10,
    };
  }

  /**
   * 启动监控
   */
  start(): void {
    // 清理已存在的定时器
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }

    this.gcCounter = 0;

    // 启动定时检查
    this.intervalId = setInterval(() => {
      this.checkParsingDemos();

      // 触发 GC 每 N 个周期
      this.gcCounter++;
      if (this.gcCounter >= this.config.gcCycle) {
        this.triggerGarbageCollection();
        this.gcCounter = 0;
      }
    }, this.config.checkInterval) as unknown as number;

    // 注册 beforeunload 事件监听器
    this.setupBeforeUnloadHandler();

    console.log(
      `[ParsingMonitor] Started monitoring (every ${this.config.checkInterval}ms, GC every ${this.config.gcCycle} cycles)`
    );
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ParsingMonitor] Stopped monitoring');
    }

    // 移除 beforeunload 事件监听器
    this.removeBeforeUnloadHandler();
  }

  /**
   * 设置 beforeunload 事件处理器
   * 当有正在解析的任务时，阻止用户刷新或关闭页面
   */
  private setupBeforeUnloadHandler(): void {
    if (this.beforeUnloadHandler) {
      return; // 已经设置，避免重复
    }

    this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      // 检查是否有正在解析的任务（status === 0）
      const hasParsingDemos = this.config.replayList.value.some(demo => demo.status === 0);
      
      if (hasParsingDemos) {
        const message = '将导致正在运行的解析任务失败';
        e.preventDefault();
        e.returnValue = message; // For legacy browsers
        return message;
      }
    };

    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    console.log('[ParsingMonitor] Browser navigation guard enabled');
  }

  /**
   * 移除 beforeunload 事件处理器
   */
  private removeBeforeUnloadHandler(): void {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
      console.log('[ParsingMonitor] Browser navigation guard disabled');
    }
  }

  /**
   * 检查解析任务：超时检测 + 进度更新
   */
  private async checkParsingDemos(): Promise<void> {
    try {
      const metaStorage = await getMetaStorage();

      // 获取所有 status=0 的 meta
      const parsingMetas = await metaStorage.getParsingMetas();

      if (parsingMetas.length === 0) {
        return;
      }

      const now = Date.now();
      let needsReload = false;
      let completedCount = 0;
      let timedOutCount = 0;
      let progressUpdatedCount = 0;
      let listChanged = false;

      for (const meta of parsingMetas) {
        const timeSinceLastTick = now - (meta.lastTickTime || 0);
        const demoIndex = this.config.replayList.value.findIndex(d => d.uuid === meta.uuid);

        if (demoIndex === -1) continue;

        // 1. 超时检测 - 基于 lastTickTime
        if (meta.lastTickTime && timeSinceLastTick > PARSER_CONFIG.workerTickTimeout) {
          console.log(`[ParsingMonitor] [${meta.uuid.substring(0, 8)}] 超时，标记为失败 (lastTickTime: ${new Date(meta.lastTickTime).toLocaleTimeString()})`);
          const timeoutStatus = `Parsing timeout (no progress for ${PARSER_CONFIG.workerTickTimeout / 1000}s)`;
          
          // Update IndexedDB
          await metaStorage.updateMetaStatus(
            meta.uuid,
            -1, // status = -1
            meta.parsingProgress,
            timeoutStatus
          );
          
          // Immediately sync to UI - create new array to trigger reactivity
          const currentDemo = this.config.replayList.value[demoIndex];
          const newList = [...this.config.replayList.value];
          newList[demoIndex] = {
            ...currentDemo,
            status: -1,
            parsingStatus: timeoutStatus,
            lastTickTime: meta.lastTickTime,
          };
          this.config.replayList.value = newList;
          listChanged = true;
          
          timedOutCount++;
          needsReload = true;
          continue;
        }

        // 2. 检查完成状态
        if (meta.status === 1) {
          completedCount++;
          needsReload = true;
          continue;
        }

        // 3. 进度更新 - 直接从当前 meta 同步到 UI
        const currentDemo = this.config.replayList.value[demoIndex];
        if (
          currentDemo.parsingProgress !== meta.parsingProgress ||
          currentDemo.parsingStatus !== meta.parsingStatus
        ) {
          // Create new array to trigger Vue reactivity
          const newList = [...this.config.replayList.value];
          newList[demoIndex] = {
            ...currentDemo,
            parsingProgress: meta.parsingProgress,
            parsingStatus: meta.parsingStatus,
            lastTickTime: meta.lastTickTime,
          };
          this.config.replayList.value = newList;
          listChanged = true;
          progressUpdatedCount++;
          console.log(
            `[ParsingMonitor] [${meta.uuid.substring(0, 8)}] 进度: ${meta.parsingProgress}%, ${meta.parsingStatus}`
          );
        }
      }

      // 完成或超时时重新加载
      if (needsReload) {
        console.log(`[ParsingMonitor] ${completedCount} 完成, ${timedOutCount} 超时，重新加载列表`);
        await this.config.onReload();
      } else if (progressUpdatedCount > 0) {
        console.log(`[ParsingMonitor] ${progressUpdatedCount} 个进度已更新 (UI ${listChanged ? '已' : '未'}刷新)`);
      }
    } catch (error) {
      console.error('[ParsingMonitor] Error checking parsing demos:', error);
    }
  }

  /**
   * 触发垃圾回收以释放内存
   * 
   * 执行步骤：
   * 1. WASM 内存清理（最关键）- 释放 Go 端的 demoReaderBytes
   * 2. 显式 GC - 调用 globalThis.gc()（Chrome DevTools）
   * 3. Vue 引用清理 - 重建 replayList 打破旧引用
   * 4. 内存统计 - 日志输出当前内存使用情况
   */
  private async triggerGarbageCollection(): Promise<void> {
    try {
      // Step 1: 检查是否有正在解析的任务
      const metaStorage = await getMetaStorage();
      const parsingMetas = await metaStorage.getParsingMetas();
      const hasActiveParsing = parsingMetas.length > 0;

      // Step 2: 关闭 WASM parser 释放 Go 内存（仅在无活跃解析时）
      // 这会释放 WASM 中的 demoReaderBytes（上传的 demo 文件原始字节）
      if (!hasActiveParsing && typeof (window as any).closeDemoParser === 'function') {
        (window as any).closeDemoParser();
        console.log('[ParsingMonitor] 🗑️ WASM parser closed, demo file bytes released (no active parsing)');
      } else if (hasActiveParsing) {
        console.log(`[ParsingMonitor] ⏭️ Skipping WASM cleanup (${parsingMetas.length} active parsing tasks)`);
      }

      // Step 3: 显式 GC（仅在 Chrome 启用 --js-flags=--expose-gc 时可用）
      if (typeof (globalThis as any).gc === 'function') {
        (globalThis as any).gc();
        console.log('[ParsingMonitor] 🗑️ Explicit GC triggered');
      }

      // Step 4: 通过清理引用帮助 GC
      // 即使没有显式 GC API，这也能促使浏览器进行垃圾回收
      if (this.config.replayList.value.length > 0) {
        // 创建新数组打破旧引用
        const cleanedList = this.config.replayList.value.map(demo => ({ ...demo }));
        this.config.replayList.value = cleanedList;
        console.log('[ParsingMonitor] 🧹 Cleaned up replay list references');
      }

      // Step 5: 记录内存统计（仅 Chrome/Edge）
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        const usedMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
        const totalMB = (mem.totalJSHeapSize / (1024 * 1024)).toFixed(1);
        const limitMB = (mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
        console.log(`[ParsingMonitor] 💾 Memory: ${usedMB}MB / ${totalMB}MB (limit: ${limitMB}MB)`);
      }
    } catch (error) {
      console.debug('[ParsingMonitor] GC trigger skipped:', error);
    }
  }
}

/**
 * Composable 工厂函数（可选）
 * 
 * 提供更符合 Vue 风格的使用方式：
 * ```typescript
 * const { start, stop } = useParsingMonitor({
 *   replayList,
 *   onReload: loadAllReplays,
 * });
 * 
 * onMounted(() => start());
 * onUnmounted(() => stop());
 * ```
 */
export function useParsingMonitor(config: ParsingMonitorConfig) {
  const monitor = new ParsingMonitor(config);

  return {
    start: () => monitor.start(),
    stop: () => monitor.stop(),
  };
}
