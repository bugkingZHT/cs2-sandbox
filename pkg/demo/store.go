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

// GetByUserAndUUID returns a demo by user UID and demo UUID.
func (s *Store) GetByUserAndUUID(userUID string, demoUUID string) (*Demo, error) {
	var d Demo
	err := s.db.Where("user_uid = ? AND demo_uuid = ?", userUID, demoUUID).First(&d).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &d, nil
}

// ListByUser returns all demos for the given user (by UID), newest first.
func (s *Store) ListByUser(userUID string) ([]*Demo, error) {
	var list []*Demo
	err := s.db.Where("user_uid = ?", userUID).Order("created_at DESC").Find(&list).Error
	return list, err
}

// ListByDemoUUID returns all demos with the given demo_uuid (same UUID may exist under different users).
func (s *Store) ListByDemoUUID(demoUUID string) ([]*Demo, error) {
	var list []*Demo
	err := s.db.Where("demo_uuid = ?", demoUUID).Find(&list).Error
	return list, err
}

// Update updates a demo by ID; owner must match (by UID).
func (s *Store) Update(id uint, userUID string, updates map[string]interface{}) error {
	res := s.db.Model(&Demo{}).Where("id = ? AND user_uid = ?", id, userUID).Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// Delete deletes a demo by ID; owner must match (by UID).
func (s *Store) Delete(id uint, userUID string) error {
	res := s.db.Where("id = ? AND user_uid = ?", id, userUID).Delete(&Demo{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
