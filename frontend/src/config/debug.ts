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
};
