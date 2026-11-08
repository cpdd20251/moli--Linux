$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot 'dist'
$packageJson = Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $packageJson.version
$output = Join-Path $distRoot ("Moli-Linux-{0}-source.zip" -f $version)

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
  throw 'The source bundle requires a Git repository with at least one commit.'
}

$commit = (& git -C $projectRoot rev-parse --verify HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $commit) {
  throw 'Create the initial Git commit before building the source bundle.'
}

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
if (Test-Path -LiteralPath $output) {
  Remove-Item -LiteralPath $output -Force
}

& git -C $projectRoot archive `
  --format=zip `
  --prefix="moli-linux-$version/" `
  --output=$output `
  HEAD
if ($LASTEXITCODE -ne 0) {
  throw "git archive failed with exit code $LASTEXITCODE"
}

$file = Get-Item -LiteralPath $output
Write-Output ("Source bundle: {0} ({1:N2} MiB)" -f $file.FullName, ($file.Length / 1MB))
