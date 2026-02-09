# cs-demobox - Multi-stage build for linux/amd64
# Base 使用 DaoCloud 镜像源，避免 Docker Hub / 阿里云镜像 403
#
# Stage 1: Build WASM and Go server
FROM --platform=linux/amd64 docker.m.daocloud.io/library/golang:1.24-alpine AS go-builder
WORKDIR /build

# Copy go mod and vendor first for better layer cache
COPY go.mod go.sum ./
COPY vendor ./vendor
COPY pkg ./pkg
COPY cmd ./cmd

# Build WASM (output to web/static)
RUN mkdir -p web/static && \
    GOOS=js GOARCH=wasm go build -o web/static/main.wasm ./cmd/wasm
RUN cp $(go env GOROOT)/lib/wasm/wasm_exec.js web/static/

# Build server binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/cs-demobox-server ./cmd/server

# Stage 2: Build frontend (needs web/static from go-builder for emptyOutDir: false)
FROM --platform=linux/amd64 docker.m.daocloud.io/library/node:20-alpine AS frontend-builder
WORKDIR /build

# Copy frontend source (public/pkg/engine/entity/replay.proto already in frontend)
COPY frontend ./frontend

# Get web/static from go-builder (WASM + wasm_exec.js)
COPY --from=go-builder /build/web/static ./web/static

# Install deps (--ignore-scripts 跳过 protoc-gen-js 从 GitHub 下载，vite build 不依赖它) and build
RUN cd frontend && npm ci --ignore-scripts && npm run build

# Stage 3: scratch 无依赖，无网络
FROM --platform=linux/amd64 scratch
COPY --from=go-builder /build/bin/cs-demobox-server /app/cs-demobox-server
COPY --from=frontend-builder /build/web/static /app/web/static
EXPOSE 8080
ENTRYPOINT ["/app/cs-demobox-server"]
