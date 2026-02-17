package note

import (
	"time"

	"gorm.io/gorm"
)

const (
	PermissionPrivate = "private"
	PermissionPublic  = "public"
)

// NoteItem is a single cloud note entry (one round).
type NoteItem struct {
	ID         string `gorm:"primaryKey;size:32"`
	OwnerID    uint   `gorm:"not null;index"`
	Title      string `gorm:"size:256;not null"`
	Content    string `gorm:"type:text"` // user note content (free text)
	Permission string `gorm:"size:16;default:private"`
	DemoUUID   string `gorm:"size:64;not null;index"`
	DemoRound  int    `gorm:"not null"`
	DemoMeta   string `gorm:"type:json"`          // JSON: mapName, teamCT, teamT, add_time, etc.
	FilePath   string `gorm:"size:512"`           // e.g. USER_{uid}/note-{note_id}/round_21.pb
	FileSize   int64  `gorm:"not null;default:0"` // file size in bytes
	CreatedAt  time.Time
	UpdatedAt  time.Time
	DeletedAt  gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (NoteItem) TableName() string {
	return "note_items"
}

// UserNoteTree stores one JSON tree per user (order of note item ids).
type UserNoteTree struct {
	ID        uint   `gorm:"primaryKey"`
	UserID    uint   `gorm:"uniqueIndex;not null"`
	Tree      string `gorm:"type:json;not null"` // {"order":["id1","id2",...]}
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (UserNoteTree) TableName() string {
	return "note_trees"
}
