param(
  [ValidateSet('arm64', 'x64')]
  [string]$Arch = 'arm64'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $projectRoot)
$buildRoot = Join-Path $workspaceRoot 'work\moli-linux-build\mac-app-build'
$electronRoot = Join-Path $workspaceRoot 'work\moli-linux-build\electron-mac'
$electronApp = Join-Path $electronRoot "$Arch\Electron.app"
$electronZip = Join-Path $electronRoot "electron-$Arch.zip"
$packageJson = Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $packageJson.version
$archRoot = Join-Path $buildRoot $Arch
$app = Join-Path $archRoot 'Moli Linux.app'
$linksManifest = Join-Path $archRoot 'electron-links.json'
$executablesManifest = Join-Path $archRoot 'electron-executables.json'

function Resolve-Python {
  $candidates = @()
  if ($env:MOLI_PYTHON) {
    $candidates += @{ Command = $env:MOLI_PYTHON; Prefix = @() }
  }
  foreach ($name in @('python3', 'python')) {
    $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($command) {
      $candidates += @{ Command = $command.Source; Prefix = @() }
    }
  }
  $pyLauncher = Get-Command py -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($pyLauncher) {
    $candidates += @{ Command = $pyLauncher.Source; Prefix = @('-3') }
  }

  foreach ($candidate in $candidates) {
    $probe = @($candidate.Prefix) + @(
      '-c',
      'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'
    )
    $probeExit = 1
    try {
      & $candidate.Command @probe 1>$null 2>$null
      $probeExit = $LASTEXITCODE
    } catch {
      $probeExit = 1
    }
    if ($probeExit -eq 0) {
      $script:PythonCommand = $candidate.Command
      $script:PythonPrefix = @($candidate.Prefix)
      Write-Output "Using Python: $($script:PythonCommand) $($script:PythonPrefix -join ' ')"
      return
    }
  }
  throw 'Python 3.10 or newer was not found. Set MOLI_PYTHON to a Python executable if needed.'
}

function Invoke-Python([string[]]$Arguments) {
  $allArguments = @($script:PythonPrefix) + $Arguments
  & $script:PythonCommand @allArguments
}

function Assert-UnderBuildRoot([string]$Path) {
  $root = [System.IO.Path]::GetFullPath($buildRoot).TrimEnd('\') + '\'
  $resolved = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolved.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside the mac build root: $resolved"
  }
}

Resolve-Python

if (-not (Test-Path -LiteralPath $electronApp) -and (Test-Path -LiteralPath $electronZip)) {
  Invoke-Python -Arguments @(
    (Join-Path $PSScriptRoot 'extract-mac-electron.py'),
    $electronZip,
    (Split-Path -Parent $electronApp)
  )
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to extract the Electron macOS application.'
  }
}

foreach ($required in @($electronApp, $electronZip)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required Electron input is missing: $required"
  }
}

Assert-UnderBuildRoot $archRoot
if (Test-Path -LiteralPath $archRoot) {
  Remove-Item -LiteralPath $archRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $archRoot -Force | Out-Null
Copy-Item -LiteralPath $electronApp -Destination $app -Recurse -Force

Invoke-Python -Arguments @(
  (Join-Path $PSScriptRoot 'prepare-mac-electron.py'),
  $electronZip,
  $app,
  $linksManifest,
  $executablesManifest
)
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to normalize the Electron app tree.'
}

$resources = Join-Path $app 'Contents\Resources'
$macos = Join-Path $app 'Contents\MacOS'
$defaultAsar = Join-Path $resources 'default_app.asar'
if (Test-Path -LiteralPath $defaultAsar) {
  [System.IO.File]::Delete($defaultAsar)
}

Move-Item -LiteralPath (Join-Path $macos 'Electron') `
  -Destination (Join-Path $macos 'Moli Linux')

Get-ChildItem -LiteralPath (Join-Path $app 'Contents\Frameworks') `
  -Directory -Filter 'Electron Helper*.app' |
  ForEach-Object {
    $suffix = $_.Name.Substring('Electron Helper'.Length)
    $helperName = 'Moli Linux Helper' + $suffix
    $helperDestination = Join-Path $_.Parent.FullName $helperName
    Move-Item -LiteralPath $_.FullName -Destination $helperDestination

    $helperMacos = Join-Path $helperDestination 'Contents\MacOS'
    $oldExecutable = Join-Path $helperMacos ('Electron Helper' + $suffix.Replace('.app', ''))
    $newExecutable = Join-Path $helperMacos ('Moli Linux Helper' + $suffix.Replace('.app', ''))
    Move-Item -LiteralPath $oldExecutable -Destination $newExecutable
  }

Invoke-Python -Arguments @(
  (Join-Path $PSScriptRoot 'prepare-mac-electron.py'),
  $electronZip,
  $app,
  $linksManifest,
  $executablesManifest
)
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to refresh the Electron file manifest.'
}

Invoke-Python -Arguments @(
  (Join-Path $PSScriptRoot 'patch-mac-bundles.py'),
  $app,
  $version
)
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to update macOS bundle metadata.'
}

$icon = Join-Path $resources 'moli.icns'
Invoke-Python -Arguments @(
  (Join-Path $PSScriptRoot 'make-icns.py'),
  (Join-Path $projectRoot 'resources\icon.png'),
  $icon
)
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to generate the macOS application icon.'
}

$asarStage = Join-Path $archRoot 'asar-stage'
New-Item -ItemType Directory -Path $asarStage -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'main.js') -Destination $asarStage
Copy-Item -LiteralPath (Join-Path $projectRoot 'preload.js') -Destination $asarStage
Copy-Item -LiteralPath (Join-Path $projectRoot 'package.json') -Destination $asarStage
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist-ui') `
  -Destination (Join-Path $asarStage 'dist-ui') -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'lib') `
  -Destination (Join-Path $asarStage 'lib') -Recurse
New-Item -ItemType Directory -Path (Join-Path $asarStage 'resources') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'resources\icon.png') `
  -Destination (Join-Path $asarStage 'resources\icon.png')
Copy-Item -LiteralPath (Join-Path $projectRoot 'resources\release-config.json') `
  -Destination (Join-Path $asarStage 'resources\release-config.json')

$asarOutput = Join-Path $resources 'app.asar'
& (Join-Path $projectRoot 'node_modules\.bin\asar.cmd') pack $asarStage $asarOutput
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to create app.asar.'
}

New-Item -ItemType Directory -Path (Join-Path $resources 'boot') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $resources 'vm') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $resources 'qemu') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'resources\boot\vmlinuz') `
  -Destination (Join-Path $resources 'boot\vmlinuz')
Copy-Item -LiteralPath (Join-Path $projectRoot 'resources\boot\initrd.img') `
  -Destination (Join-Path $resources 'boot\initrd.img')
Copy-Item -LiteralPath (Join-Path $projectRoot 'resources\release-config.json') `
  -Destination (Join-Path $resources 'release-config.json')
Set-Content -LiteralPath (Join-Path $resources '.moli-arch') -Value $Arch -Encoding ascii

Write-Output $app
