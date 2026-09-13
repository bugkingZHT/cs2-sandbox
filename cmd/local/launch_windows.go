package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func launchNamedProcess(identity buildIdentity) (bool, error) {
	if strings.EqualFold(filepath.Base(identity.Executable), identity.processName()) {
		return false, nil
	}
	path, err := identity.stageExecutable()
	if err != nil {
		return false, err
	}
	child := exec.Command(path, os.Args[1:]...)
	// No console window and no lifetime dependency on the transient launcher.
	child.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x00000008 | 0x00000200}
	if err := child.Start(); err != nil {
		return false, err
	}
	return true, child.Process.Release()
}
