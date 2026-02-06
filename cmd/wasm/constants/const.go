package constants

// jsReader implements io.Reader by reading from a JS Uint8Array in chunks,
// avoiding a full copy of the demo file into Go/WASM linear memory.
const JsReaderChunkSize = 64 * 1024 // 64KB

// Smaller message queue for WASM to reduce memory (default would be 50k–500k)
const WasmMsgQueueSize = 5000
