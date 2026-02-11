/**
 * Replay Data Adapter
 *
 * 数据适配层：负责将不同引擎版本产出的 replay 数据归一化为当前前端期望的格式。
 * 当引擎协议发生破坏性变更时，在此注册对应版本的转换逻辑，
 * 渲染层始终只面对最新格式，无需关心版本差异。
 *
 * 使用方式：
 *   adaptMeta(meta)          — 加载 meta 后调用
 *   adaptRound(round, ver)   — 加载 round 后调用
 *   checkCompatibility(ver)  — 加载前检查兼容性，可用于 UI 提示
 */

import type { ReplayMeta, ReplayRound } from '@/types/replay';
import { FRONTEND_VERSION, isEngineVersionCompatible } from '@/config/version';

// ─── Adapter 类型 ───────────────────────────────────────────────

type MetaAdapter = (meta: ReplayMeta) => ReplayMeta;
type RoundAdapter = (round: ReplayRound) => ReplayRound;

interface VersionAdapter {
  adaptMeta: MetaAdapter;
  adaptRound: RoundAdapter;
}

// ─── Adapter 注册表 ─────────────────────────────────────────────
// 当引擎发布 breaking change（如 v2.0.0）时，在此添加旧版本 → 当前格式的转换。
//
// 示例（未来填充）：
// 'v1.0.0': {
//   adaptMeta:  (meta)  => { /* v1 meta → 当前格式 */ return meta; },
//   adaptRound: (round) => { /* v1 round → 当前格式 */ return round; },
// },

const VERSION_ADAPTERS: Record<string, VersionAdapter> = {
  // 目前只有 v1.0.0，无需转换
};

// ─── Identity（透传，无需转换） ──────────────────────────────────

const IDENTITY_ADAPTER: VersionAdapter = {
  adaptMeta: (meta) => meta,
  adaptRound: (round) => round,
};

function getAdapter(engineVersion?: string): VersionAdapter {
  if (!engineVersion) return IDENTITY_ADAPTER;
  return VERSION_ADAPTERS[engineVersion] || IDENTITY_ADAPTER;
}

// ─── 公开 API ───────────────────────────────────────────────────

/** 适配 ReplayMeta：根据 meta.engineVersion 自动选择转换逻辑 */
export function adaptMeta(meta: ReplayMeta): ReplayMeta {
  return getAdapter(meta.engineVersion).adaptMeta(meta);
}

/** 适配 ReplayRound：需要外部传入 engineVersion（round 本身不携带版本号） */
export function adaptRound(round: ReplayRound, engineVersion?: string): ReplayRound {
  return getAdapter(engineVersion).adaptRound(round);
}

/** 兼容性检查，返回是否兼容及可选的警告文案（用于 UI 提示） */
export function checkCompatibility(engineVersion?: string): {
  compatible: boolean;
  warning?: string;
} {
  if (!engineVersion || isEngineVersionCompatible(engineVersion)) {
    return { compatible: true };
  }
  return {
    compatible: false,
    warning: `此 Demo 由引擎 ${engineVersion} 解析，当前前端 ${FRONTEND_VERSION} 可能无法完全兼容`,
  };
}
