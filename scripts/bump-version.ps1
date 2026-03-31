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

$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw
$packageJsonRegex = [regex]'(?m)^(\s*"version"\s*:\s*")[^"]+(")'
$packageJson = $packageJsonRegex.Replace(
  $packageJson,
  {
    param($match)
    $match.Groups[1].Value + $Version + $match.Groups[2].Value
  },
  1
)
[System.IO.File]::WriteAllText($packageJsonPath, $packageJson, [System.Text.UTF8Encoding]::new($false))

$cargoToml = Get-Content -LiteralPath $cargoTomlPath -Raw
$cargoToml = [regex]::Replace($cargoToml, '(?m)^version\s*=\s*"[^"]+"$', "version = `"$Version`"", 1)
[System.IO.File]::WriteAllText($cargoTomlPath, $cargoToml, [System.Text.UTF8Encoding]::new($false))

$tauriConf = Get-Content -LiteralPath $tauriConfPath -Raw
$tauriConfRegex = [regex]'(?m)^(\s*"version"\s*:\s*")[^"]+(")'
$tauriConf = $tauriConfRegex.Replace(
  $tauriConf,
  {
    param($match)
    $match.Groups[1].Value + $Version + $match.Groups[2].Value
  },
  1
)
[System.IO.File]::WriteAllText($tauriConfPath, $tauriConf, [System.Text.UTF8Encoding]::new($false))

Write-Host "Updated version to $Version in:" -ForegroundColor Green
Write-Host "- $packageJsonPath"
Write-Host "- $cargoTomlPath"
Write-Host "- $tauriConfPath"
