/**
 * Frontend Version Configuration
 *
 * 前端整体版本号，与引擎版本（pkg/engine/config.go EngineVersion）对齐。
 * 每次引擎协议调整时需同步升级此版本号，确保旧 demo 仍可使用对应版本的前端正常查看。
 */

/** 当前前端版本号，与引擎 EngineVersion 保持一致 */
export const FRONTEND_VERSION = 'v1.0.0';

/**
 * 当前前端兼容的引擎版本列表。
 * 此列表声明本前端能正确解析/回放哪些引擎版本产出的 demo 数据。
 * 当引擎发布 breaking change 时，新前端应保留旧版本以兼容已解析的历史 demo。
 */
export const COMPATIBLE_ENGINE_VERSIONS: readonly string[] = [
  'v1.0.0',
];

/**
 * 检查引擎版本是否与当前前端兼容。
 * 旧 demo 可能无版本号（engineVersion 为空），默认视为兼容。
 */
export function isEngineVersionCompatible(engineVersion?: string): boolean {
  if (!engineVersion) return true;
  return COMPATIBLE_ENGINE_VERSIONS.includes(engineVersion);
}
