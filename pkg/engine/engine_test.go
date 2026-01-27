package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestParseDemoFile(t *testing.T) {
	// Paths relative to the test file location
	demoPath := filepath.Join("..", "..", "test", "manifests", "test.dem")
	outputPath := filepath.Join("..", "..", "test", "manifests", "test.json")

	// Open the demo file
	file, err := os.Open(demoPath)
	if err != nil {
		t.Fatalf("Failed to open demo file: %v", err)
	}
	defer file.Close()

	t.Logf("Parsing demo file: %s", demoPath)

	// Use a status callback that logs to the test output
	onStatus := func(msg string) {
		t.Logf("[Status] %s", msg)
	}

	// Parse the demo
	replay, err := NewDemoEngine(EngineConfig{ResolveFreezeTime: true}).BuildReplay(file, onStatus)
	if err != nil {
		t.Fatalf("Failed to parse demo: %v", err)
	}

	t.Logf("Parse successful! Got %d frames.", len(replay.Frames))

	// Marshal to JSON
	data, err := json.MarshalIndent(replay, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal replay to JSON: %v", err)
	}

	// Write JSON to manifests directory
	err = os.WriteFile(outputPath, data, 0644)
	if err != nil {
		t.Fatalf("Failed to write JSON file: %v", err)
	}

	fmt.Printf("Successfully generated JSON: %s (Size: %.2f MB)\n", outputPath, float64(len(data))/1024/1024)
}
