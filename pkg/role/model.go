package role

import (
	"time"

	"gorm.io/gorm"
)

// Role name constants.
const (
	RoleNormal  = "normal"
	RolePro     = "pro"
	RoleProPlus = "pro+"
)

// Default priority and quota for each role (used when no DB roles table or as fallback).
var (
	DefaultRolePriority = map[string]int{
		RoleNormal:  0,
		RolePro:     50,
		RoleProPlus: 100,
	}
	DefaultRoleQuotaLimit = map[string]int{
		RoleNormal:  5,
		RolePro:     100,
		RoleProPlus: 1024,
	}
)

// Role is the roles table (config for normal/pro/pro+).
type Role struct {
	ID         uint   `gorm:"primaryKey"`
	Name       string `gorm:"size:32;uniqueIndex;not null"`
	Priority   int    `gorm:"not null"`
	QuotaLimit int    `gorm:"not null"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
	DeletedAt  gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (Role) TableName() string {
	return "roles"
}

// Subscription is a user's role activation record (pro/pro+ only; normal is not stored).
type Subscription struct {
	ID        uint      `gorm:"primaryKey"`
	OrderID   string    `gorm:"size:64;uniqueIndex;not null"`
	UserUID   string    `gorm:"size:8;not null;index:idx_user_active_ends,priority:1"`
	Role      string    `gorm:"size:32;not null"` // pro or pro+
	StartedAt time.Time `gorm:"not null"`
	EndsAt    time.Time `gorm:"not null;index:idx_user_active_ends,priority:3"`
	IsActive  bool      `gorm:"not null;default:true;index:idx_user_active_ends,priority:2"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// TableName overrides table name.
func (Subscription) TableName() string {
	return "role_subscriptions"
}
