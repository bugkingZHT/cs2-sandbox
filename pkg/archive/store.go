package archive

import (
	"encoding/json"
	"errors"

	"gorm.io/gorm"
)

// Store provides archive and tree persistence.
type Store struct {
	db *gorm.DB
}

// NewStore returns a new archive store.
func NewStore(db *gorm.DB) *Store {
	return &Store{db: db}
}

// CreateItem creates an archive item.
func (s *Store) CreateItem(item *ArchiveItem) error {
	return s.db.Create(item).Error
}

// GetItemByID returns an item by id, or gorm.ErrRecordNotFound.
func (s *Store) GetItemByID(id string) (*ArchiveItem, error) {
	var item ArchiveItem
	err := s.db.First(&item, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// GetItemByOwnerAndDemo returns the first archive item for the owner with the given demo_uuid and demo_round, or nil.
func (s *Store) GetItemByOwnerAndDemo(ownerID uint, demoUUID string, demoRound int) (*ArchiveItem, error) {
	var item ArchiveItem
	err := s.db.Where("owner_id = ? AND demo_uuid = ? AND demo_round = ?", ownerID, demoUUID, demoRound).First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

// GetItemByDemo returns the first archive item with the given demo_uuid and demo_round (any owner), or nil.
func (s *Store) GetItemByDemo(demoUUID string, demoRound int) (*ArchiveItem, error) {
	var item ArchiveItem
	err := s.db.Where("demo_uuid = ? AND demo_round = ?", demoUUID, demoRound).First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

// ListItemsByOwner returns all non-deleted items for the given owner ID, in arbitrary order.
func (s *Store) ListItemsByOwner(ownerID uint) ([]*ArchiveItem, error) {
	var items []*ArchiveItem
	err := s.db.Where("owner_id = ?", ownerID).Find(&items).Error
	return items, err
}

// UpdateItem updates title, permission, demo_meta for an item. Owner must match.
func (s *Store) UpdateItem(id string, ownerID uint, updates map[string]interface{}) error {
	res := s.db.Model(&ArchiveItem{}).Where("id = ? AND owner_id = ?", id, ownerID).Updates(updates)
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
	res := s.db.Where("id = ? AND owner_id = ?", id, ownerID).Delete(&ArchiveItem{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// GetTree returns the tree for the user, or nil if not found.
func (s *Store) GetTree(userID uint) (*UserArchiveTree, error) {
	var tree UserArchiveTree
	err := s.db.Where("user_id = ?", userID).First(&tree).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &tree, nil
}

// TreeOrder is the JSON shape for user_archive_trees.tree.
type TreeOrder struct {
	Order []string `json:"order"`
}

// GetOrder returns the ordered list of archive item ids for the user.
func (s *Store) GetOrder(userID uint) ([]string, error) {
	tree, err := s.GetTree(userID)
	if err != nil || tree == nil {
		return nil, err
	}
	var t TreeOrder
	if err := json.Unmarshal([]byte(tree.Tree), &t); err != nil {
		return nil, err
	}
	return t.Order, nil
}

// SetOrder saves the order for the user (upsert).
func (s *Store) SetOrder(userID uint, order []string) error {
	body, err := json.Marshal(TreeOrder{Order: order})
	if err != nil {
		return err
	}
	var tree UserArchiveTree
	err = s.db.Where("user_id = ?", userID).First(&tree).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return s.db.Create(&UserArchiveTree{UserID: userID, Tree: string(body)}).Error
	}
	return s.db.Model(&tree).Updates(map[string]interface{}{"tree": string(body)}).Error
}

// AppendToOrder appends an archive id to the user's tree order.
func (s *Store) AppendToOrder(userID uint, archiveID string) error {
	order, _ := s.GetOrder(userID)
	if order == nil {
		order = []string{}
	}
	order = append(order, archiveID)
	return s.SetOrder(userID, order)
}

// RemoveFromOrder removes an id from the user's tree order.
func (s *Store) RemoveFromOrder(userID uint, archiveID string) error {
	order, err := s.GetOrder(userID)
	if err != nil || len(order) == 0 {
		return err
	}
	newOrder := make([]string, 0, len(order))
	for _, id := range order {
		if id != archiveID {
			newOrder = append(newOrder, id)
		}
	}
	return s.SetOrder(userID, newOrder)
}
