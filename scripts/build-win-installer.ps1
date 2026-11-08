param(
  [switch]$ReusePayload
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot 'dist'
$unpacked = Join-Path $distRoot 'win-unpacked'
$packageJson = Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $packageJson.version
$archive = Join-Path $distRoot ("Moli-Linux-{0}-win-x64-payload.7z" -f $version)
$payloadPrefix = Join-Path $distRoot ("Moli-Linux-{0}-win-x64-payload.7z" -f $version)
$setupExe = Join-Path $distRoot ("Moli-Linux-{0}-win-x64-Setup.exe" -f $version)

function Assert-UnderDist([string]$Path) {
  $resolvedRoot = [System.IO.Path]::GetFullPath($distRoot).TrimEnd('\') + '\'
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside dist: $resolvedPath"
  }
}

if (-not (Test-Path -LiteralPath $unpacked)) {
  throw "electron-builder output is missing: $unpacked"
}

$vmSource = Join-Path $projectRoot 'resources\vm'
$rootParts = @(
  Get-ChildItem -LiteralPath $vmSource -Filter 'root-seed.qcow2.part*' |
    Where-Object { $_.Name -match '^root-seed\.qcow2\.part\d{3}$' } |
    Sort-Object Name
)
if ($rootParts.Count -ne 4) {
  throw "Expected four split Linux root image parts, found $($rootParts.Count)."
}
foreach ($part in $rootParts) {
  if ($part.Length -le 0) {
    throw "The Linux root image part is empty: $($part.FullName)"
  }
}
$rootTemplate = Join-Path $projectRoot 'resources\vm\root-overlay-template.qcow2'
if (-not (Test-Path -LiteralPath $rootTemplate)) {
  throw "The persistent disk template is missing: $rootTemplate"
}
$dataTemplate = Join-Path $projectRoot 'resources\vm\data-disk-template.qcow2'
if (-not (Test-Path -LiteralPath $dataTemplate)) {
  throw "The second disk template is missing: $dataTemplate"
}
$payloadVm = Join-Path $unpacked 'resources\vm'
New-Item -ItemType Directory -Path $payloadVm -Force | Out-Null
Get-ChildItem -LiteralPath $payloadVm -Filter 'root-seed.qcow2*' -ErrorAction SilentlyContinue |
  ForEach-Object {
    Assert-UnderDist $_.FullName
    [System.IO.File]::Delete($_.FullName)
  }
foreach ($part in $rootParts) {
  $payloadPart = Join-Path $payloadVm $part.Name
  New-Item -ItemType HardLink -Path $payloadPart -Target $part.FullName | Out-Null
  if ((Get-Item -LiteralPath $payloadPart).Length -ne $part.Length) {
    throw "The staged Linux root image part is incomplete: $($part.Name)"
  }
}
$payloadTemplate = Join-Path $payloadVm 'root-overlay-template.qcow2'
if (Test-Path -LiteralPath $payloadTemplate) {
  Assert-UnderDist $payloadTemplate
  [System.IO.File]::Delete($payloadTemplate)
}
New-Item -ItemType HardLink -Path $payloadTemplate -Target $rootTemplate | Out-Null
if ((Get-Item -LiteralPath $payloadTemplate).Length -ne (Get-Item -LiteralPath $rootTemplate).Length) {
  throw 'The staged persistent disk template is incomplete.'
}
$payloadDataTemplate = Join-Path $payloadVm 'data-disk-template.qcow2'
if (Test-Path -LiteralPath $payloadDataTemplate) {
  Assert-UnderDist $payloadDataTemplate
  [System.IO.File]::Delete($payloadDataTemplate)
}
New-Item -ItemType HardLink -Path $payloadDataTemplate -Target $dataTemplate | Out-Null
if ((Get-Item -LiteralPath $payloadDataTemplate).Length -ne (Get-Item -LiteralPath $dataTemplate).Length) {
  throw 'The staged second disk template is incomplete.'
}

$appExecutable = Join-Path $unpacked 'Moli Linux.exe'
$smokeOutput = Join-Path $distRoot 'devtools-smoke.out.log'
$smokeError = Join-Path $distRoot 'devtools-smoke.err.log'
foreach ($path in @($smokeOutput, $smokeError)) {
  Assert-UnderDist $path
  if (Test-Path -LiteralPath $path) {
    [System.IO.File]::Delete($path)
  }
}
$previousDevToolsSmoke = $env:MOLI_DEVTOOLS_SMOKE
$env:MOLI_DEVTOOLS_SMOKE = '1'
try {
  $smokeProcess = Start-Process `
    -FilePath $appExecutable `
    -Wait `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $smokeOutput `
    -RedirectStandardError $smokeError
} finally {
  $env:MOLI_DEVTOOLS_SMOKE = $previousDevToolsSmoke
}
$smokeText = if (Test-Path -LiteralPath $smokeOutput) {
  Get-Content -LiteralPath $smokeOutput -Raw
} else {
  ''
}
if ($smokeProcess.ExitCode -ne 0 -or $smokeText -notmatch 'MOLI_DEVTOOLS_SMOKE=.*"ok":true') {
  $smokeErrorText = if (Test-Path -LiteralPath $smokeError) {
    Get-Content -LiteralPath $smokeError -Raw
  } else {
    ''
  }
  throw "Packaged Developer Tools smoke test failed.`n$smokeText`n$smokeErrorText"
}

$sevenZip = Get-ChildItem `
  -LiteralPath (Join-Path $env:LOCALAPPDATA 'electron-builder\Cache') `
  -Recurse -Filter '7za.exe' -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $sevenZip) {
  throw '7za.exe was not found in the electron-builder cache.'
}

