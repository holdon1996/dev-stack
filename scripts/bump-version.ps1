param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$semverPattern = '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
if ($Version -notmatch $semverPattern) {
  throw "Invalid version '$Version'. Expected semver like 1.0.1 or 1.1.0-beta.1"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot 'package.json'
$cargoTomlPath = Join-Path $repoRoot 'src-tauri\Cargo.toml'
$tauriConfPath = Join-Path $repoRoot 'src-tauri\tauri.conf.json'

if (-not (Test-Path -LiteralPath $packageJsonPath)) { throw "Missing file: $packageJsonPath" }
if (-not (Test-Path -LiteralPath $cargoTomlPath)) { throw "Missing file: $cargoTomlPath" }
if (-not (Test-Path -LiteralPath $tauriConfPath)) { throw "Missing file: $tauriConfPath" }

$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$packageJson.version = $Version
$packageJsonJson = $packageJson | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($packageJsonPath, $packageJsonJson, [System.Text.UTF8Encoding]::new($false))

$cargoToml = Get-Content -LiteralPath $cargoTomlPath -Raw
$cargoToml = [regex]::Replace($cargoToml, '(?m)^version\s*=\s*"[^"]+"$', "version = `"$Version`"", 1)
[System.IO.File]::WriteAllText($cargoTomlPath, $cargoToml, [System.Text.UTF8Encoding]::new($false))

$tauriConf = Get-Content -LiteralPath $tauriConfPath -Raw | ConvertFrom-Json
$tauriConf.version = $Version
$tauriConfJson = $tauriConf | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($tauriConfPath, $tauriConfJson, [System.Text.UTF8Encoding]::new($false))

Write-Host "Updated version to $Version in:" -ForegroundColor Green
Write-Host "- $packageJsonPath"
Write-Host "- $cargoTomlPath"
Write-Host "- $tauriConfPath"
