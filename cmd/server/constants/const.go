package constants

// Environment variable keys used by the server. All env keys are centralized here.

// --- Server / static ---
// SNOWBO_STATIC_PATH: Fallback absolute path for static file root when web/static is not found relative to binary; empty means no fallback.
const EnvSnowboStaticPath = "SNOWBO_STATIC_PATH"

// --- Rate limit & slow network (optional) ---
// SERVER_RATE_LIMIT_RPS: Max requests per second per IP; 0 = disabled.
const EnvServerRateLimitRPS = "SERVER_RATE_LIMIT_RPS"

// SERVER_SLOW_DELAY_MS: Extra delay in ms before each response; 0 = disabled.
const EnvServerSlowDelayMs = "SERVER_SLOW_DELAY_MS"

// SERVER_SLOW_KBPS: Response body throttle in KB/s; 0 = disabled.
const EnvServerSlowKbps = "SERVER_SLOW_KBPS"

// --- Storage ---
// SNOWBO_STORAGE_ROOTPATH: Root directory for archive and file storage.
const EnvSnowboStorageRootPath = "SNOWBO_STORAGE_ROOTPATH"

// --- Database ---
// SNOWBO_DB_URL: Database connection URL (e.g. host:port or DSN).
const EnvSnowboDBURL = "SNOWBO_DB_URL"

// SNOWBO_DB_PORT: Database port (default 3306).
const EnvSnowboDBPort = "SNOWBO_DB_PORT"

// SNOWBO_DB_USER: Database user.
const EnvSnowboDBUser = "SNOWBO_DB_USER"

// SNOWBO_DB_PASSWD: Database password.
const EnvSnowboDBPasswd = "SNOWBO_DB_PASSWD"

// SNOWBO_DB_NAME: Database name.
const EnvSnowboDBName = "SNOWBO_DB_NAME"
