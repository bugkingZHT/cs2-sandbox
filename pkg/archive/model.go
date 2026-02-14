package archive

import (
	"time"

	"gorm.io/gorm"
)

const (
	PermissionPrivate = "private"
	PermissionPublic  = "public"
)

// ArchiveItem is a single cloud archive entry (one round).
type ArchiveItem struct {
	ID         string `gorm:"primaryKey;size:32"`
	OwnerID    uint   `gorm:"not null;index"`
	Title      string `gorm:"size:256;not null"`
	Permission string `gorm:"size:16;default:private"`
	DemoUUID   string `gorm:"size:64;not null;index"`
	DemoRound  int    `gorm:"not null"`
	DemoMeta   string `gorm:"type:json"`          // JSON: mapName, teamCT, teamT, add_time, etc.
	FilePath   string `gorm:"size:512"`           // e.g. USER_{uid}/archive-{archive_id}/round_21.pb
	FileSize   int64  `gorm:"not null;default:0"` // file size in bytes
	CreatedAt  time.Time
	UpdatedAt  time.Time
	DeletedAt  gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (ArchiveItem) TableName() string {
	return "archive_items"
}

// UserArchiveTree stores one JSON tree per user (order of archive item ids).
type UserArchiveTree struct {
	ID        uint   `gorm:"primaryKey"`
	UserID    uint   `gorm:"uniqueIndex;not null"`
	Tree      string `gorm:"type:json;not null"` // {"order":["id1","id2",...]}
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (UserArchiveTree) TableName() string {
	return "user_archive_trees"
}
