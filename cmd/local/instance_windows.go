package main

import (
	"fmt"
	"log"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const instanceNamePrefix = `Global\cs2-sandbox.SingleInstance.v2.`

var instanceKernel = syscall.NewLazyDLL("kernel32.dll")
var createInstanceEvent = instanceKernel.NewProc("CreateEventW")
var signalInstanceEvent = instanceKernel.NewProc("SetEvent")
var openInstanceEvent = instanceKernel.NewProc("OpenEventW")

// A duplicate launcher can activate the matching build without spawning even a
// transient digest-named child. Creation still uses acquireInstance atomically.
func activateExistingInstance(name string, notify bool) (bool, error) {
	text, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return false, err
	}
	handle, _, callErr := openInstanceEvent.Call(0x0002, 0, uintptr(unsafe.Pointer(text))) // EVENT_MODIFY_STATE
	if handle == 0 {
		if callErr == syscall.ERROR_FILE_NOT_FOUND {
			return false, nil
		}
		if callErr == syscall.ERROR_ACCESS_DENIED {
			log.Print("此构建已在其他会话运行，系统拒绝激活访问")
			return true, nil
		}
		return false, fmt.Errorf("查找已有构建实例失败：%w", callErr)
	}
	defer syscall.CloseHandle(syscall.Handle(handle))
	if notify {
		ok, _, err := signalInstanceEvent.Call(handle)
		if ok == 0 {
			return true, fmt.Errorf("激活已有构建实例失败：%w", err)
		}
	}
	return true, nil
}

// A named auto-reset event doubles as the machine-wide lifetime guard and the
// activation channel. The owner keeps its handle for the entire server lifetime.
// Duplicates only signal and close: no data directory access, listener or UI loop.
type instanceGuard struct {
	handle syscall.Handle
	stop   chan struct{}
	wg     sync.WaitGroup
	once   sync.Once
}

func acquireInstance(name string, notify bool) (*instanceGuard, error) {
	text, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, err
	}
	handle, _, callErr := createInstanceEvent.Call(0, 0, 0, uintptr(unsafe.Pointer(text)))
	if handle == 0 {
		// Another Windows account can own the global object without granting access.
		// Do not start a competing server or leave a duplicate error-dialog process.
		if callErr == syscall.ERROR_ACCESS_DENIED {
			log.Print("cs2-sandbox 已在其他会话运行，或系统拒绝单实例访问")
			return nil, nil
		}
		return nil, fmt.Errorf("创建单实例标识失败：%w", callErr)
	}
	if callErr == syscall.ERROR_ALREADY_EXISTS {
		if notify {
			signalInstanceEvent.Call(handle)
		}
		syscall.CloseHandle(syscall.Handle(handle))
		return nil, nil
	}
	return &instanceGuard{handle: syscall.Handle(handle), stop: make(chan struct{})}, nil
}

func (g *instanceGuard) Watch(activate func()) {
	g.wg.Add(1)
	go func() {
		defer g.wg.Done()
		var last time.Time
		for {
			select {
			case <-g.stop:
				return
			default:
			}
			event, err := syscall.WaitForSingleObject(g.handle, 200)
			if err != nil {
				return
			}
			if event == syscall.WAIT_OBJECT_0 && time.Since(last) > time.Second {
				last = time.Now()
				activate()
			}
		}
	}()
}

func (g *instanceGuard) Close() {
	g.once.Do(func() { close(g.stop); g.wg.Wait(); syscall.CloseHandle(g.handle) })
}
