$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot 'dist'
$packageJson = Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $packageJson.version

$assets = @(
  Get-ChildItem -LiteralPath $distRoot `
    -Filter ("Moli-Linux-{0}-win-x64-Setup.exe" -f $version) `
    -File
  Get-ChildItem -LiteralPath $distRoot `
    -Filter ("Moli-Linux-{0}-win-x64-payload.7z.*" -f $version) `
    -File |
    Where-Object { $_.Name -match '\.7z\.\d{3}$' }
  Get-ChildItem -LiteralPath $distRoot `
    -Filter ("Moli-Linux-{0}-mac-*.dmg" -f $version) `
    -File
  Get-ChildItem -LiteralPath $distRoot `
    -Filter ("Moli-Linux-{0}-source.zip" -f $version) `
    -File
)

if ($assets.Count -lt 5) {
  throw "Expected the Windows package, payload volumes, both macOS DMGs, and source bundle."
}

$githubLimit = 2GB
foreach ($asset in $assets) {
  if ($asset.Length -le 0) {
    throw "Release asset is empty: $($asset.Name)"
  }
  if ($asset.Length -ge $githubLimit) {
    throw "Release asset is not below GitHub's 2 GiB per-file limit: $($asset.Name)"
  }
}

$lines = foreach ($asset in ($assets | Sort-Object Name)) {
  $hash = (Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $($asset.Name)"
}

$checksumFile = Join-Path $distRoot 'SHA256SUMS.txt'
Set-Content -LiteralPath $checksumFile -Value $lines -Encoding ascii
Write-Output "Checksums: $checksumFile"
$assets | Sort-Object Name | Select-Object Name, Length
