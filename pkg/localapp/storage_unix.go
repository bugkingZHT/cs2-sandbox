//go:build linux || darwin

package localapp

import (
	"os"
	"path/filepath"
	"syscall"
)

func lockStore(root string) (func(), error) {
	f, err := os.OpenFile(filepath.Join(root, ".lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, storeBusy(err)
	}
	return func() { f.Close() }, nil
}
