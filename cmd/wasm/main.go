//go:build js && wasm
// +build js,wasm

package main

import (
	"bytes"
	"encoding/json"
	"log"
	"syscall/js"

	"github.com/bugkingzht/cs-demobox/pkg/engine"
)

func main() {
	done := make(chan struct{})

	js.Global().Set("parseDemo", js.FuncOf(parseDemo))

	log.Println("WASM replay parser initialized")
	<-done
}

func parseDemo(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		log.Println("parseDemo expects (Uint8Array, callback, optional statusCallback)")
		return nil
	}

	dataVal := args[0]
	callback := args[1]
	var statusCallback js.Value
	if len(args) >= 3 {
		statusCallback = args[2]
	}

	go func() {
		log.Println("[1/5] Starting to copy demo file bytes...")
		buf := make([]byte, dataVal.Get("byteLength").Int())
		js.CopyBytesToGo(buf, dataVal)
		log.Printf("[2/5] Copied %d bytes, starting to parse demo...\n", len(buf))

		var onStatus func(string)
		if !statusCallback.IsUndefined() && !statusCallback.IsNull() {
			onStatus = func(s string) {
				statusCallback.Invoke(s)
			}
		}

		engine := engine.NewDemoEngine(engine.EngineConfig{ResolveFreezeTime: false})
		meta, rounds, err := engine.BuildReplay(bytes.NewReader(buf), onStatus)
		if err != nil {
			log.Printf("Parse error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		log.Printf("[4/5] Parse complete! Got %d rounds with UUID: %s, marshaling to JSON...\n", len(rounds), meta.UUID)

		// Create response structure with meta and rounds
		response := struct {
			Meta   interface{}   `json:"meta"`
			Rounds []interface{} `json:"rounds"`
		}{
			Meta:   meta,
			Rounds: make([]interface{}, len(rounds)),
		}
		for i, round := range rounds {
			response.Rounds[i] = round
		}

		b, err := json.Marshal(response)
		if err != nil {
			log.Printf("JSON marshal error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		log.Printf("[5/5] Done! JSON size: %d bytes\n", len(b))
		callback.Invoke(string(b), js.Null())
	}()

	return nil
}
