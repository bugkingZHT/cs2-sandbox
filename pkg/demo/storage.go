package demo

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// FileStorage handles round_{N}.pb.gz files under SNOWBO_STORAGE_ROOTPATH.
// Directory layout: USER_{uid}/{demoUUID}/round_1.pb.gz, round_2.pb.gz, ...
type FileStorage struct {
	root string
}

// NewFileStorage returns a FileStorage. root is typically from os.Getenv("SNOWBO_STORAGE_ROOTPATH").
func NewFileStorage(root string) *FileStorage {
	return &FileStorage{root: root}
}

// Root returns the configured root path.
func (f *FileStorage) Root() string {
	return f.root
}

// IsConfigured returns true if root is non-empty and usable.
func (f *FileStorage) IsConfigured() bool {
	return f.root != ""
}

// DirRelativePath returns the directory relative path for a demo: USER_{uid}/{demoUUID}.
func (f *FileStorage) DirRelativePath(uid, demoUUID string) string {
	return filepath.Join("USER_"+uid, demoUUID)
}

// RoundRelativePath returns the relative path for a single round file: USER_{uid}/{demoUUID}/round_{N}.pb.gz.
func (f *FileStorage) RoundRelativePath(uid, demoUUID string, round int) string {
	return filepath.Join(f.DirRelativePath(uid, demoUUID), "round_"+strconv.Itoa(round)+".pb.gz")
}

// Path returns the full path for root/USER_{uid}/{demoUUID}/round_{round}.pb.gz.
func (f *FileStorage) Path(uid, demoUUID string, round int) string {
	return filepath.Join(f.root, f.RoundRelativePath(uid, demoUUID, round))
}

// SaveRound writes the reader content to round_{round}.pb.gz. Uses .tmp then rename like note storage.
func (f *FileStorage) SaveRound(uid, demoUUID string, round int, r io.Reader) error {
	if !f.IsConfigured() {
		return fmt.Errorf("demo storage: SNOWBO_STORAGE_ROOTPATH not set")
	}
	full := f.Path(uid, demoUUID, round)
	dir := filepath.Dir(full)
	tmpPath := full + ".tmp"
	log.Printf("[Demo Storage] SaveRound: path=%s", full)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("[Demo Storage] SaveRound: MkdirAll failed: %v", err)
		return err
	}
	out, err := os.Create(tmpPath)
	if err != nil {
		log.Printf("[Demo Storage] SaveRound: Create tmp failed: %v", err)
		return err
	}
	_, err = io.Copy(out, r)
	_ = out.Close()
	if err != nil {
		_ = os.Remove(tmpPath)
		log.Printf("[Demo Storage] SaveRound: Copy failed: %v", err)
		return err
	}
	if err := os.Rename(tmpPath, full); err != nil {
		_ = os.Remove(tmpPath)
		log.Printf("[Demo Storage] SaveRound: Rename failed: %v", err)
		return err
	}
	log.Printf("[Demo Storage] SaveRound: ok path=%s", full)
	return nil
}

// GetRound returns a ReadCloser for round_{round}.pb.gz. Caller must close it.
func (f *FileStorage) GetRound(uid, demoUUID string, round int) (io.ReadCloser, error) {
	if !f.IsConfigured() {
		return nil, fmt.Errorf("demo storage: SNOWBO_STORAGE_ROOTPATH not set")
	}
	full := f.Path(uid, demoUUID, round)
	rc, err := os.Open(full)
	if err != nil {
		log.Printf("[Demo Storage] GetRound: Open failed path=%s: %v", full, err)
		return nil, err
	}
	return rc, nil
}

// DeleteDemo removes the entire demo directory and all round_*.pb.gz files under it.
func (f *FileStorage) DeleteDemo(uid, demoUUID string) error {
	if !f.IsConfigured() {
		return nil
	}
	dir := filepath.Join(f.root, f.DirRelativePath(uid, demoUUID))
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		log.Printf("[Demo Storage] DeleteDemo: ReadDir failed path=%s: %v", dir, err)
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, "round_") && strings.HasSuffix(name, ".pb.gz") {
			p := filepath.Join(dir, name)
			if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
				log.Printf("[Demo Storage] DeleteDemo: Remove failed path=%s: %v", p, err)
				return err
			}
		}
	}
	if err := os.Remove(dir); err != nil && !os.IsNotExist(err) {
		log.Printf("[Demo Storage] DeleteDemo: Remove dir failed path=%s: %v", dir, err)
		return err
	}
	log.Printf("[Demo Storage] DeleteDemo: ok path=%s", dir)
	return nil
}

// ListRounds returns round numbers that exist on disk for the given demo (e.g. [1,2,3]).
func (f *FileStorage) ListRounds(uid, demoUUID string) ([]int, error) {
	if !f.IsConfigured() {
		return nil, nil
	}
	dir := filepath.Join(f.root, f.DirRelativePath(uid, demoUUID))
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var rounds []int
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasPrefix(name, "round_") || !strings.HasSuffix(name, ".pb.gz") {
			continue
		}
		numStr := strings.TrimSuffix(strings.TrimPrefix(name, "round_"), ".pb.gz")
		n, err := strconv.Atoi(numStr)
		if err != nil || n < 1 {
			continue
		}
		rounds = append(rounds, n)
	}
	return rounds, nil
}
