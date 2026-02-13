/**
 * Debug Configuration
 * 
 * Control debug features for development and troubleshooting.
 * Toggle these settings to enable/disable debug capabilities.
 */
export const DEBUG_CONFIG = {
  /**
   * Enable Frame Data Viewer
   * 
   * When enabled, hovering over the timeline progress bar will show
   * a debug button. Clicking this button opens the current frame's
   * complete data in a new browser tab for inspection.
   * 
   * Useful for:
   * - Debugging frame data structure
   * - Inspecting player states
   * - Analyzing projectile data
   * - Troubleshooting rendering issues
   * 
   * Set to `false` in production to disable this feature.
   */
  enableFrameDataViewer: true,

  /**
   * Enable OPFS Storage Viewer
   * 
   * When enabled, adds a debug button in the Demo Library header.
   * Clicking this button opens OPFS storage details in a new browser tab.
   * 
   * Useful for:
   * - Inspecting stored replay files
   * - Debugging storage issues
   * - Checking file sizes and structure
   * - Verifying protobuf data integrity
   * 
   * Set to `false` in production to disable this feature.
   */
  enableOPFSStorageViewer: true,

  /**
   * Enable Storage Quota Display
   * 
   * When enabled, displays browser storage quota usage information
   * in the debug console modal.
   * 
   * Useful for:
   * - Monitoring local storage usage
   * - Identifying storage limitations
   * - Debugging storage-related issues
   * 
   * Set to `false` in production to disable this feature.
   */
  enableStorageQuotaDisplay: true,

  /**
   * Enable Round Limit Configuration
   * 
   * When enabled, adds a configuration option in the debug panel
   * to limit the number of rounds parsed from a demo file.
   * 
   * Set to `false` in production to hide this feature.
   */
  enableRoundLimitConfig: true,

  /**
   * Enable Parse Frame Ratio Configuration
   * 
   * When enabled, adds a dropdown in the debug panel to set parse frame ratio
   * (positive integer ≥1, e.g. 1=1:1, 2=1:2) — parse 1 frame every N game frames.
   * 
   * Set to `false` in production to hide this feature.
   */
  enableParseFrameRatioConfig: true,

  /**
   * Enable Beta Button
   * 
   * When enabled, shows the beta warning button in the sidebar above
   * the system management button.
   * 
   * Set to `false` in production to hide the beta button.
   */
  enableBetaButton: true,
};

/** localStorage key for parse round limit (debug panel). */
export const PARSING_ROUND_LIMIT_KEY = 'demoParsingRoundLimit';
/** Default parse round limit when not set (positive integer). */
export const PARSING_ROUND_LIMIT_DEFAULT = 999;

/** localStorage key for parse frame ratio (debug panel). */
export const PARSE_FRAME_RATIO_KEY = 'demoParsingFrameRatio';
/** Default parse frame ratio when not set (1=1:1, 2=1:2, positive integer). */
export const PARSE_FRAME_RATIO_DEFAULT = 2;

/** localStorage key for OPFS leak cleanup max surge (debug panel). */
export const MAX_SURGE_DEMO_NUM_KEY = 'maxSurgeDemoNum';
/** Default max orphan dirs to keep when cleaning OPFS leak (non-negative integer). */
export const MAX_SURGE_DEMO_NUM_DEFAULT = 16;
