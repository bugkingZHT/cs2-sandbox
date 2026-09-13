package localapp

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// New builds share a lifetime handle on the legacy lock file, excluding legacy
// writers while allowing each other. Metadata transactions use a separate lock.
func (s *Server) enableSharedAccess() error {
	s.compatMu.Lock()
	defer s.compatMu.Unlock()
	if s.compatUnlock != nil {
		return nil
	}
	unlock, err := shareStore(s.root)
	if err != nil {
		return fmt.Errorf("旧版应用仍独占 Demo 库，请关闭旧进程后重试：%w", err)
	}
	s.compatUnlock = unlock
	return nil
}

func (s *Server) closeSharedAccess() {
	s.compatMu.Lock()
	defer s.compatMu.Unlock()
	if s.compatUnlock != nil {
		s.compatUnlock()
		s.compatUnlock = nil
	}
}

func (s *Server) lockLibrary() (func(), error) {
	if !s.shared {
		return func() {}, nil
	}
	if err := s.enableSharedAccess(); err != nil {
		return nil, err
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		unlock, err := lockStore(filepath.Join(s.root, ".transactions"))
		if err == nil {
			return unlock, nil
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("Demo 库正在被其他进程写入；若旧版应用仍在运行，请关闭旧进程后重试：%w", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// Caller holds s.mu. Always refresh before deduplication, rename or deletion so
// a stale per-process map cannot overwrite another build's committed changes.
func (s *Server) beginLibraryUpdate() (func(), error) {
	unlock, err := s.lockLibrary()
	if err != nil {
		return nil, err
	}
	if s.shared {
		if err := s.loadLibrarySnapshot(true); err != nil {
			unlock()
			return nil, err
		}
	}
	return unlock, nil
}

// Worker commits use the same transaction lock as readers and user mutations.
// Upload preparation and HTTP mutations already hold it and use persist directly.
func (s *Server) persistWorkerState(st State) error {
	unlock, err := s.lockLibrary()
	if err != nil {
		return err
	}
	defer unlock()
	return s.persist(st)
}

// Caller holds s.mu, or is constructing the Server before publishing it.
func (s *Server) refreshLibrary() error {
	if !s.shared {
		if len(s.library) == 0 {
			return s.loadLibrary()
		}
		return nil
	}
	if err := s.enableSharedAccess(); err != nil {
		return s.loadLibrarySnapshot(false)
	}
	unlock, err := lockStore(filepath.Join(s.root, ".transactions"))
	if err != nil {
		return s.loadLibrarySnapshot(false)
	}
	defer unlock()
	return s.loadLibrarySnapshot(true)
}

func (s *Server) ownerAlive(owner string) bool {
	if owner == "" || !validEntryID(owner) {
		return false
	}
	if owner == s.owner {
		return true
	}
	leaseDir := filepath.Join(s.root, ".sessions", owner)
	if _, err := os.Stat(leaseDir); os.IsNotExist(err) {
		return false
	}
	unlock, err := lockStore(leaseDir)
	if err != nil {
		return true // Includes conservative treatment of access-denied failures.
	}
	unlock()
	return false
}
