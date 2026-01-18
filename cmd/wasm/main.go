//go:build js && wasm
// +build js,wasm

package main

import (
	"bytes"
	"encoding/json"
	"log"
	"syscall/js"

	"github.com/bugkingzht/cs-demobox/src/engine"
)

func main() {
	done := make(chan struct{})

	js.Global().Set("parseDemo", js.FuncOf(parseDemo))

	log.Println("WASM replay parser initialized")
	<-done
}

func parseDemo(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		log.Println("parseDemo expects (Uint8Array, callback)")
		return nil
	}

	dataVal := args[0]
	callback := args[1]

	go func() {
		log.Println("[1/5] Starting to copy demo file bytes...")
		buf := make([]byte, dataVal.Get("byteLength").Int())
		js.CopyBytesToGo(buf, dataVal)
		log.Printf("[2/5] Copied %d bytes, starting to parse demo...\n", len(buf))

		replay, err := engine.BuildReplay(bytes.NewReader(buf))
		if err != nil {
			log.Printf("Parse error: %v\n", err)
			callback.Invoke(js.Null(), err.Error())
			return
		}

		log.Printf("[4/5] Parse complete! Got %d frames, marshaling to JSON...\n", len(replay.Frames))
		b, err := json.Marshal(replay)
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
