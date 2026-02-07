/**
 * Parser Configuration
 * 
 * Configuration for demo file parsing behavior and performance tuning.
 */

export const PARSER_CONFIG = {
  /**
   * Worker Tick Timeout (milliseconds)
   * 
   * Maximum time to wait without receiving a PROGRESS message from the
   * Web Worker during demo parsing. If no tick event is received within
   * this duration, the parsing is considered failed.
   * 
   * Default: 30000 (30 seconds)
   * 
   * Adjust this value based on:
   * - Expected parsing performance
   * - System capabilities
   * - Demo file complexity
   * 
   * Lower values detect failures faster but may cause false positives
   * on slower systems. Higher values are more tolerant but delay
   * failure detection.
   */
  workerTickTimeout: 10000,

  /**
   * Estimated Ticks per MB Ratio
   * 
   * Used to estimate total parsing ticks based on demo file size.
   * Formula: estimatedTotalTicks = fileSizeMB × estimatedRatio
   * 
   * Default: 400 ticks per MB
   * 
   * This ratio helps calculate parsing progress percentage during
   * demo file processing. Adjust based on:
   * - Average tick density in your demo files
   * - Server tick rate (64-tick vs 128-tick)
   * - Match duration patterns
   * 
   * Higher values = more conservative estimates (slower progress bar)
   * Lower values = aggressive estimates (faster progress bar)
   * 
   * Note: Previously hardcoded as 360 in useReplayData.ts
   */
  estimatedRatio: 400,
};
