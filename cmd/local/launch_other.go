//go:build !windows

package main

func launchNamedProcess(identity buildIdentity) (bool, error) { return false, nil }
