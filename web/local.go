package web

import "embed"

// LocalAssets contains only the local browser player and its map assets.
//
//go:embed all:localdist
var LocalAssets embed.FS
