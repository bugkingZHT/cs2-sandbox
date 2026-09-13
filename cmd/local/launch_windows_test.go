package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

// Set two packaged EXE paths to exercise detached, digest-named child processes.
// Every child receives an isolated LOCALAPPDATA; the real Demo library is untouched.
func TestPackagedBuildInstances(t *testing.T) {
	paths := []string{os.Getenv("CS_INSTANCE_EXE_A"), os.Getenv("CS_INSTANCE_EXE_B")}
	if paths[0] == "" || paths[1] == "" {
		t.Skip("set CS_INSTANCE_EXE_A and CS_INSTANCE_EXE_B to different packaged builds")
	}
	cache := t.TempDir()
	t.Setenv("LOCALAPPDATA", cache)
	type running struct {
		UID     string `json:"uid"`
		PID     int    `json:"pid"`
		Address string `json:"address"`
	}
	identities := make([]buildIdentity, 2)
	for i, path := range paths {
		abs, err := filepath.Abs(path)
		if err != nil {
			t.Fatal(err)
		}
		paths[i] = abs
		out, err := exec.Command(abs, "-build-info").Output()
		if err != nil || json.Unmarshal(out, &identities[i]) != nil {
			t.Fatal("read build identity", err, string(out))
		}
		actual, err := fileDigest(abs)
		if err != nil || actual != identities[i].UID {
			t.Fatal("UID is not the complete EXE digest", err)
		}
	}
	if identities[0].UID == identities[1].UID {
		t.Fatal("integration test requires independently packaged builds")
	}
	start := func(path string) {
		t.Helper()
		cmd := exec.Command(path, "-no-browser")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		if err := cmd.Run(); err != nil {
			t.Fatal("launcher", err)
		}
	}
	read := func(identity buildIdentity, previousPID int) running {
		t.Helper()
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			data, _ := os.ReadFile(filepath.Join(identity.RuntimeDir, "instance.json"))
			var info running
			if json.Unmarshal(data, &info) == nil && info.PID != 0 && info.PID != previousPID && info.UID == identity.UID {
				client := http.Client{Timeout: time.Second}
				resp, err := client.Get("http://" + info.Address + "/")
				if err == nil {
					io.Copy(io.Discard, resp.Body)
					resp.Body.Close()
					if resp.StatusCode == 200 {
						return info
					}
				}
			}
			time.Sleep(25 * time.Millisecond)
		}
		t.Fatal("named server did not start", identity.UID)
		return running{}
	}
	stop := func(info running) {
		if process, err := os.FindProcess(info.PID); err == nil {
			process.Kill()
			process.Wait()
		}
	}
	start(paths[0])
	a := read(identities[0], 0)
	t.Cleanup(func() { stop(a) })
	copyPath := filepath.Join(t.TempDir(), "renamed-copy.exe")
	data, err := os.ReadFile(paths[0])
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(copyPath, data, 0700); err != nil {
		t.Fatal(err)
	}
	start(copyPath)
	duplicate := read(identities[0], 0)
	if duplicate.PID != a.PID || duplicate.Address != a.Address {
		t.Fatal("renamed copy created another server", a, duplicate)
	}
	start(paths[1])
	b := read(identities[1], 0)
	t.Cleanup(func() { stop(b) })
	if a.PID == b.PID || a.Address == b.Address {
		t.Fatal("different builds did not get separate processes and kernel ports", a, b)
	}
	for i, info := range []running{a, b} {
		path, err := imagePathForPID(info.PID)
		if err != nil || filepath.Base(path) != identities[i].processName() {
			t.Fatal("task-manager image name is missing digest", path, err)
		}
	}
	stop(a)
	time.Sleep(100 * time.Millisecond)
	start(paths[0])
	a = read(identities[0], a.PID)
	if a.Address == b.Address {
		t.Fatal("restarted build stole the other live build's port")
	}
	t.Logf("A PID=%d %s %s; B PID=%d %s %s; duplicate reused A; killed A restarted independently",
		a.PID, identities[0].processName(), a.Address, b.PID, identities[1].processName(), b.Address)
}

func imagePathForPID(pid int) (string, error) {
	handle, err := syscall.OpenProcess(0x1000, false, uint32(pid)) // PROCESS_QUERY_LIMITED_INFORMATION
	if err != nil {
		return "", err
	}
	defer syscall.CloseHandle(handle)
	buffer := make([]uint16, 32768)
	size := uint32(len(buffer))
	ok, _, callErr := instanceKernel.NewProc("QueryFullProcessImageNameW").Call(uintptr(handle), 0,
		uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(&size)))
	if ok == 0 {
		return "", callErr
	}
	return syscall.UTF16ToString(buffer[:size]), nil
}
