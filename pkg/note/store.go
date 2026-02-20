package note

import (
	"errors"

	"gorm.io/gorm"
)

// Store provides note and tree persistence.
type Store struct {
	db *gorm.DB
}

// NewStore returns a new note store.
func NewStore(db *gorm.DB) *Store {
	return &Store{db: db}
}

// CreateItem creates a note item.
func (s *Store) CreateItem(item *NoteItem) error {
	return s.db.Create(item).Error
}

// GetItemByID returns an item by id, or gorm.ErrRecordNotFound.
func (s *Store) GetItemByID(id string) (*NoteItem, error) {
	var item NoteItem
	err := s.db.First(&item, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// GetItemByOwnerAndDemo returns the first note item for the owner with the given demo_uuid and demo_round, or nil.
func (s *Store) GetItemByOwnerAndDemo(ownerID uint, demoUUID string, demoRound int) (*NoteItem, error) {
	var item NoteItem
	err := s.db.Where("owner_id = ? AND demo_uuid = ? AND demo_round = ?", ownerID, demoUUID, demoRound).First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

// GetItemByDemo returns the first note item with the given demo_uuid and demo_round (any owner), or nil.
func (s *Store) GetItemByDemo(demoUUID string, demoRound int) (*NoteItem, error) {
	var item NoteItem
	err := s.db.Where("demo_uuid = ? AND demo_round = ?", demoUUID, demoRound).First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

// ListItemsByOwner returns all non-deleted items for the given owner ID, sorted by creation time (newest first).
func (s *Store) ListItemsByOwner(ownerID uint) ([]*NoteItem, error) {
	var items []*NoteItem
	err := s.db.Where("owner_id = ?", ownerID).Order("created_at DESC").Find(&items).Error
	return items, err
}

// CountByOwnerID returns the number of non-deleted note items for the owner.
func (s *Store) CountByOwnerID(ownerID uint) (int64, error) {
	var n int64
	err := s.db.Model(&NoteItem{}).Where("owner_id = ?", ownerID).Count(&n).Error
	return n, err
}

// Demo item methods

// CreateDemoItem creates a new demo item
func (s *Store) CreateDemoItem(item *DemoItem) error {
	return s.db.Create(item).Error
}

// GetDemoItemByID returns a demo item by its ID
func (s *Store) GetDemoItemByID(id uint) (*DemoItem, error) {
	var item DemoItem
	err := s.db.Where("id = ?", id).First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

// GetDemoItemsByNoteID returns all demo items for a given note ID
func (s *Store) GetDemoItemsByNoteID(noteID string) ([]*DemoItem, error) {
	var items []*DemoItem
	err := s.db.Where("note_id = ?", noteID).Find(&items).Error
	return items, err
}

// GetDemoItemByDemo returns a demo item by demo UUID and round
func (s *Store) GetDemoItemByDemo(demoUUID string, demoRound int) (*DemoItem, error) {
	var item DemoItem
	err := s.db.Where("demo_uuid = ? AND demo_round = ?", demoUUID, demoRound).First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

// DeleteDemoItem deletes a demo item by ID
func (s *Store) DeleteDemoItem(id uint) error {
	res := s.db.Where("id = ?", id).Delete(&DemoItem{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// DeleteDemoItemsByNoteID deletes all demo items for a given note ID
func (s *Store) DeleteDemoItemsByNoteID(noteID string) error {
	return s.db.Where("note_id = ?", noteID).Delete(&DemoItem{}).Error
}

// UpdateItem updates title, content, permission, demo_meta for an item. Owner must match.
func (s *Store) UpdateItem(id string, ownerID uint, updates map[string]interface{}) error {
	res := s.db.Model(&NoteItem{}).Where("id = ? AND owner_id = ?", id, ownerID).Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// DeleteItem deletes an item by id; ownerID must match.
func (s *Store) DeleteItem(id string, ownerID uint) error {
	res := s.db.Where("id = ? AND owner_id = ?", id, ownerID).Delete(&NoteItem{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
