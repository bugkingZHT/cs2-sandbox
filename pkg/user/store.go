package user

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"time"

	"gorm.io/gorm"
)

const DefaultPasswordHash = "88888888"

const (
	uidChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	uidLen   = 8
)

// Store provides user persistence.
type Store struct {
	db *gorm.DB
}

// NewStore returns a new user store.
func NewStore(db *gorm.DB) *Store {
	return &Store{db: db}
}

// GenerateUID returns an 8-char random string [A-Z0-9].
func GenerateUID() (string, error) {
	b := make([]byte, uidLen)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(uidChars))))
		if err != nil {
			return "", err
		}
		b[i] = uidChars[n.Int64()]
	}
	return string(b), nil
}

// GetByUsername returns a user by username, or gorm.ErrRecordNotFound.
func (s *Store) GetByUsername(username string) (*User, error) {
	var u User
	err := s.db.Where("username = ?", username).First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetByID returns a user by primary key.
func (s *Store) GetByID(id uint) (*User, error) {
	var u User
	err := s.db.First(&u, id).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// Create creates a user. PasswordHash must already be hashed. UID is generated and guaranteed unique.
func (s *Store) Create(username, email, phone, passwordHash string) (*User, error) {
	for i := 0; i < 10; i++ {
		uid, err := GenerateUID()
		if err != nil {
			return nil, err
		}
		u := &User{
			UID:          uid,
			Username:     username,
			Email:        email,
			Phone:        phone,
			PasswordHash: passwordHash,
			Status:       StatusActive,
		}
		err = s.db.Create(u).Error
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
				continue
			}
			return nil, err
		}
		return u, nil
	}
	return nil, fmt.Errorf("user: could not generate unique UID")
}

// UpdateLastLoginAt sets LastLoginAt to now for the user.
func (s *Store) UpdateLastLoginAt(id uint) error {
	now := time.Now()
	return s.db.Model(&User{}).Where("id = ?", id).Update("last_login_at", now).Error
}

// UpdatePassword sets the user's password hash.
func (s *Store) UpdatePassword(id uint, hashedNewPassword string) error {
	return s.db.Model(&User{}).Where("id = ?", id).Update("password_hash", hashedNewPassword).Error
}
