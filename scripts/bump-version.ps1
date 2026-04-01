param(
  [string]$Version
)

$semverPattern = '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot 'package.json'
$cargoTomlPath = Join-Path $repoRoot 'src-tauri\Cargo.toml'
$tauriConfPath = Join-Path $repoRoot 'src-tauri\tauri.conf.json'

if (-not (Test-Path -LiteralPath $packageJsonPath)) { throw "Missing file: $packageJsonPath" }
if (-not (Test-Path -LiteralPath $cargoTomlPath)) { throw "Missing file: $cargoTomlPath" }
if (-not (Test-Path -LiteralPath $tauriConfPath)) { throw "Missing file: $tauriConfPath" }

function Get-PackageVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $packageJson = Get-Content -LiteralPath $Path -Raw
  $match = [regex]::Match($packageJson, '(?m)^\s*"version"\s*:\s*"([^"]+)"')
  if (-not $match.Success) {
    throw "Could not find version field in $Path"
  }

  return $match.Groups[1].Value
}

function Get-NextPatchVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CurrentVersion
  )

  $match = [regex]::Match($CurrentVersion, '^(\d+)\.(\d+)\.(\d+)')
  if (-not $match.Success) {
    throw "Cannot auto-bump non-semver version '$CurrentVersion'. Pass -Version explicitly."
  }

  $major = [int]$match.Groups[1].Value
  $minor = [int]$match.Groups[2].Value
  $patch = [int]$match.Groups[3].Value + 1
  return "$major.$minor.$patch"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  $currentVersion = Get-PackageVersion -Path $packageJsonPath
  $Version = Get-NextPatchVersion -CurrentVersion $currentVersion
  Write-Host "Auto-bumped version: $currentVersion -> $Version" -ForegroundColor Cyan
}

if ($Version -notmatch $semverPattern) {
  throw "Invalid version '$Version'. Expected semver like 1.0.1 or 1.1.0-beta.1"
}

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
