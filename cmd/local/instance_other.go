//go:build !windows

package main

// Windows provides the build activation channel; other platforms still use the
// shared library's transaction locks to protect their store.
const instanceNamePrefix = "cs2-sandbox.SingleInstance.v2."

type instanceGuard struct{}

func activateExistingInstance(name string, notify bool) (bool, error) { return false, nil }

func acquireInstance(name string, notify bool) (*instanceGuard, error) { return &instanceGuard{}, nil }
func (g *instanceGuard) Watch(activate func())                         {}
func (g *instanceGuard) Close()                                        {}
