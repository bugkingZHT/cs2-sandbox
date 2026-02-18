import type { RoundResultInfo, EconomyType } from '@/types/replay';
import { isSecondHalf, MATCH_CONFIG } from '@/config/game';

/** 手枪局：上下半场各自的第一局 */
export const PISTOL_ROUND_FIRST_HALF = 1;
export const PISTOL_ROUND_SECOND_HALF = MATCH_CONFIG.SECOND_HALF_START_ROUND;

export function isPistolRound(roundNumber: number): boolean {
  return roundNumber === PISTOL_ROUND_FIRST_HALF || roundNumber === PISTOL_ROUND_SECOND_HALF;
}

export function getRoundResult(
  roundNumber: number,
  roundResults: RoundResultInfo[] | undefined
): string | null {
  if (!roundResults || roundResults.length === 0) return null;
  const result = roundResults.find((rr) => rr.round === roundNumber);
  return result?.result ?? null;
}

/** 获取某回合 T/CT 开局开销；用于回合选择器左右标记（上下半场左右区分） */
export function getRoundCosts(
  roundNumber: number,
  roundResults: RoundResultInfo[] | undefined
): { costT: number; costCT: number } {
  const rr = roundResults?.find((r) => r.round === roundNumber);
  return {
    costT: rr?.costT ?? 0,
    costCT: rr?.costCT ?? 0,
  };
}

/** 经济类型：Eco <$ECO_MAX, Half, Full ≥$HALF_MAX（前端按人均计算） */
const ECO = 'eco';
const HALF = 'half';
const FULL = 'full';
const PISTOL = 'pistol';
const ECO_MAX = 1599;
const HALF_MAX = 3250;
const DEFAULT_TEAM_SIZE = 5;
const WEIGHT_ECO = 1;
const WEIGHT_HALF = 2;
const WEIGHT_FULL = 3;

function getEconomyWeight(t: EconomyType): number {
  if (t === ECO) return WEIGHT_ECO;
  if (t === HALF) return WEIGHT_HALF;
  return WEIGHT_FULL;
}

/** 两边经济不同时，取优先级最低的作为该回合的 eco 过滤类型 */
function getRoundEconomyForFilter(typeT: EconomyType, typeCT: EconomyType): EconomyType {
  return getEconomyWeight(typeT) <= getEconomyWeight(typeCT) ? typeT : typeCT;
}

export function getEconomyType(perCapita: number): EconomyType {
  if (perCapita < ECO_MAX + 1) return ECO;
  if (perCapita <= HALF_MAX) return HALF;
  return FULL;
}

/** 根据总开销与人数计算人均（人数为 0 时用 DEFAULT_TEAM_SIZE 避免除零） */
function getPerCapita(cost: number, count: number): number {
  const n = count > 0 ? count : DEFAULT_TEAM_SIZE;
  return cost / n;
}

/** 回合标签类型：经济类型或手枪局（pistol 视为一种经济类型，优先短路） */
export type RoundTagType = EconomyType | typeof PISTOL;

/** 某回合左右两侧经济类型：先判 pistol，是则直接返回并短路；否则按人均算 eco/half/full（上下半场左=T/CT 不同） */
export function getRoundEconomyTypes(
  roundNumber: number,
  roundResults: RoundResultInfo[] | undefined
): { left: RoundTagType; right: RoundTagType } {
  if (isPistolRound(roundNumber)) return { left: PISTOL, right: PISTOL };
  const rr = roundResults?.find((r) => r.round === roundNumber);
  const perT = getPerCapita(rr?.costT ?? 0, rr?.countT ?? 0);
  const perCT = getPerCapita(rr?.costCT ?? 0, rr?.countCT ?? 0);
  const second = isSecondHalf(roundNumber);
  return {
    left: getEconomyType(second ? perCT : perT),
    right: getEconomyType(second ? perT : perCT),
  };
}

/** 回合是否匹配经济类型筛选：pistol 先短路；否则取两边优先级最低的经济类型与 filter 比较 */
export function roundMatchesEconomyFilter(
  roundNumber: number,
  roundResults: RoundResultInfo[] | undefined,
  filter: EconomyType | 'all' | typeof PISTOL
): boolean {
  if (filter === 'all') return true;
  if (isPistolRound(roundNumber)) return filter === PISTOL;
  if (filter === PISTOL) return false;
  const rr = roundResults?.find((r) => r.round === roundNumber);
  if (!rr) return false;
  const perT = getPerCapita(rr.costT ?? 0, rr.countT ?? 0);
  const perCT = getPerCapita(rr.costCT ?? 0, rr.countCT ?? 0);
  const typeT = getEconomyType(perT);
  const typeCT = getEconomyType(perCT);
  const roundEconomy = getRoundEconomyForFilter(typeT, typeCT);
  return roundEconomy === filter;
}

export function getRoundResultIcon(
  roundNumber: number,
  roundResults: RoundResultInfo[] | undefined
): string | null {
  const result = getRoundResult(roundNumber, roundResults);
  if (!result) return null;
  const iconMap: Record<string, string> = {
    ct_win: '/icons/ct_win.svg',
    t_win: '/icons/t_win.svg',
    bomb_defused: '/icons/bomb_defused.svg',
    bomb_exploded: '/icons/bomb_exploded.svg',
  };
  return iconMap[result] ?? null;
}

/** Whether the icon should be shown first (above number) in round button layout */
export function shouldIconBeFirst(
  roundNumber: number,
  roundResults: RoundResultInfo[] | undefined
): boolean {
  const result = getRoundResult(roundNumber, roundResults);
  if (!result) return false;
  const isFirstHalf = roundNumber <= 12;
  const isTWin = result === 't_win' || result === 'bomb_exploded';
  const isCTWin = result === 'ct_win' || result === 'bomb_defused';
  if (isFirstHalf) return isTWin;
  return isCTWin;
}

export function getRoundEndIcon(result: string): string {
  const iconMap: Record<string, string> = {
    ct_win: '/icons/ct_win.svg',
    t_win: '/icons/t_win.svg',
    bomb_defused: '/icons/bomb_defused.svg',
    bomb_exploded: '/icons/bomb_exploded.svg',
  };
  return iconMap[result] ?? '/icons/ct_win.svg';
}

export function getRoundEndClass(result: string): string {
  if (result === 'ct_win' || result === 'bomb_defused') return 'ct-win';
  if (result === 't_win' || result === 'bomb_exploded') return 't-win';
  return '';
}

export function getRoundEndTitle(result: string): string {
  const titleMap: Record<string, string> = {
    ct_win: 'CT Win',
    t_win: 'T Win',
    bomb_defused: 'Bomb Defused',
    bomb_exploded: 'Bomb Exploded',
  };
  return titleMap[result] ?? 'Round End';
}
