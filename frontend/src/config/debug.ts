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
};
