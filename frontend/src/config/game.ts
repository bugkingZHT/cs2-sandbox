/**
 * Game Configuration Constants
 * 
 * Centralized configuration for game-related constants used across the application.
 * This helps avoid magic numbers and makes future adjustments easier.
 */

// CS2 Match Configuration
export const MATCH_CONFIG = {
  // Number of rounds in the first half (standard CS2 match format)
  ROUNDS_PER_HALF: 12,
  
  // Total rounds in a full match (excluding overtime)
  TOTAL_ROUNDS: 24,
  
  // Round number that marks the start of the second half
  // Teams switch sides after round 12, so round 13 is the first round of the second half
  SECOND_HALF_START_ROUND: 13,
  
  // Overtime configuration
  OVERTIME: {
    ROUNDS_PER_OVERTIME_HALF: 3,
    MAX_OVERTIME_ROUNDS: 6,
  },
  
  // Team IDs (from demoinfocs)
  TEAM: {
    SPECTATOR: 1,
    TERRORIST: 2,
    COUNTER_TERRORIST: 3,
  },
  
  // Bomb configuration
  BOMB: {
    PLANT_TIME_MS: 3000,      // 3 seconds to plant
    DEFUSE_TIME_MS: 5000,     // 5 seconds to defuse (without kit)
    DEFUSE_TIME_KIT_MS: 10000, // 10 seconds to defuse (with kit)
    EXPLOSION_TIME_MS: 40000, // 40 seconds until explosion
  },
  
  // Round time configuration
  ROUND: {
    FREEZETIME_MS: 15000,      // 15 seconds freeze time
    REGULAR_TIME_MS: 115000,   // 115 seconds (1:55) regular time
    TOTAL_REGULAR_MS: 130000,  // 130 seconds (2:10) total including freezetime
  },
  
  // Economy configuration
  ECONOMY: {
    STARTING_MONEY: 800,
    WIN_BONUS_CT: 3250,
    WIN_BONUS_T: 3500,
    LOSS_BONUS_BASE: 1400,
    LOSS_BONUS_MAX: 5000,
  },
};

// Helper function to check if we're in the second half
export const isSecondHalf = (currentRound: number): boolean => {
  return currentRound >= MATCH_CONFIG.SECOND_HALF_START_ROUND;
};

// Helper function to get display team (flipped in second half)
// Original team: the team the player originally belonged to (2=T, 3=CT)
// Returns: the team to display based on current map side
export const getDisplayTeam = (originalTeam: number, currentRound: number): number => {
  if (isSecondHalf(currentRound)) {
    // Teams have switched sides
    if (originalTeam === MATCH_CONFIG.TEAM.TERRORIST) {
      return MATCH_CONFIG.TEAM.COUNTER_TERRORIST;
    }
    if (originalTeam === MATCH_CONFIG.TEAM.COUNTER_TERRORIST) {
      return MATCH_CONFIG.TEAM.TERRORIST;
    }
  }
  return originalTeam;
};

// Color constants for team visualization
export const TEAM_COLORS = {
  COUNTER_TERRORIST: {
    PRIMARY: 0x3b82f6,    // Blue
    SECONDARY: 0x4dabf7,  // Light blue
    TINT: 0x4dabf7,
    CSS_CLASS: 'ct',
    LABEL: 'CT',
  },
  TERRORIST: {
    PRIMARY: 0xf97316,    // Orange
    SECONDARY: 0xff922b,  // Light orange
    TINT: 0xff922b,
    CSS_CLASS: 't',
    LABEL: 'T',
  },
  NEUTRAL: {
    PRIMARY: 0x888888,    // Gray
    SECONDARY: 0x666666,
    TINT: 0xff6b6b,
    CSS_CLASS: '',
    LABEL: '',
  },
};

// Get color for a team (with second half flipping)
export const getTeamColor = (originalTeam: number, currentRound: number, colorType: 'PRIMARY' | 'SECONDARY' | 'TINT' = 'PRIMARY'): number => {
  const displayTeam = getDisplayTeam(originalTeam, currentRound);
  
  if (displayTeam === MATCH_CONFIG.TEAM.COUNTER_TERRORIST) {
    return TEAM_COLORS.COUNTER_TERRORIST[colorType];
  }
  if (displayTeam === MATCH_CONFIG.TEAM.TERRORIST) {
    return TEAM_COLORS.TERRORIST[colorType];
  }
  return TEAM_COLORS.NEUTRAL[colorType];
};
