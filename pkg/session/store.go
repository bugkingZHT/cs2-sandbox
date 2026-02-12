package session

import (
	"time"

	"github.com/bugkingzht/cs-demobox/pkg/user"
	"gorm.io/gorm"
)

// Store provides session persistence.
type Store struct {
	db *gorm.DB
}

// NewStore returns a new session store.
func NewStore(db *gorm.DB) *Store {
	return &Store{db: db}
}

// Create creates a session for the user with the given sessionID and expiry.
func (s *Store) Create(sessionID string, userID uint, expiresAt time.Time) error {
	return s.db.Create(&Session{
		SessionID: sessionID,
		UserID:    userID,
		ExpiresAt: expiresAt,
	}).Error
}

// DeleteBySessionID removes the session with the given ID.
func (s *Store) DeleteBySessionID(sessionID string) error {
	return s.db.Where("session_id = ?", sessionID).Delete(&Session{}).Error
}

// DeleteByUserID removes all sessions for the given user (e.g. after password change).
func (s *Store) DeleteByUserID(userID uint) error {
	return s.db.Where("user_id = ?", userID).Delete(&Session{}).Error
}

// GetBySessionID returns the session and associated user if found and not expired.
func (s *Store) GetBySessionID(sessionID string) (*Session, *user.User, error) {
	var sess Session
	err := s.db.Where("session_id = ? AND expires_at > ?", sessionID, time.Now()).First(&sess).Error
	if err != nil {
		return nil, nil, err
	}
	var u user.User
	err = s.db.First(&u, sess.UserID).Error
	if err != nil {
		return nil, nil, err
	}
	return &sess, &u, nil
}
