package user

import (
	"time"

	"gorm.io/gorm"
)

// Status for user account.
const (
	StatusActive   = 1
	StatusDisabled = 0
)

// User is the user table model.
type User struct {
	ID           uint   `gorm:"primaryKey"`
	UID          string `gorm:"size:8;uniqueIndex;not null"`
	Username     string `gorm:"size:64;uniqueIndex;not null"`
	Email        string `gorm:"size:128"`
	Phone        string `gorm:"size:32"`
	PasswordHash string `gorm:"size:255;not null"`
	Status       int    `gorm:"default:1"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
	LastLoginAt  *time.Time
	DeletedAt    gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (User) TableName() string {
	return "users"
}
