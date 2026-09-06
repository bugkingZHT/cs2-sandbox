//go:build !windows

package main

// Non-Windows builds retain localapp's exclusive data-directory locking.
const instanceName = "cs2-sandbox.SingleInstance.v1"

type instanceGuard struct{}

func acquireInstance(name string, notify bool) (*instanceGuard, error) { return &instanceGuard{}, nil }
func (g *instanceGuard) Watch(activate func())                         {}
func (g *instanceGuard) Close()                                        {}
