.PHONY: all build-local frontend test
all: build-local
frontend:
	cd frontend && pnpm install --frozen-lockfile && pnpm build
build-local: frontend
	go build -mod=vendor -trimpath -ldflags="-s -w -H windowsgui" -o bin/cs2-sandbox.exe ./cmd/local
test:
	go test -mod=vendor ./pkg/localapp
