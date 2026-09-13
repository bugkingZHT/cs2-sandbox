package main

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestBuildDigestAndConcurrentStaging(t *testing.T) {
	source := filepath.Join(t.TempDir(), "arbitrary-name.exe")
	if err := os.WriteFile(source, []byte("build one"), 0700); err != nil {
		t.Fatal(err)
	}
	digest, err := fileDigest(source)
	if err != nil {
		t.Fatal(err)
	}
	identity := buildIdentity{UID: digest, Executable: source, RuntimeDir: t.TempDir()}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			path, err := identity.stageExecutable()
			if err != nil {
				t.Error(err)
				return
			}
			if got, err := fileDigest(path); err != nil || got != digest {
				t.Error("staging published incomplete or different bytes", got, err)
			}
		}()
	}
	wg.Wait()
	copyPath := filepath.Join(identity.RuntimeDir, identity.processName())
	copyDigest, _ := fileDigest(copyPath)
	if copyDigest != digest {
		t.Fatal("copying or renaming changed the build identity")
	}
	if err := os.WriteFile(source, []byte("build two"), 0700); err != nil {
		t.Fatal(err)
	}
	next, _ := fileDigest(source)
	if next == digest {
		t.Fatal("different builds have the same identity")
	}
	if _, err := identity.stageExecutable(); err != nil {
		t.Fatal("verified immutable cached build should remain reusable", err)
	}
	identity.RuntimeDir = t.TempDir()
	if _, err := identity.stageExecutable(); err == nil {
		t.Fatal("changed source was published under the old digest")
	}
}
