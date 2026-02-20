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
// NoteItem represents a user note without demo data
// Demo data is stored separately in DemoItem table
type NoteItem struct {
	ID         string `gorm:"primaryKey;size:32"`
	OwnerID    uint   `gorm:"not null;index"`
	Title      string `gorm:"size:256"`
	Content    string `gorm:"type:text"` // user note content (free text)
	Permission string `gorm:"size:16;default:private"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
	DeletedAt  gorm.DeletedAt `gorm:"index"`
}

// DemoItem represents demo file data attached to notes
// This implements the true "attachment" model
type DemoItem struct {
	ID        uint   `gorm:"primaryKey;autoIncrement"`
	NoteID    string `gorm:"size:32;not null;index"` // reference to NoteItem
	UserID    uint   `gorm:"not null;index"`         // redundant for faster queries
	DemoUUID  string `gorm:"size:64;not null;index"` // demo identifier
	DemoRound int    `gorm:"not null"`               // round number
	DemoMeta  string `gorm:"type:json"`              // JSON metadata
	FilePath  string `gorm:"size:512"`               // file storage path
	FileSize  int64  `gorm:"not null;default:0"`     // file size in bytes
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (NoteItem) TableName() string {
	return "note_items"
}
