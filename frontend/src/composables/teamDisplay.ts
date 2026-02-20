import type { PlayerInfo } from '@/types/replay';

/**
 * Resolve team display name.
 * When teamName is empty, use "Team " + first player's name from that team.
 * @param teamName - Raw team name (teamCT or teamT)
 * @param teamId - 2 = T, 3 = CT
 * @param serverPlayer - Player list from meta
 */
export function resolveTeamDisplayName(
  teamName: string,
  teamId: 2 | 3,
  serverPlayer?: PlayerInfo[]
): string {
  if (teamName != null && String(teamName).trim() !== '') {
    return String(teamName).trim();
  }
  const first = serverPlayer?.find((p) => p.team === teamId);
  const playerName = first?.name?.trim();
  if (playerName) return 'Team ' + playerName;
  return '-';
}
