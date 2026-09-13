package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// Injected by build-local.ps1 so separate packaging runs have distinct digests,
// even when the source tree and reproducible Go build inputs are identical.
var buildStamp = "development"

type buildIdentity struct {
	UID        string `json:"uid"`
	BuildStamp string `json:"buildStamp"`
	Executable string `json:"executable"`
	RuntimeDir string `json:"runtimeDir"`
}

func fileDigest(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func currentBuildIdentity() (buildIdentity, error) {
	executable, err := os.Executable()
	if err != nil {
		return buildIdentity{}, err
	}
	uid, err := fileDigest(executable)
	if err != nil {
		return buildIdentity{}, fmt.Errorf("读取 EXE 标识失败：%w", err)
	}
	base, err := os.UserCacheDir()
	if err != nil {
		return buildIdentity{}, err
	}
	return buildIdentity{UID: uid, BuildStamp: buildStamp, Executable: executable,
		RuntimeDir: filepath.Join(base, "cs2-sandbox-runtime", uid)}, nil
}

func (b buildIdentity) processName() string  { return "cs2-sandbox-" + b.UID[:16] + ".exe" }
func (b buildIdentity) instanceName() string { return instanceNamePrefix + b.UID }

// Publish a complete, verified copy atomically without replacing an existing
// image. A hard link within the same cache directory is create-if-absent; unlike
// Rename on Windows it cannot race with a winner already opening its executable.
func (b buildIdentity) stageExecutable() (string, error) {
	if err := os.MkdirAll(b.RuntimeDir, 0700); err != nil {
		return "", err
	}
	target := filepath.Join(b.RuntimeDir, b.processName())
	if digest, err := fileDigest(target); err == nil && digest == b.UID {
		return target, nil
	}
	source, err := os.Open(b.Executable)
	if err != nil {
		return "", err
	}
	defer source.Close()
	tmp, err := os.CreateTemp(b.RuntimeDir, ".launch-*.exe")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp.Name())
	h := sha256.New()
	_, copyErr := io.Copy(io.MultiWriter(tmp, h), source)
	closeErr := tmp.Close()
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	if hex.EncodeToString(h.Sum(nil)) != b.UID {
		return "", fmt.Errorf("EXE 内容在启动时发生变化，请重试")
	}
	if err := os.Chmod(tmp.Name(), 0700); err != nil {
		return "", err
	}
	if err := os.Link(tmp.Name(), target); err != nil {
		if digest, checkErr := fileDigest(target); checkErr == nil && digest == b.UID {
			return target, nil
		}
		return "", err
	}
	return target, nil
}

// This file is diagnostic only; the kernel event, never the PID file, owns the
// lifetime lock. Do not persist the browser's authentication token here.
func (b buildIdentity) writeRuntimeInfo(address string) error {
	if err := os.MkdirAll(b.RuntimeDir, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(struct {
		UID     string `json:"uid"`
		PID     int    `json:"pid"`
		Address string `json:"address"`
	}{b.UID, os.Getpid(), address}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(b.RuntimeDir, "instance.json"), data, 0600)
}
