param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
  [string]$Repository
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectRoot 'resources\release-config.json'
$config = [ordered]@{
  releaseBaseUrl = "https://github.com/$Repository/releases/latest/download/"
  downloadVmAssets = $true
}
$json = $config | ConvertTo-Json
[System.IO.File]::WriteAllText(
  $configPath,
  $json,
  (New-Object System.Text.UTF8Encoding($false))
)
Write-Output "Release repository: $Repository"
Write-Output "Runtime base URL: $($config.releaseBaseUrl)"
