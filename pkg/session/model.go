package session

import (
	"time"
)

// Session is the session table model.
type Session struct {
	ID        uint      `gorm:"primaryKey"`
	SessionID string    `gorm:"size:64;uniqueIndex;not null"`
	UserID    uint      `gorm:"not null;index"`
	ExpiresAt time.Time `gorm:"not null;index"`
	CreatedAt time.Time
}

// TableName overrides table name.
func (Session) TableName() string {
	return "sessions"
}
