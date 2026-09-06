param([switch]$SkipInstall, [string]$OutputPath = 'bin/cs2-sandbox.exe')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$taskGo = (Get-Command go -ErrorAction SilentlyContinue).Source
if (!$taskGo -and (Test-Path 'C:\Program Files\Go\bin\go.exe')) { $taskGo='C:\Program Files\Go\bin\go.exe' }
if (!$taskGo) { throw 'Go 1.24+ is required.' }
Push-Location frontend
try {
 if (!$SkipInstall) { pnpm install --frozen-lockfile; if ($LASTEXITCODE) { throw 'Dependency installation failed.' } }
 node test-local-data.mjs
 if ($LASTEXITCODE) { throw 'Local frontend adapter tests failed.' }
 node node_modules/vite/bin/vite.js build --config vite.local.config.ts
 if ($LASTEXITCODE) { throw 'Frontend build failed.' }
} finally { Pop-Location }
& $taskGo test -mod=vendor ./pkg/localapp ./cmd/local
if ($LASTEXITCODE) { throw 'Local backend tests failed.' }
& $taskGo build -mod=vendor -trimpath -ldflags='-s -w -H windowsgui' -o $OutputPath ./cmd/local
if ($LASTEXITCODE) { throw 'EXE build failed.' }
Write-Host "Built $OutputPath (all frontend assets embedded)."
