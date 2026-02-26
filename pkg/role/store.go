package role

import (
	"time"

	"gorm.io/gorm"
)

// Store provides role and subscription persistence.
type Store struct {
	db *gorm.DB
}

// NewStore returns a new role store.
func NewStore(db *gorm.DB) *Store {
	return &Store{db: db}
}

// DefaultRoles are the three built-in roles to ensure exist in the DB.
var DefaultRoles = []struct {
	Name       string
	Priority   int
	QuotaLimit int
}{
	{RoleNormal, DefaultRolePriority[RoleNormal], DefaultRoleQuotaLimit[RoleNormal]},
	{RolePro, DefaultRolePriority[RolePro], DefaultRoleQuotaLimit[RolePro]},
	{RoleProPlus, DefaultRolePriority[RoleProPlus], DefaultRoleQuotaLimit[RoleProPlus]},
}

// EnsureDefaultRoles inserts normal, pro, pro+ into the roles table if missing (idempotent on every startup).
func (s *Store) EnsureDefaultRoles() error {
	for _, r := range DefaultRoles {
		var count int64
		err := s.db.Model(&Role{}).Where("name = ?", r.Name).Count(&count).Error
		if err != nil {
			return err
		}
		if count == 0 {
			if err := s.db.Create(&Role{Name: r.Name, Priority: r.Priority, QuotaLimit: r.QuotaLimit}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// GetEffectiveRole returns the effective role name, priority, and quota limit for the user (by UID).
// Queries valid subscriptions (is_active=true, ends_at >= now), takes highest priority;
// if none, returns normal role from database (or fallback values if DB unavailable).
func (s *Store) GetEffectiveRole(userUID string) (roleName string, priority int, quotaLimit int) {
	var subs []Subscription
	now := time.Now()
	err := s.db.Where("user_uid = ? AND is_active = ? AND ends_at >= ?", userUID, true, now).
		Order("ends_at DESC").
		Find(&subs).Error
	if err != nil || len(subs) == 0 {
		// No active subscriptions, get default role from database
		return s.getDefaultRole()
	}
	bestRole := RoleNormal
	bestPriority := DefaultRolePriority[RoleNormal]
	for _, sub := range subs {
		p := DefaultRolePriority[sub.Role]
		if p > bestPriority {
			bestPriority = p
			bestRole = sub.Role
		}
	}

	// Get quota limit from roles table
	var role Role
	if err := s.db.Where("name = ?", bestRole).First(&role).Error; err != nil {
		// Fallback to hardcoded values if role not found in DB
		return bestRole, bestPriority, DefaultRoleQuotaLimit[bestRole]
	}
	return bestRole, role.Priority, role.QuotaLimit
}

// getDefaultRole returns the default role from database, or fallback values if DB unavailable
func (s *Store) getDefaultRole() (roleName string, priority int, quotaLimit int) {
	var role Role
	if err := s.db.Where("name = ?", RoleNormal).First(&role).Error; err != nil {
		// Fallback to hardcoded values if DB unavailable
		return RoleNormal, DefaultRolePriority[RoleNormal], DefaultRoleQuotaLimit[RoleNormal]
	}
	return role.Name, role.Priority, role.QuotaLimit
}

// CreateSubscription creates a subscription record (pro/pro+). OrderID must be unique.
func (s *Store) CreateSubscription(orderID string, userUID string, role string, startedAt, endsAt time.Time) error {
	sub := &Subscription{
		OrderID:   orderID,
		UserUID:   userUID,
		Role:      role,
		StartedAt: startedAt,
		EndsAt:    endsAt,
		IsActive:  true,
	}
	return s.db.Create(sub).Error
}
