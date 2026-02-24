package demo

import (
	"errors"

	"gorm.io/gorm"
)

// Store provides demo persistence.
type Store struct {
	db *gorm.DB
}

// NewStore returns a new demo store.
func NewStore(db *gorm.DB) *Store {
	return &Store{db: db}
}

// Create creates a demo record.
func (s *Store) Create(d *Demo) error {
	return s.db.Create(d).Error
}

// GetByID returns a demo by ID.
func (s *Store) GetByID(id uint) (*Demo, error) {
	var d Demo
	err := s.db.Where("id = ?", id).First(&d).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &d, nil
}

// GetByUserAndUUID returns a demo by user ID and demo UUID.
func (s *Store) GetByUserAndUUID(userID uint, demoUUID string) (*Demo, error) {
	var d Demo
	err := s.db.Where("user_id = ? AND demo_uuid = ?", userID, demoUUID).First(&d).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &d, nil
}

// ListByUser returns all demos for the given user, newest first.
func (s *Store) ListByUser(userID uint) ([]*Demo, error) {
	var list []*Demo
	err := s.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&list).Error
	return list, err
}

// Update updates a demo by ID; owner must match.
func (s *Store) Update(id uint, userID uint, updates map[string]interface{}) error {
	res := s.db.Model(&Demo{}).Where("id = ? AND user_id = ?", id, userID).Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// Delete deletes a demo by ID; owner must match.
func (s *Store) Delete(id uint, userID uint) error {
	res := s.db.Where("id = ? AND user_id = ?", id, userID).Delete(&Demo{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
