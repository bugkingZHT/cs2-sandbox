/// <reference lib="webworker" />

import type { ReplayRound } from '@/types/replay';
import { decodeReplayMeta, decodeReplayRound } from '@/composables/proto-converters';

// Declare global types for Go WASM runtime
declare const Go: any;
declare const self: DedicatedWorkerGlobalScope;

// Message types
interface ParseRoundsMessage {
  type: 'PARSE_ROUNDS';
  demoBytes: Uint8Array;
  uuid: string;
  estimatedTotalTicks: number;
}

interface RoundCompleteMessage {
  type: 'ROUND_COMPLETE';
  round: ReplayRound;
}

interface ParsingCompleteMessage {
  type: 'PARSING_COMPLETE';
  totalRounds: number;
  scoreCT: number;
  scoreT: number;
  teamCT: string;
  teamT: string;
}

interface ProgressMessage {
  type: 'PROGRESS';
  parsedTicks: number;
}

interface ErrorMessage {
  type: 'ERROR';
  error: string;
}

type WorkerMessage = ParseRoundsMessage;
type WorkerResponse = RoundCompleteMessage | ParsingCompleteMessage | ProgressMessage | ErrorMessage;

let wasmInitialized = false;

// Load WASM runtime
async function initializeWASM() {
  if (wasmInitialized) return;

  try {
    // Import wasm_exec.js
    importScripts('/wasm_exec.js');
    
    console.log('[Worker] Loading WASM module...');
    
    // Initialize Go runtime
    const go = new Go();
    
    // Fetch and instantiate WASM module
    const response = await fetch('/main.wasm');
    const buffer = await response.arrayBuffer();
    const wasmModule = await WebAssembly.instantiate(buffer, go.importObject);
    
    // Run Go program (this registers the WASM functions)
    go.run(wasmModule.instance);
    
    wasmInitialized = true;
    console.log('[Worker] WASM initialized successfully');
  } catch (error) {
    console.error('[Worker] Failed to initialize WASM:', error);
    throw error;
  }
}

// Helper to promisify parseNextRound with tick progress updates
function parseNextRoundPromise(onTickProgress: (ticks: number) => void): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    (self as any).parseNextRound(
      (res: any, err: string) => {
        if (err) reject(new Error(err));
        else resolve(res);
      },
      // Status callback - receives total parsed ticks as string
      (parsedTicksStr: string) => {
        const parsedTicks = parseInt(parsedTicksStr, 10);
        if (!isNaN(parsedTicks)) {
          onTickProgress(parsedTicks);
        }
      }
    );
  });
}

// Main message handler
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'PARSE_ROUNDS') {
    try {
      // Ensure WASM is initialized
      await initializeWASM();
      
      const { demoBytes, uuid, estimatedTotalTicks } = e.data;
      
      console.log(`[Worker] Starting round parsing for UUID: ${uuid}`);
      
      // Initialize parser with demo bytes
      const initError = (self as any).initDemoParser(demoBytes);
      if (initError) {
        throw new Error(`initDemoParser failed: ${initError}`);
      }
      
      console.log('[Worker] Parser initialized in worker');
      
      // Parse rounds in loop
      let roundNum = 1;
      const rounds: ReplayRound[] = [];
      let lastProgressUpdate = 0;
      const PROGRESS_UPDATE_INTERVAL = 1000; // Send progress every 1000 ticks
      
      while (true) {
        const roundBinary = await parseNextRoundPromise((parsedTicks: number) => {
          // Send progress updates at intervals to avoid flooding
          if (parsedTicks - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
            const progressMsg: ProgressMessage = {
              type: 'PROGRESS',
              parsedTicks
            };
            self.postMessage(progressMsg);
            lastProgressUpdate = parsedTicks;
          }
        });
        
        // If roundBinary is null, we've reached EOF
        if (!roundBinary) {
          console.log(`[Worker] EOF reached after ${roundNum - 1} rounds`);
          break;
        }
        
        console.log(`[Worker] 📦 Round ${roundNum} binary received, size: ${roundBinary.byteLength} bytes`);
        
        // Decode protobuf binary to ReplayRound
        const round: ReplayRound = await decodeReplayRound(roundBinary as Uint8Array);
        console.log(`[Worker] ✅ Round ${roundNum} decoded:`, {
          uuid: round.uuid,
          round: round.round,
          frameCount: round.frames.length
        });
        
        // Override the UUID to match the main thread's metadata UUID
        round.uuid = uuid;
        
        rounds.push(round);
        
        console.log(`[Worker] Parsed round ${roundNum}, frames: ${round.frames.length}, UUID: ${uuid}`);
        
        // Send milestone: round complete
        const response: RoundCompleteMessage = {
          type: 'ROUND_COMPLETE',
          round
        };
        self.postMessage(response);
        
        roundNum++;
      }
      
      console.log(`[Worker] All rounds parsed (${rounds.length} total)`);
      
      // Extract final statistics from the last parsed state
      // Call backfillDemoMeta to get final scores
      // Create minimal meta binary for backfill
      const { encodeReplayMeta } = await import('@/composables/proto-converters');
      const minimalMeta = { uuid } as any;
      const metaBytes = await encodeReplayMeta(minimalMeta);
      
      const backfillBinary = await new Promise<Uint8Array>((resolve, reject) => {
        (self as any).backfillDemoMeta(metaBytes, (res: any, err: string) => {
          if (err) reject(new Error(err));
          else resolve(res);
        });
      });
      
      const backfilledMeta = await decodeReplayMeta(backfillBinary);
      
      // Send completion message with statistics
      const completeResponse: ParsingCompleteMessage = {
        type: 'PARSING_COMPLETE',
        totalRounds: backfilledMeta.totalRounds || rounds.length,
        scoreCT: backfilledMeta.scoreCT || 0,
        scoreT: backfilledMeta.scoreT || 0,
        teamCT: backfilledMeta.teamCT || '',
        teamT: backfilledMeta.teamT || ''
      };
      self.postMessage(completeResponse);
      
    } catch (error: any) {
      console.error('[Worker] Parsing error:', error);
      
      const errorResponse: ErrorMessage = {
        type: 'ERROR',
        error: error.message || String(error)
      };
      self.postMessage(errorResponse);
    }
  }
};

// Export empty object to satisfy TypeScript module requirements
export {};
