//go:build js && wasm
// +build js,wasm

package main

import (
	"bytes"
	"encoding/json"
	"log"
	"syscall/js"

	"github.com/bugkingzht/cs-demobox/pkg/engine"
	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
)

// Global state for streaming parsing
var (
	engineInstance  *engine.DemoEngine
	demoReaderBytes []byte
)

func main() {
	done := make(chan struct{})

	// Register five functions for three-phase parsing
	js.Global().Set("initDemoParser", js.FuncOf(initDemoParser))
	js.Global().Set("extractDemoMetadata", js.FuncOf(extractDemoMetadata))
	js.Global().Set("parseNextRound", js.FuncOf(parseNextRound))
	js.Global().Set("backfillDemoMeta", js.FuncOf(backfillDemoMeta))
	js.Global().Set("closeDemoParser", js.FuncOf(closeDemoParser))

	log.Println("WASM replay parser initialized with three-phase API")
	<-done
}

// initDemoParser initializes the parser with demo file bytes
func initDemoParser(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		log.Println("initDemoParser expects (Uint8Array)")
		return "Missing demo file bytes"
	}

	dataVal := args[0]

	log.Println("[1/5] Starting to copy demo file bytes...")
	demoReaderBytes = make([]byte, dataVal.Get("byteLength").Int())
	js.CopyBytesToGo(demoReaderBytes, dataVal)
	log.Printf("[2/5] Copied %d bytes\n", len(demoReaderBytes))

	// Create engine instance
	engineInstance = engine.NewDemoEngine(engine.EngineConfig{ResolveFreezeTime: false})

	// Initialize parser with reader
	err := engineInstance.InitParser(bytes.NewReader(demoReaderBytes))
	if err != nil {
		log.Printf("InitParser error: %v\n", err)
		return err.Error()
	}

	log.Println("[InitParser] Parser initialized successfully")
	return js.Null() // Success
}

// extractDemoMetadata extracts metadata from header only (no frame traversal)
func extractDemoMetadata(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		log.Println("extractDemoMetadata expects (callback)")
		return nil
	}

	callback := args[0]

	go func() {
		if engineInstance == nil {
			callback.Invoke(js.Null(), "Parser not initialized")
			return
		}

		meta, err := engineInstance.ExtractMetadata()
		if err != nil {
			log.Printf("ExtractMetadata error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		b, err := json.Marshal(meta)
		if err != nil {
			log.Printf("JSON marshal error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		log.Printf("[ExtractMetadata] Metadata extracted, JSON size: %d bytes\n", len(b))
		callback.Invoke(string(b), js.Null())
	}()

	return nil
}

// parseNextRound parses the next round incrementally
func parseNextRound(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		log.Println("parseNextRound expects (callback, optional statusCallback)")
		return nil
	}

	callback := args[0]
	var statusCallback js.Value
	if len(args) >= 2 {
		statusCallback = args[1]
	}

	go func() {
		if engineInstance == nil {
			callback.Invoke(js.Null(), "Parser not initialized")
			return
		}

		var onStatus func(string)
		if !statusCallback.IsUndefined() && !statusCallback.IsNull() {
			onStatus = func(s string) {
				statusCallback.Invoke(s)
			}
		}

		round, err := engineInstance.ParseNextRound(onStatus)
		if err != nil {
			log.Printf("ParseNextRound error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		// If round is nil, we've reached EOF
		if round == nil {
			log.Println("[ParseNextRound] EOF reached, no more rounds")
			callback.Invoke(js.Null(), js.Null())
			return
		}

		b, err := json.Marshal(round)
		if err != nil {
			log.Printf("JSON marshal error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		log.Printf("[ParseNextRound] Round %d parsed, JSON size: %d bytes\n", round.Round, len(b))
		callback.Invoke(string(b), js.Null())
	}()

	return nil
}

// backfillDemoMeta updates metadata with final statistics
func backfillDemoMeta(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		log.Println("backfillDemoMeta expects (metaJsonString, callback)")
		return nil
	}

	metaJsonString := args[0].String()
	callback := args[1]

	go func() {
		if engineInstance == nil {
			callback.Invoke(js.Null(), "Parser not initialized")
			return
		}

		// Unmarshal the meta
		var meta entity.ReplayMeta
		err := json.Unmarshal([]byte(metaJsonString), &meta)
		if err != nil {
			log.Printf("JSON unmarshal error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		// Backfill metadata
		updatedMeta, err := engineInstance.BackfillMeta(&meta)
		if err != nil {
			log.Printf("BackfillMeta error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		b, err := json.Marshal(updatedMeta)
		if err != nil {
			log.Printf("JSON marshal error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		log.Printf("[BackfillMeta] Metadata backfilled, JSON size: %d bytes\n", len(b))
		callback.Invoke(string(b), js.Null())
	}()

	return nil
}

// closeDemoParser closes the parser and cleans up resources
func closeDemoParser(this js.Value, args []js.Value) interface{} {
	if engineInstance != nil {
		engineInstance.Close()
		engineInstance = nil
	}
	demoReaderBytes = nil
	log.Println("[CloseDemoParser] Parser closed and resources cleaned up")
	return js.Null()
}
