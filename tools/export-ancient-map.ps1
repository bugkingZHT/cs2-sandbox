param(
    [ValidateSet('nav', 'collision')][string]$Mode,
    [string]$Vpk = 'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/maps/de_ancient.vpk',
    [string]$Nav = (Join-Path $env:USERPROFILE 'Desktop/de_ancient.nav'),
    [string]$WorkDirectory = (Join-Path $PSScriptRoot '../tmp/ancient-source'),
    [string]$Output = (Join-Path $PSScriptRoot '../frontend/public/map/3d/de_ancient.json')
)

$ErrorActionPreference = 'Stop'
if (!$Mode) { throw 'The shipped map is the restored original cutaway. Select -Mode nav or -Mode collision explicitly to replace it with an experimental reconstruction.' }
$SourceFiles = if ($Mode -eq 'collision') { @($Vpk, $Nav) } else { @($Nav) }
foreach ($SourceFile in $SourceFiles) {
    if (-not (Test-Path -LiteralPath $SourceFile -PathType Leaf)) { throw "Source file not found: $SourceFile" }
}
$Node = (Get-Command node -ErrorAction Stop).Source
$WorkDirectory = [IO.Path]::GetFullPath($WorkDirectory)
New-Item -ItemType Directory -Path $WorkDirectory -Force | Out-Null

# Pinned upstream release, downloaded only for the offline conversion step.
$Archive = Join-Path $WorkDirectory 'vrf-20.0.zip'
$ArchiveSha256 = 'D32AB327B8BBB42A2528866AFB03BB582BDB779D0005488DA32B90292AFD3FF5'
if (-not (Test-Path -LiteralPath $Archive)) {
    Invoke-WebRequest 'https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/20.0/cli-windows-x64.zip' -OutFile $Archive
}
if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash -ne $ArchiveSha256) {
    throw "Unexpected Source 2 Viewer archive SHA-256. Check the download: $Archive"
}
$ToolDirectory = Join-Path $WorkDirectory 'vrf-20.0'
$Cli = Join-Path $ToolDirectory 'Source2Viewer-CLI.exe'
if (-not (Test-Path -LiteralPath $Cli)) { Expand-Archive -LiteralPath $Archive -DestinationPath $ToolDirectory }

$OptimizerDirectory = Join-Path $WorkDirectory 'optimizer'
$Meshopt = Join-Path $OptimizerDirectory 'node_modules/meshoptimizer/meshopt_simplifier.module.js'
$Earcut = Join-Path $OptimizerDirectory 'node_modules/earcut/src/earcut.js'
$Clipping = Join-Path $OptimizerDirectory 'node_modules/polygon-clipping/dist/polygon-clipping.cjs.js'
if (-not (Test-Path -LiteralPath $Meshopt) -or -not (Test-Path -LiteralPath $Earcut) -or -not (Test-Path -LiteralPath $Clipping)) {
    New-Item -ItemType Directory -Path $OptimizerDirectory -Force | Out-Null
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        & pnpm --dir $OptimizerDirectory add meshoptimizer@0.25.0 earcut@3.0.2 polygon-clipping@0.15.7
    } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        & npm install --prefix $OptimizerDirectory meshoptimizer@0.25.0 earcut@3.0.2 polygon-clipping@0.15.7 --no-audit --no-fund
    } else { throw 'Install pnpm or npm to obtain the build-time meshoptimizer dependency.' }
    if ($LASTEXITCODE -ne 0) { throw 'Geometry build dependency installation failed' }
}
if ($Mode -eq 'nav') {
    & $Node (Join-Path $PSScriptRoot 'export-nav-map.mjs') --cli $Cli --nav $Nav --work $WorkDirectory --earcut $Earcut --clipping $Clipping --out $Output
} else {
    & $Node (Join-Path $PSScriptRoot 'export-ancient-map.mjs') --cli $Cli --vpk $Vpk --nav $Nav --work $WorkDirectory --meshopt $Meshopt --earcut $Earcut --clipping $Clipping --out $Output
}
if ($LASTEXITCODE -ne 0) { throw 'Ancient conversion failed' }
$Checker = if ($Mode -eq 'nav') { 'check-nav-map.mjs' } else { 'check-ancient-map.mjs' }
& $Node (Join-Path $PSScriptRoot $Checker) $Output
if ($LASTEXITCODE -ne 0) { throw 'Ancient geometry validation failed' }
