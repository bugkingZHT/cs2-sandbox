.PHONY: all clean build-wasm build-server build-frontend run-server test help proto start start-slow dev-full check docker-build docker-tag docker-run docker-push docker-build-nginx docker-tag-nginx docker-push-nginx

# Variables
BINARY_NAME=cs-demobox-server
WASM_NAME=main.wasm
WASM_EXEC_JS=wasm_exec.js
STATIC_DIR=web/static
FRONTEND_DIR=frontend
GO_VERSION=$(shell go version)
SERVER_PORT=8080
# 慢速网络模拟：300 KB/s（仅限响应体流速）
SLOW_KBPS?=300

# Docker (amd64)，默认推送到阿里云 ACR
DOCKER_IMAGE?=registry.cn-hangzhou.aliyuncs.com/snowbo/demobox
DOCKER_TAG?=latest
DOCKER_IMAGE_NGINX?=registry.cn-hangzhou.aliyuncs.com/snowbo/nginx
DOCKER_TAG_NGINX?=latest
DOCKER_PLATFORM=linux/amd64

# Colors for output
GREEN=\033[0;32m
BLUE=\033[0;34m
YELLOW=\033[1;33m
RED=\033[0;31m
NC=\033[0m # No Color

all: proto clean build-wasm build-frontend build-server ## Build everything (Proto + WASM + Frontend + Server)
	@echo "$(GREEN)✓ All components built successfully!$(NC)"
	@echo "$(BLUE)Run 'make start' to launch the server$(NC)"

help: ## Show this help message
	@echo "$(BLUE)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Quick Start:$(NC)"
	@echo "  1. $(GREEN)make all$(NC)       - Build everything"
	@echo "  2. $(GREEN)make start$(NC)     - Start the server"
	@echo "  3. Open browser at $(BLUE)http://localhost:$(SERVER_PORT)$(NC)"
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  $(GREEN)make dev-full$(NC)   - Run both backend and frontend in dev mode (recommended)"
	@echo "  $(GREEN)make dev$(NC)        - Run backend only in dev mode"
	@echo "  $(GREEN)make frontend-dev$(NC) - Run frontend only in dev mode"
	@echo ""
	@echo "$(YELLOW)Docker (linux/amd64, 仅输出命令，默认镜像 $(DOCKER_IMAGE)):$(NC)"
	@echo "  $(GREEN)make docker-build$(NC)        - 构建 app 镜像 (可加 DOCKER_TAG=v1.0)"
	@echo "  $(GREEN)make docker-build-nginx$(NC)  - 构建 nginx 镜像 (可加 DOCKER_TAG_NGINX=xxx)"
	@echo "  $(GREEN)make docker-tag$(NC)          - 为 app 镜像打额外 tag (可加 DOCKER_TAG_AS=v1.0)"
	@echo "  $(GREEN)make docker-tag-nginx$(NC)    - 为 nginx 镜像打额外 tag (可加 DOCKER_TAG_NGINX_AS=xxx)"
	@echo "  $(GREEN)make docker-run$(NC)          - 运行 app 容器 (端口 $(SERVER_PORT))"
	@echo "  $(GREEN)make docker-push$(NC)        - 推送 app 镜像 (例: DOCKER_TAG=v1.0)"
	@echo "  $(GREEN)make docker-push-nginx$(NC)  - 推送 nginx 镜像 (例: DOCKER_TAG_NGINX=v1.0)"

proto: ## Generate protobuf code
	@echo "$(YELLOW)Generating protobuf code...$(NC)"
	@mkdir -p $(FRONTEND_DIR)/src/proto/pkg/engine/entity
	@mkdir -p $(FRONTEND_DIR)/public/pkg/engine/entity
	PATH=$$PATH:$$(go env GOPATH)/bin protoc --go_out=. --go_opt=paths=source_relative pkg/engine/entity/replay.proto
	@cp pkg/engine/entity/replay.proto $(FRONTEND_DIR)/public/pkg/engine/entity/
	@echo "$(GREEN)✓ Protobuf Go code generated$(NC)"
	@echo "$(GREEN)✓ Proto file copied to frontend/public$(NC)"

build-wasm: proto ## Build WASM binary
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

build-frontend: frontend-install ## Build Vue frontend
	@echo "$(YELLOW)Building Vue frontend...$(NC)"
	cd $(FRONTEND_DIR) && npm run build
	@echo "$(GREEN)✓ Frontend built to $(STATIC_DIR)/$(NC)"

frontend-install: ## Install frontend dependencies
	@echo "$(YELLOW)Installing frontend dependencies...$(NC)"
	cd $(FRONTEND_DIR) && npm install

frontend-dev: ## Run frontend in development mode
	@echo "$(BLUE)Starting frontend dev server...$(NC)"
	cd $(FRONTEND_DIR) && npm run dev

dev: build-wasm-dev ## Run everything in development mode
	@echo "$(BLUE)Starting development environment...$(NC)"
	@echo "$(YELLOW)Note: This runs the Go server. You should run 'make frontend-dev' in another terminal for HMR.$(NC)"
	go run ./cmd/server

run-server: build-server ## Build and run the server
	@echo "$(BLUE)Starting server...$(NC)"
	./bin/$(BINARY_NAME)

start: run-server ## Alias for run-server (Quick start after build)

start-slow: build-server ## Start server with 0.5M bandwidth limit (SERVER_SLOW_KBPS=62, override with SLOW_KBPS=N)
	@echo "$(BLUE)Starting server with slow network (0.5M ≈ $(SLOW_KBPS) KB/s)...$(NC)"
	SERVER_SLOW_KBPS=$(SLOW_KBPS) ./bin/$(BINARY_NAME)

run-dev: ## Run server for development (without rebuilding)
	@echo "$(BLUE)Starting server in development mode...$(NC)"
	go run ./cmd/server

dev-full: build-wasm-dev ## Run full development environment (backend + frontend)
	@echo "$(BLUE)Starting full development environment...$(NC)"
	@echo "$(YELLOW)Backend will run on http://localhost:$(SERVER_PORT)$(NC)"
	@echo "$(YELLOW)Frontend will run on http://localhost:5173$(NC)"
	@echo "$(YELLOW)Starting backend server...$(NC)"
	@bash -c 'trap "kill 0" EXIT; go run ./cmd/server & cd $(FRONTEND_DIR) && npm run dev'

check: ## Check if all tools are installed
	@echo "$(YELLOW)Checking environment...$(NC)"
	@which go > /dev/null || (echo "$(RED)✗ Go not found$(NC)" && exit 1)
	@echo "$(GREEN)✓ Go $(GO_VERSION)$(NC)"
	@which npm > /dev/null || (echo "$(RED)✗ npm not found$(NC)" && exit 1)
	@echo "$(GREEN)✓ npm $$(npm --version)$(NC)"
	@which protoc > /dev/null || (echo "$(RED)✗ protoc not found$(NC)" && exit 1)
	@echo "$(GREEN)✓ protoc $$(protoc --version)$(NC)"
	@which make > /dev/null || (echo "$(RED)✗ make not found$(NC)" && exit 1)
	@echo "$(GREEN)✓ make $$(make --version | head -n1)$(NC)"
	@echo "$(GREEN)✓ Environment ready!$(NC)"

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

# --- Docker (amd64)，默认推送到 registry.cn-hangzhou.aliyuncs.com/snowbo/* ---
docker-build: ## 构建 app 镜像（可加 DOCKER_TAG=v1.0）
	docker buildx build --platform $(DOCKER_PLATFORM) -f build/app/Dockerfile -t $(DOCKER_IMAGE):$(DOCKER_TAG) --load .

docker-build-nginx: ## 构建 nginx 镜像（可加 DOCKER_TAG_NGINX=xxx）
	docker buildx build --platform $(DOCKER_PLATFORM) -f build/nginx/Dockerfile -t $(DOCKER_IMAGE_NGINX):$(DOCKER_TAG_NGINX) --load .

DOCKER_TAG_AS ?= $(DOCKER_TAG)
docker-tag: ## 为 app 镜像打额外 tag（例: make docker-tag DOCKER_TAG_AS=v1.0）
	docker tag $(DOCKER_IMAGE):$(DOCKER_TAG) $(DOCKER_IMAGE):$(DOCKER_TAG_AS)

DOCKER_TAG_NGINX_AS ?= $(DOCKER_TAG_NGINX)
docker-tag-nginx: ## 为 nginx 镜像打额外 tag（例: make docker-tag-nginx DOCKER_TAG_NGINX_AS=v1.0）
	docker tag $(DOCKER_IMAGE_NGINX):$(DOCKER_TAG_NGINX) $(DOCKER_IMAGE_NGINX):$(DOCKER_TAG_NGINX_AS)

docker-push: ## 推送 app 镜像（例: make docker-push DOCKER_TAG=v1.0）
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG)

docker-push-nginx: ## 推送 nginx 镜像（例: make docker-push-nginx DOCKER_TAG_NGINX=v1.0）
	docker push $(DOCKER_IMAGE_NGINX):$(DOCKER_TAG_NGINX)

docker-run: ## 运行 app 容器（端口 $(SERVER_PORT)）
	docker run --rm -p $(SERVER_PORT):8080 $(DOCKER_IMAGE):$(DOCKER_TAG)
