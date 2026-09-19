param(
    [string[]]$Maps = @('de_dust2','de_mirage','de_inferno','de_nuke','de_anubis','de_cache'),
    [string]$VpkDirectory = 'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/maps',
    [switch]$ReuseExports
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
foreach ($Map in $Maps) {
    if ($Map -notin @('de_dust2','de_mirage','de_inferno','de_nuke','de_anubis','de_cache')) { throw "Unsupported map: $Map" }
    if (!(Test-Path -LiteralPath (Join-Path $VpkDirectory "$Map.vpk"))) { throw "Missing VPK: $Map" }
}
$ToolRoot = Join-Path (Get-Location) 'tmp/ancient-source'
New-Item -ItemType Directory -Path $ToolRoot -Force | Out-Null
$Archive = Join-Path $ToolRoot 'vrf-20.0.zip'
if (!(Test-Path -LiteralPath $Archive)) {
    Invoke-WebRequest 'https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/20.0/cli-windows-x64.zip' -OutFile $Archive
}
if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash -ne 'D32AB327B8BBB42A2528866AFB03BB582BDB779D0005488DA32B90292AFD3FF5') { throw 'Source 2 Viewer archive checksum mismatch' }
$Cli = Join-Path $ToolRoot 'vrf-20.0/Source2Viewer-CLI.exe'
if (!(Test-Path -LiteralPath $Cli)) { Expand-Archive -LiteralPath $Archive -DestinationPath (Join-Path $ToolRoot 'vrf-20.0') }
$Optimizer = Join-Path $ToolRoot 'optimizer'
if (!(Test-Path -LiteralPath (Join-Path $Optimizer 'node_modules/meshoptimizer/meshopt_simplifier.module.js'))) {
    New-Item -ItemType Directory -Path $Optimizer -Force | Out-Null
    & pnpm --dir $Optimizer add meshoptimizer@0.25.0
    if ($LASTEXITCODE) { throw 'meshoptimizer installation failed' }
}
$Reuse = if ($ReuseExports) { 'true' } else { 'false' }
& node tools/export-map-cutaways.mjs --maps ($Maps -join ',') --vpkDir $VpkDirectory --reuse $Reuse
if ($LASTEXITCODE) { throw 'Map cutaway export failed' }
Write-Host 'Map assets exported. Runtime builds embed these assets and do not require Steam or Source 2 Viewer.'
