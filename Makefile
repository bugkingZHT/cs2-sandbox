.PHONY: all clean build-wasm build-server build-frontend run-server test help

# Variables
BINARY_NAME=cs-demobox-server
WASM_NAME=main.wasm
WASM_EXEC_JS=wasm_exec.js
STATIC_DIR=web/static
FRONTEND_DIR=frontend
GO_VERSION=$(shell go version)

# Colors for output
GREEN=\033[0;32m
BLUE=\033[0;34m
YELLOW=\033[1;33m
NC=\033[0m # No Color

all: clean build-wasm build-frontend build-server ## Build everything (WASM + Frontend + Server)

help: ## Show this help message
	@echo "$(BLUE)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

build-wasm: ## Build WASM binary
	@echo "$(YELLOW)Building WASM...$(NC)"
	GOOS=js GOARCH=wasm go build -o $(STATIC_DIR)/$(WASM_NAME) ./cmd/wasm
	@echo "$(GREEN)✓ WASM built: $(STATIC_DIR)/$(WASM_NAME)$(NC)"
	@echo "$(YELLOW)Copying wasm_exec.js...$(NC)"
	@cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" $(STATIC_DIR)/$(WASM_EXEC_JS)
	@echo "$(GREEN)✓ wasm_exec.js copied to $(STATIC_DIR)/$(NC)"

build-server: ## Build server binary
	@echo "$(YELLOW)Building server...$(NC)"
	go build -o bin/$(BINARY_NAME) ./cmd/server
	@echo "$(GREEN)✓ Server built: bin/$(BINARY_NAME)$(NC)"

build-frontend: ## Build Vue frontend
	@echo "$(YELLOW)Building Vue frontend...$(NC)"
	cd $(FRONTEND_DIR) && npm install && npm run build
	@echo "$(GREEN)✓ Frontend built to $(STATIC_DIR)/$(NC)"

run-server: build-server ## Build and run the server
	@echo "$(BLUE)Starting server...$(NC)"
	./bin/$(BINARY_NAME)

run-dev: ## Run server for development (without rebuilding)
	@echo "$(BLUE)Starting server in development mode...$(NC)"
	go run ./cmd/server

build-wasm-dev: ## Build WASM in development mode (unoptimized)
	@echo "$(YELLOW)Building WASM (development mode)...$(NC)"
	GOOS=js GOARCH=wasm go build -o $(STATIC_DIR)/$(WASM_NAME) ./cmd/wasm
	@cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" $(STATIC_DIR)/$(WASM_EXEC_JS)
	@echo "$(GREEN)✓ WASM built (dev mode)$(NC)"

clean: ## Clean build artifacts
	@echo "$(YELLOW)Cleaning...$(NC)"
	rm -f bin/$(BINARY_NAME)
	rm -f $(STATIC_DIR)/$(WASM_NAME)
	@echo "$(GREEN)✓ Clean complete$(NC)"

test: ## Run tests
	@echo "$(YELLOW)Running tests...$(NC)"
	go test -v ./...

fmt: ## Format code
	@echo "$(YELLOW)Formatting code...$(NC)"
	go fmt ./...
	@echo "$(GREEN)✓ Code formatted$(NC)"

vet: ## Run go vet
	@echo "$(YELLOW)Running go vet...$(NC)"
	go vet ./...
	@echo "$(GREEN)✓ Vet complete$(NC)"

tidy: ## Tidy go modules
	@echo "$(YELLOW)Tidying go modules...$(NC)"
	go mod tidy
	@echo "$(GREEN)✓ Modules tidied$(NC)"

vendor: ## Update vendor directory
	@echo "$(YELLOW)Updating vendor directory...$(NC)"
	go mod vendor
	@echo "$(GREEN)✓ Vendor updated$(NC)"

info: ## Show build information
	@echo "$(BLUE)Build Information:$(NC)"
	@echo "  Go Version: $(GO_VERSION)"
	@echo "  Binary Name: $(BINARY_NAME)"
	@echo "  WASM Output: $(STATIC_DIR)/$(WASM_NAME)"
	@echo "  Static Dir: $(STATIC_DIR)"
