import type { RoundResultInfo } from '@/types/replay';

export function getRoundResult(
  roundNumber: number,
  roundResults: RoundResultInfo[] | undefined
): string | null {
  if (!roundResults || roundResults.length === 0) return null;
  const result = roundResults.find((rr) => rr.round === roundNumber);
  return result?.result ?? null;
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
