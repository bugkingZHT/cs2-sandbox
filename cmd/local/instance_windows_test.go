package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"testing"
	"time"
)

func TestDifferentBuildInstances(t *testing.T) {
	base := fmt.Sprintf(`Local\cs2-build-test-%d-%d-`, os.Getpid(), time.Now().UnixNano())
	if found, err := activateExistingInstance(base+"build-a", true); err != nil || found {
		t.Fatal("unstarted build incorrectly found", found, err)
	}
	a, err := acquireInstance(base+"build-a", false)
	if err != nil || a == nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := acquireInstance(base+"build-b", false)
	if err != nil || b == nil {
		t.Fatal("different build could not coexist", err)
	}
	defer b.Close()
	activatedA, activatedB := make(chan struct{}, 1), make(chan struct{}, 1)
	a.Watch(func() { activatedA <- struct{}{} })
	b.Watch(func() { activatedB <- struct{}{} })
	if found, err := activateExistingInstance(base+"build-a", true); err != nil || !found {
		t.Fatal("launcher did not find matching build", found, err)
	}
	duplicate, err := acquireInstance(base+"build-a", false)
	if err != nil || duplicate != nil {
		t.Fatal("same build started twice", err)
	}
	select {
	case <-activatedA:
	case <-time.After(3 * time.Second):
		t.Fatal("matching build did not receive activation")
	}
	select {
	case <-activatedB:
		t.Fatal("activation reached another build")
	default:
	}
}

func TestInstanceActivation(t *testing.T) {
	name := fmt.Sprintf(`Local\cs2-sandbox-test-%d-%d`, os.Getpid(), time.Now().UnixNano())
	first, err := acquireInstance(name, false)
	if err != nil || first == nil {
		t.Fatal("first launch", err)
	}
	defer first.Close()
	// Signal before the first server is ready: auto-reset event retains activation.
	duplicate, err := acquireInstance(name, true)
	if err != nil || duplicate != nil {
		t.Fatal("duplicate became primary", err)
	}
	activated := make(chan struct{}, 1)
	first.Watch(func() { activated <- struct{}{} })
	select {
	case <-activated:
	case <-time.After(3 * time.Second):
		t.Fatal("activation lost")
	}
	first.Close()
	next, err := acquireInstance(name, false)
	if err != nil || next == nil {
		t.Fatal("normal exit did not release guard", err)
	}
	next.Close()
}

func TestInstanceHelper(t *testing.T) {
	name := os.Getenv("CS_DEMO_INSTANCE_TEST")
	if name == "" {
		t.Skip("subprocess helper")
	}
	guard, err := acquireInstance(name, false)
	if err != nil || guard == nil {
		t.Fatal("helper claim", err)
	}
	fmt.Println("ready")
	time.Sleep(time.Minute)
	guard.Close()
}

func TestInstanceCrashRelease(t *testing.T) {
	name := fmt.Sprintf(`Local\cs2-sandbox-crash-%d-%d`, os.Getpid(), time.Now().UnixNano())
	cmd := exec.Command(os.Args[0], "-test.run=^TestInstanceHelper$")
	cmd.Env = append(os.Environ(), "CS_DEMO_INSTANCE_TEST="+name)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer cmd.Process.Kill()
	ready := make(chan struct{})
	go func() { b := make([]byte, 100); stdout.Read(b); close(ready) }()
	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		t.Fatal("helper startup timeout")
	}
	duplicate, err := acquireInstance(name, false)
	if err != nil || duplicate != nil {
		if duplicate != nil {
			duplicate.Close()
		}
		t.Fatal("two processes acquired guard", err)
	}
	if err := cmd.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	cmd.Wait()
	replacement, err := acquireInstance(name, false)
	if err != nil || replacement == nil {
		t.Fatal("crash left stale guard", err)
	}
	defer replacement.Close()
	state, err := syscall.WaitForSingleObject(replacement.handle, 0)
	if err != nil || state != syscall.WAIT_TIMEOUT {
		t.Fatal("unexpected event state", state, err)
	}
}
