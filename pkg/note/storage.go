package note

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// FileStorage handles round_{N}.pb files under SNOWBO_STORAGE_ROOTPATH.
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

// path returns the full path for root/USER_{uid}/note-{noteID}/round_{round}.pb.
func (f *FileStorage) path(uid, noteID string, round int) string {
	return filepath.Join(f.root, "USER_"+uid, "note-"+noteID, "round_"+strconv.Itoa(round)+".pb")
}

// SaveFile writes the reader content to root/USER_{uid}/note-{noteID}/round_{round}.pb.
// Writes to a .tmp file first and renames on success so that upload interrupt/failure does not leave partial files.
func (f *FileStorage) SaveFile(uid, noteID string, round int, r io.Reader) error {
	if !f.IsConfigured() {
		return fmt.Errorf("note storage: SNOWBO_STORAGE_ROOTPATH not set")
	}
	full := f.path(uid, noteID, round)
	dir := filepath.Dir(full)
	tmpPath := full + ".tmp"
	log.Printf("[Note Storage] SaveFile: path=%s", full)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("[Note Storage] SaveFile: MkdirAll failed: %v", err)
		return err
	}
	out, err := os.Create(tmpPath)
	if err != nil {
		log.Printf("[Note Storage] SaveFile: Create tmp failed: %v", err)
		return err
	}
	_, err = io.Copy(out, r)
	_ = out.Close()
	if err != nil {
		_ = os.Remove(tmpPath)
		_ = os.Remove(dir)
		log.Printf("[Note Storage] SaveFile: Copy failed: %v", err)
		return err
	}
	if err := os.Rename(tmpPath, full); err != nil {
		_ = os.Remove(tmpPath)
		_ = os.Remove(dir)
		log.Printf("[Note Storage] SaveFile: Rename failed: %v", err)
		return err
	}
	log.Printf("[Note Storage] SaveFile: ok path=%s", full)
	return nil
}

// fullPathFromRelative joins root with relativePath and returns a path under root; empty string if relativePath escapes.
func (f *FileStorage) fullPathFromRelative(relativePath string) string {
	if relativePath == "" || strings.Contains(relativePath, "..") {
		return ""
	}
	cleaned := filepath.Clean(relativePath)
	if filepath.IsAbs(cleaned) || strings.HasPrefix(cleaned, "..") {
		return ""
	}
	full := filepath.Join(f.root, cleaned)
	rel, err := filepath.Rel(f.root, full)
	if err != nil || strings.HasPrefix(rel, "..") {
		return ""
	}
	return full
}

// GetFile returns a ReadCloser for the round_{round}.pb file. Caller must close it.
func (f *FileStorage) GetFile(uid, noteID string, round int) (io.ReadCloser, error) {
	if !f.IsConfigured() {
		return nil, fmt.Errorf("note storage: SNOWBO_STORAGE_ROOTPATH not set")
	}
	full := f.path(uid, noteID, round)
	rc, err := os.Open(full)
	if err != nil {
		log.Printf("[Note Storage] GetFile: Open failed path=%s: %v", full, err)
		return nil, err
	}
	return rc, nil
}

// GetFileByRelativePath opens the file using the DB-stored relative path (e.g. USER_{uid}/note-{id}/round_N.pb). Use when GetFile fails. Returns nil, err if path is invalid or file missing.
func (f *FileStorage) GetFileByRelativePath(relativePath string) (io.ReadCloser, error) {
	if !f.IsConfigured() {
		return nil, fmt.Errorf("note storage: SNOWBO_STORAGE_ROOTPATH not set")
	}
	full := f.fullPathFromRelative(relativePath)
	if full == "" {
		return nil, fmt.Errorf("note storage: invalid relative path")
	}
	rc, err := os.Open(full)
	if err != nil {
		log.Printf("[Note Storage] GetFileByRelativePath: Open failed path=%s: %v", full, err)
		return nil, err
	}
	return rc, nil
}

// DeleteFile removes the round_{round}.pb file and its parent directory if empty.
func (f *FileStorage) DeleteFile(uid, noteID string, round int) error {
	if !f.IsConfigured() {
		return nil
	}
	full := f.path(uid, noteID, round)
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		log.Printf("[Note Storage] DeleteFile: Remove failed path=%s: %v", full, err)
		return err
	}
	dir := filepath.Dir(full)
	_ = os.Remove(dir) // best-effort remove empty dir
	log.Printf("[Note Storage] DeleteFile: ok path=%s", full)
	return nil
}

// DeleteFileByRelativePath removes the file using the DB-stored relative path. Use when DeleteFile fails. No-op if path invalid or file not found.
func (f *FileStorage) DeleteFileByRelativePath(relativePath string) error {
	if !f.IsConfigured() {
		return nil
	}
	full := f.fullPathFromRelative(relativePath)
	if full == "" {
		return nil
	}
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		log.Printf("[Note Storage] DeleteFileByRelativePath: Remove failed path=%s: %v", full, err)
		return err
	}
	dir := filepath.Dir(full)
	_ = os.Remove(dir)
	log.Printf("[Note Storage] DeleteFileByRelativePath: ok path=%s", full)
	return nil
}
