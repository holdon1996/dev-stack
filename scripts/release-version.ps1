param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$Branch = "main",
  [string]$Remote = "origin",
  [switch]$StageAll
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$allowedVersionFiles = @(
  'package.json',
  'src-tauri/Cargo.toml',
  'src-tauri/tauri.conf.json'
)

function Get-GitChanges {
  $lines = git status --porcelain=v1
  if (-not $lines) { return @() }
  return @($lines | ForEach-Object {
    if ($_.Length -ge 4) { $_.Substring(3) } else { $_ }
  })
}

& (Join-Path $PSScriptRoot 'bump-version.ps1') -Version $Version

$changes = Get-GitChanges
$extraChanges = @($changes | Where-Object { $_ -notin $allowedVersionFiles })

if (-not $StageAll -and $extraChanges.Count -gt 0) {
  Write-Host "Found additional changed files:" -ForegroundColor Yellow
  $extraChanges | ForEach-Object { Write-Host "- $_" }
  throw "Refusing to create a release commit with unrelated changes. Commit them first or rerun with -StageAll."
}

if ($StageAll) {
  git add -A
} else {
  git add -- $allowedVersionFiles
}

$tag = "v$Version"
$existingLocalTag = git tag --list $tag
if ($existingLocalTag) {
  throw "Tag $tag already exists locally."
}

$remoteTagCheck = git ls-remote --tags $Remote $tag
if ($remoteTagCheck) {
  throw "Tag $tag already exists on $Remote."
}

git commit -m "release: $tag"
git push $Remote $Branch
git tag $tag
git push $Remote $tag

Write-Host "Release flow completed for $tag" -ForegroundColor Green
Write-Host "Branch pushed: $Remote/$Branch"
Write-Host "Tag pushed: $tag"
