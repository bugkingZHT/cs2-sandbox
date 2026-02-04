/// <reference lib="webworker" />

import type { ReplayRound } from '@/types/replay';
import { decodeReplayRound } from '@/composables/proto-converters';
import { getMetaStorage } from '@/composables/indexdb-storage';

// Declare global types for Go WASM runtime
declare const Go: any;
declare const self: DedicatedWorkerGlobalScope;

// Message types
interface ParseRoundsMessage {
  type: 'PARSE_ROUNDS';
  demoBytes: Uint8Array;
  uuid: string;
  estimatedTotalTicks: number;
  roundLimit?: number;
  frameRatio?: number; // positive integer >= 1 (1=1:1, 2=1:2, N=1:N)
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
  roundResults: Array<{ round: number; result: string }>; // Add round results
  serverPlayer: Array<{ id: number; name: string; team: number; steamID: number; isBot: boolean }>; // Add server player info
}

interface ProgressMessage {
  type: 'PROGRESS';
  uuid: string;
  parsedTicks: number;
}

interface ErrorMessage {
  type: 'ERROR';
  uuid: string;
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
    let demoBytes: Uint8Array | null = e.data.demoBytes; // Track to release later
    const { uuid, estimatedTotalTicks } = e.data;
    
    try {
      // Ensure WASM is initialized
      await initializeWASM();
      
      console.log(`[Worker] [${uuid}] Starting round parsing`);
      
      // Initialize parser with demo bytes, round limit, and frame ratio
      const initError = (self as any).initDemoParser(
        demoBytes,
        e.data.roundLimit ?? -1,
        e.data.frameRatio ?? 1
      );
      if (initError) {
        throw new Error(`initDemoParser failed: ${initError}`);
      }
      
      // ⚠️ CRITICAL: Release worker's reference to file bytes immediately after parser init
      // WASM has copied the data, so we can free JavaScript memory
      demoBytes = null;
      console.log(`[Worker] [${uuid}] 🗑️ Released worker file bytes reference`);
      
      console.log(`[Worker] [${uuid}] Parser initialized`);
      
      // Parse rounds in loop
      let roundNum = 1;
      let totalRoundsParsed = 0; // Track count without keeping round data
      let lastProgressUpdate = 0;
      const PROGRESS_UPDATE_INTERVAL = 1000; // Send progress every 1000 ticks
      
      while (true) {
        const roundBinary = await parseNextRoundPromise((parsedTicks: number) => {
          // Send progress updates at intervals to avoid flooding
          if (parsedTicks - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
            const progressMsg: ProgressMessage = {
              type: 'PROGRESS',
              uuid: uuid,
              parsedTicks
            };
            self.postMessage(progressMsg);
            lastProgressUpdate = parsedTicks;
          }
        });
        
        // If roundBinary is null, we've reached EOF
        if (!roundBinary) {
          console.log(`[Worker] [${uuid}] EOF reached after ${totalRoundsParsed} rounds`);
          break;
        }
        
        console.log(`[Worker] [${uuid}] Round ${roundNum} binary received, size: ${roundBinary.byteLength} bytes`);
        
        // Decode protobuf binary to ReplayRound
        const round: ReplayRound = await decodeReplayRound(roundBinary as Uint8Array);
        console.log(`[Worker] [${uuid}] Round ${roundNum} decoded:`, {
          uuid: round.uuid,
          round: round.round,
          frameCount: round.frames.length
        });
        
        // Override the UUID to match the main thread's metadata UUID
        round.uuid = uuid;
        
        // ⚠️ DO NOT ACCUMULATE: Send immediately and let GC clean up
        console.log(`[Worker] [${uuid}] Round ${roundNum} parsed, frames: ${round.frames.length}`);
        
        // Send milestone: round complete
        const response: RoundCompleteMessage = {
          type: 'ROUND_COMPLETE',
          round
        };
        self.postMessage(response);
        
        // Release round reference immediately after sending
        // JavaScript GC will clean up the round object
        totalRoundsParsed++;
        roundNum++;
      }
      
      console.log(`[Worker] [${uuid}] All rounds parsed (${totalRoundsParsed} total)`);
      
      // Extract final statistics from the last parsed state
      // Call backfillDemoMeta to get final scores
      // Load complete meta from IndexedDB and pass to WASM for backfill
      const metaStorage = await getMetaStorage();
      const currentMeta = await metaStorage.loadMeta(uuid);
      if (!currentMeta) {
        throw new Error(`Meta not found in IndexedDB: ${uuid}`);
      }
      
      // Pass complete meta to ensure all fields are preserved during backfill
      const metaJsonString = JSON.stringify(currentMeta);
      
      const backfillJsonString = await new Promise<string>((resolve, reject) => {
        (self as any).backfillDemoMeta(metaJsonString, (res: any, err: string) => {
          if (err) reject(new Error(err));
          else resolve(res);
        });
      });
      
      const backfilledMeta = JSON.parse(backfillJsonString);
      
      console.log(`[Worker] [${uuid}] Backfilled meta received:`, {
        totalRounds: backfilledMeta.totalRounds,
        hasRoundResults: !!backfilledMeta.roundResults,
        roundResultsCount: backfilledMeta.roundResults?.length || 0,
        hasServerPlayer: !!backfilledMeta.serverPlayer,
        serverPlayerCount: backfilledMeta.serverPlayer?.length || 0,
        hasFileName: !!backfilledMeta.fileName,
        hasOriginPath: !!backfilledMeta.originPath
      });
      
      // Send completion message with statistics AND round results AND server players
      const completeResponse: ParsingCompleteMessage = {
        type: 'PARSING_COMPLETE',
        totalRounds: backfilledMeta.totalRounds || totalRoundsParsed,
        scoreCT: backfilledMeta.scoreCT || 0,
        scoreT: backfilledMeta.scoreT || 0,
        teamCT: backfilledMeta.teamCT || '',
        teamT: backfilledMeta.teamT || '',
        roundResults: backfilledMeta.roundResults || [], // Include round results
        serverPlayer: backfilledMeta.serverPlayer || [] // Include server player info
      };
      console.log(`[Worker] [${uuid}] Sending PARSING_COMPLETE with ${completeResponse.roundResults.length} round results and ${completeResponse.serverPlayer.length} players`);
      self.postMessage(completeResponse);
      
      // ============ CLEANUP: Destroy WASM instance after parsing ============
      console.log(`[Worker] [${uuid}] 🧹 Starting post-parsing cleanup...`);
      
      // Close WASM parser to release Go memory
      if (typeof (self as any).closeDemoParser === 'function') {
        (self as any).closeDemoParser();
        console.log(`[Worker] [${uuid}] 🗑️ WASM parser closed, Go memory released`);
      }
      
      // Force garbage collection if available (Chrome with --js-flags=--expose-gc)
      if (typeof (self as any).gc === 'function') {
        (self as any).gc();
        console.log(`[Worker] [${uuid}] 🗑️ Explicit GC triggered`);
      }
      
      console.log(`[Worker] [${uuid}] ✅ Cleanup complete`);
      // ============ END CLEANUP ============
      
    } catch (error: any) {
      console.error(`[Worker] [${uuid}] Parsing error:`, error);
      
      // Release bytes on error (if not already released)
      demoBytes = null;
      
      // ============ CLEANUP: Destroy WASM instance on error ============
      // Close WASM parser to release Go memory even on error
      if (typeof (self as any).closeDemoParser === 'function') {
        try {
          (self as any).closeDemoParser();
          console.log(`[Worker] [${uuid}] 🗑️ WASM parser closed after error`);
        } catch (closeError) {
          console.warn(`[Worker] [${uuid}] Failed to close WASM parser:`, closeError);
        }
      }
      
      // Force GC on error
      if (typeof (self as any).gc === 'function') {
        (self as any).gc();
        console.log(`[Worker] [${uuid}] 🗑️ GC triggered after error`);
      }
      // ============ END CLEANUP ============
      
      const errorResponse: ErrorMessage = {
        type: 'ERROR',
        uuid: uuid,
        error: error.message || String(error)
      };
      self.postMessage(errorResponse);
    }
  }
};

// Export empty object to satisfy TypeScript module requirements
export {};
