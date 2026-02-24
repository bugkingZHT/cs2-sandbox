package demo

import (
	"time"

	"gorm.io/gorm"
)

const (
	PermissionPrivate int8 = 0
	PermissionPublic  int8 = 1
)

// Demo represents a standalone demo record (not attached to a note).
// Files are stored under FilePath as round_1.pb.gz, round_2.pb.gz, etc.
type Demo struct {
	ID         uint   `gorm:"primaryKey;autoIncrement"`
	UserID     uint   `gorm:"not null;index"`
	DemoUUID   string `gorm:"size:64;not null;uniqueIndex:idx_user_demo"`
	DemoMeta   string `gorm:"type:json"`
	FilePath   string `gorm:"size:512"`               // directory: USER_{uid}/{demoUUID}
	FileSize   int64  `gorm:"not null;default:0"`    // total size of all round pb.gz files
	Permission int8   `gorm:"not null;default:0"`    // 0 private, 1 public
	CreatedAt  time.Time
	UpdatedAt  time.Time
	DeletedAt  gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (Demo) TableName() string {
	return "demos"
}
