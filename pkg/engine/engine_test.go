package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/bugkingzht/cs-demobox/pkg/engine/entity"
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

	// Create engine instance
	engine := NewDemoEngine(EngineConfig{ResolveFreezeTime: true})

	// Phase 1: Initialize parser and extract metadata
	t.Log("[Phase 1] Initializing parser...")
	err = engine.InitParser(file)
	if err != nil {
		t.Fatalf("Failed to initialize parser: %v", err)
	}

	t.Log("[Phase 1] Extracting metadata...")
	meta, err := engine.ExtractMetadata()
	if err != nil {
		t.Fatalf("Failed to extract metadata: %v", err)
	}

	if meta.UUID == "" {
		t.Fatal("Meta UUID is empty")
	}
	if meta.MapName == "" {
		t.Fatal("Meta MapName is empty")
	}
	if meta.TotalRounds != 0 {
		t.Errorf("Expected TotalRounds to be 0 before backfill, got %d", meta.TotalRounds)
	}

	t.Logf("[Phase 1] Metadata extracted: UUID=%s, Map=%s", meta.UUID, meta.MapName)

	// Phase 2: Parse rounds incrementally
	t.Log("[Phase 2] Parsing rounds...")
	rounds := []*entity.ReplayRound{}
	for {
		round, err := engine.ParseNextRound(func(msg string) {
			t.Logf("[Status] %s", msg)
		})
		if err != nil {
			t.Fatalf("Failed to parse round: %v", err)
		}
		if round == nil {
			break // EOF
		}
		rounds = append(rounds, round)
		t.Logf("[Phase 2] Parsed round %d with %d frames", round.Round, len(round.Frames))
	}

	if len(rounds) == 0 {
		t.Fatal("No rounds parsed")
	}

	t.Logf("[Phase 2] Parsed %d rounds total", len(rounds))

	// Phase 3: Backfill metadata
	t.Log("[Phase 3] Backfilling metadata...")
	updatedMeta, err := engine.BackfillMeta(meta)
	if err != nil {
		t.Fatalf("Failed to backfill metadata: %v", err)
	}

	if updatedMeta.TotalRounds != len(rounds) {
		t.Errorf("Expected TotalRounds to be %d, got %d", len(rounds), updatedMeta.TotalRounds)
	}
	if updatedMeta.ScoreCT+updatedMeta.ScoreT == 0 {
		t.Error("Expected non-zero scores after backfill")
	}

	t.Logf("[Phase 3] Backfilled: TotalRounds=%d, ScoreCT=%d, ScoreT=%d",
		updatedMeta.TotalRounds, updatedMeta.ScoreCT, updatedMeta.ScoreT)

	// Cleanup
	err = engine.Close()
	if err != nil {
		t.Fatalf("Failed to close engine: %v", err)
	}

	t.Log("[Cleanup] Engine closed successfully")

	// Create a combined structure for testing output
	testOutput := struct {
		Meta   *entity.ReplayMeta    `json:"meta"`
		Rounds []*entity.ReplayRound `json:"rounds"`
	}{
		Meta:   updatedMeta,
		Rounds: rounds,
	}

	// Marshal to JSON
	data, err := json.MarshalIndent(testOutput, "", "  ")
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
