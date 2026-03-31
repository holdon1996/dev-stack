param(
  [string]$KeyPath = "$HOME\.tauri\devstack.key",
  [string]$PubKeyPath = "$HOME\.tauri\devstack.key.pub",
  [string]$Password,
  [string]$Endpoint = "https://github.com/holdon1996/dev-stack/releases/latest/download/latest.json"
)

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "Private key not found: $KeyPath"
}

if (-not (Test-Path -LiteralPath $PubKeyPath)) {
  throw "Public key not found: $PubKeyPath"
}

if ([string]::IsNullOrWhiteSpace($Password)) {
  $secure = Read-Host "Enter updater key password" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$env:TAURI_SIGNING_PRIVATE_KEY = $KeyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $Password
$env:TAURI_UPDATER_PUBKEY = Get-Content -LiteralPath $PubKeyPath -Raw
$env:TAURI_UPDATER_ENDPOINT = $Endpoint

Write-Host "Updater build environment is ready for this PowerShell session." -ForegroundColor Green
Write-Host "TAURI_SIGNING_PRIVATE_KEY=$env:TAURI_SIGNING_PRIVATE_KEY"
Write-Host "TAURI_UPDATER_ENDPOINT=$env:TAURI_UPDATER_ENDPOINT"
