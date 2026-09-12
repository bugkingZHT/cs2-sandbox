import { execFileSync } from 'node:child_process';

/** Resolve the latest tag reachable from this checkout, including lightweight tags. */
export function readAppVersion(repoRoot: string): string {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error('无法获取当前分支的最新 tag；请确认仓库历史和 tags 完整，并且 HEAD 可达至少一个 tag。');
  }
}
