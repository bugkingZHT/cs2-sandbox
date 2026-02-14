package database

import (
	"fmt"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

const DefaultDBName = "demobox"

// Config holds DB connection settings (populated by the caller, e.g. from env in cmd/server).
type Config struct {
	URL    string // host
	Port   string // default 3306
	User   string
	Passwd string
	Name   string // database name, default DefaultDBName
}

// DSN returns a MySQL DSN string.
func (c Config) DSN() string {
	dbName := c.Name
	if dbName == "" {
		dbName = DefaultDBName
	}
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True",
		c.User, c.Passwd, c.URL, c.Port, dbName)
}

// IsConfigured returns true if required fields are set to connect.
func (c Config) IsConfigured() bool {
	return c.URL != "" && c.User != "" && c.Passwd != ""
}

// Open opens a MySQL connection using the given config.
func Open(cfg Config) (*gorm.DB, error) {
	if !cfg.IsConfigured() {
		return nil, fmt.Errorf("database: config missing required fields (URL, User, Passwd)")
	}
	return gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{})
}
