package email

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"time"

	"gorm.io/gorm"
)

const (
	CodeLen = 6
	codeTTL = 10 * time.Minute
	// rateLimitInterval is the minimum interval between two code requests for the same email.
	rateLimitInterval = 60 * time.Second
)

// Store provides persistence for email verifications.
type Store struct {
	db *gorm.DB
}

// NewStore returns a new email verification store.
func NewStore(db *gorm.DB) *Store {
	return &Store{db: db}
}

// GenerateCode returns a random 6-digit numeric string.
func GenerateCode() (string, error) {
	b := make([]byte, CodeLen)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		b[i] = '0' + byte(n.Int64())
	}
	return string(b), nil
}

// CreateCode creates a new verification code for the given email + purpose.
// Returns an error if a code was already sent within rateLimitInterval.
// Any previous unused codes for the same email+purpose are invalidated.
func (s *Store) CreateCode(email, purpose string) (*EmailVerification, error) {
	// Rate limit: reject if a code was requested less than 60s ago.
	var latest EmailVerification
	err := s.db.Where("email = ? AND purpose = ? AND used = false", email, purpose).
		Order("created_at desc").First(&latest).Error
	if err == nil && time.Since(latest.CreatedAt) < rateLimitInterval {
		remaining := rateLimitInterval - time.Since(latest.CreatedAt)
		return nil, fmt.Errorf("请 %.0f 秒后再试", remaining.Seconds())
	}

	// Invalidate old codes.
	s.db.Model(&EmailVerification{}).
		Where("email = ? AND purpose = ? AND used = false", email, purpose).
		Update("used", true)

	code, err := GenerateCode()
	if err != nil {
		return nil, err
	}
	v := &EmailVerification{
		Email:     email,
		Code:      code,
		Purpose:   purpose,
		ExpiresAt: time.Now().Add(codeTTL),
		Used:      false,
	}
	if err := s.db.Create(v).Error; err != nil {
		return nil, err
	}
	return v, nil
}

// VerifyCode checks that code is valid, not expired, not used, then marks it used.
func (s *Store) VerifyCode(email, code, purpose string) error {
	var v EmailVerification
	err := s.db.Where("email = ? AND code = ? AND purpose = ? AND used = false", email, code, purpose).
		First(&v).Error
	if err != nil {
		return fmt.Errorf("验证码无效")
	}
	if time.Now().After(v.ExpiresAt) {
		return fmt.Errorf("验证码已过期")
	}
	return s.db.Model(&v).Update("used", true).Error
}
