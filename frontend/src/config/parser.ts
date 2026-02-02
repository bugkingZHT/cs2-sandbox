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
  workerTickTimeout: 30000,
};
