package localapp

import (
	"path/filepath"
	"syscall"
)

// A Windows exclusive handle is released even after a crash or Task Manager kill.
func lockStore(root string) (func(), error) {
	path, err := syscall.UTF16PtrFromString(filepath.Join(root, ".lock"))
	if err != nil {
		return nil, err
	}
	handle, err := syscall.CreateFile(path, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, storeBusy(err)
	}
	return func() { syscall.CloseHandle(handle) }, nil
}