Assert-UnderDist $archive
Assert-UnderDist $payloadPrefix
Assert-UnderDist $setupExe

$existingParts = @(
  Get-ChildItem -LiteralPath $distRoot `
    -Filter ((Split-Path -Leaf $payloadPrefix) + '.*') `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '\.7z\.\d{3}$' }
)
if ($ReusePayload -and $existingParts.Count -gt 0) {
  Write-Output "Reusing $($existingParts.Count) existing payload volumes."
} else {
  if (Test-Path -LiteralPath $archive) {
    [System.IO.File]::Delete($archive)
  }
  $existingParts | ForEach-Object {
    Assert-UnderDist $_.FullName
    [System.IO.File]::Delete($_.FullName)
  }

  Push-Location $unpacked
  try {
    # Use fast LZMA2 compression. The stored archive made the installer nearly
    # 8 GiB because the split disk files contain large sparse regions.
    & $sevenZip a -t7z -mx=1 -mmt=on -ms=off -v1900m $archive '*'
    if ($LASTEXITCODE -ne 0) {
      throw "7-Zip failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

$parts = @(
  Get-ChildItem -LiteralPath $distRoot `
    -Filter ((Split-Path -Leaf $payloadPrefix) + '.*') |
    Where-Object { $_.Name -match '\.7z\.\d{3}$' } |
    Sort-Object Name
)
if ($parts.Count -eq 0) {
  throw '7-Zip did not produce split payload volumes.'
}
if (Test-Path -LiteralPath $archive) {
  [System.IO.File]::Delete($archive)
}
[System.IO.Directory]::Delete($unpacked, $true)

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$installerSource = Join-Path $projectRoot 'installer\MoliSetup.cs'
$icon = Join-Path $distRoot '.icon-ico\icon.ico'
if (-not (Test-Path -LiteralPath $icon)) {
  $icon = Join-Path $projectRoot 'resources\icon.ico'
}

$arguments = @(
  '/nologo',
  '/target:winexe',
  '/platform:anycpu',
  '/optimize+',
  "/resource:$sevenZip,MoliSetup.7za.exe",
  "/out:$setupExe",
  '/reference:System.dll',
  '/reference:System.Core.dll',
  '/reference:System.Drawing.dll',
  '/reference:System.Windows.Forms.dll',
  $installerSource
)
if (Test-Path -LiteralPath $icon) {
  $arguments = @("/win32icon:$icon") + $arguments
}

& $csc @arguments
if ($LASTEXITCODE -ne 0) {
  throw "C# installer compilation failed with exit code $LASTEXITCODE"
}

Get-ChildItem -LiteralPath $distRoot -Filter 'Moli-Linux-*-Setup.exe' |
  Where-Object { $_.FullName -ne $setupExe } |
  ForEach-Object {
    Assert-UnderDist $_.FullName
    [System.IO.File]::Delete($_.FullName)
  }

Write-Output "Installer: $setupExe"
$parts |
  Select-Object Name, Length

$checksumFiles = @(
  Get-ChildItem -LiteralPath $distRoot -Filter 'Moli-Linux-*-Setup.exe'
  $parts
)
$checksumLines = foreach ($file in $checksumFiles) {
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $($file.Name)"
}
Set-Content -LiteralPath (Join-Path $distRoot 'SHA256SUMS.txt') `
  -Value $checksumLines -Encoding ascii
