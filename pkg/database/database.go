package database

import (
	"fmt"
	"os"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

const DefaultDBName = "demobox"

// Config holds DB connection settings from environment.
type Config struct {
	URL    string // SNOWBO_DB_URL (host)
	Port   string // SNOWBO_DB_PORT
	User   string // SNOWBO_DB_USER
	Passwd string // SNOWBO_DB_PASSWD
	Name   string // SNOWBO_DB_NAME (database name, default "demobox")
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

// IsConfigured returns true if enough env vars are set to connect.
func (c Config) IsConfigured() bool {
	return c.URL != "" && c.User != "" && c.Passwd != ""
}

// MissingEnv returns a list of required env var names that are not set.
func (c Config) MissingEnv() []string {
	var missing []string
	if c.URL == "" {
		missing = append(missing, "SNOWBO_DB_URL")
	}
	if c.User == "" {
		missing = append(missing, "SNOWBO_DB_USER")
	}
	if c.Passwd == "" {
		missing = append(missing, "SNOWBO_DB_PASSWD")
	}
	return missing
}

// ConfigFromEnv reads config from environment.
func ConfigFromEnv() Config {
	return Config{
		URL:    os.Getenv("SNOWBO_DB_URL"),
		Port:   envOrDefault("SNOWBO_DB_PORT", "3306"),
		User:   os.Getenv("SNOWBO_DB_USER"),
		Passwd: os.Getenv("SNOWBO_DB_PASSWD"),
		Name:   envOrDefault("SNOWBO_DB_NAME", DefaultDBName),
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Open opens a MySQL connection using the given config.
func Open(cfg Config) (*gorm.DB, error) {
	if !cfg.IsConfigured() {
		return nil, fmt.Errorf("database: missing required env (SNOWBO_DB_URL, SNOWBO_DB_USER, SNOWBO_DB_PASSWD)")
	}
	return gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{})
}
