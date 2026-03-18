package email

import "time"

// EmailVerification stores one-time codes for email verification.
type EmailVerification struct {
	ID        uint      `gorm:"primaryKey"`
	Email     string    `gorm:"size:128;not null;index"`
	Code      string    `gorm:"size:8;not null"`
	Purpose   string    `gorm:"size:32;not null;default:'register'"` // register, reset_password
	ExpiresAt time.Time `gorm:"not null"`
	Used      bool      `gorm:"not null;default:false"`
	CreatedAt time.Time
}

// TableName overrides the default table name.
func (EmailVerification) TableName() string {
	return "email_verifications"
}
