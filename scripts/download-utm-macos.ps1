param(
  [string]$Output = '',
  [int]$Workers = 2,
  [int]$ChunkSizeMB = 4,
  [switch]$Fresh
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $projectRoot)
$outputPath = if ($Output) {
  [System.IO.Path]::GetFullPath($Output)
} else {
  Join-Path $workspaceRoot 'work\moli-linux-build\UTM-5.0.8.dmg'
}
$temporaryDirectory = Join-Path (Split-Path -Parent $outputPath) 'utm-download'
$releasePath = 'https://github.com/utmapp/UTM/releases/download/v5.0.8/UTM.dmg'
$mirrors = @(
  'https://gh-proxy.com/'
)
$size = [int64]304304581
$expectedHash = '7b2d7b2e2a02b3de1757ef19a8f36573e6d9cceae8c8cca0abcbcaa4a852019a'

New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
if ($Fresh) {
  Get-ChildItem -LiteralPath $temporaryDirectory -File -ErrorAction SilentlyContinue |
    ForEach-Object { [System.IO.File]::Delete($_.FullName) }
}

$chunkSize = [int64]$ChunkSizeMB * 1MB
$totalChunks = [int][Math]::Ceiling($size / $chunkSize)

for ($batchStart = 0; $batchStart -lt $totalChunks; $batchStart += $Workers) {
  $processes = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
  $batchCount = [Math]::Min($Workers, $totalChunks - $batchStart)

  for ($slot = 0; $slot -lt $batchCount; $slot++) {
    $index = $batchStart + $slot
    $start = [int64]($index * $chunkSize)
    $end = [int64][Math]::Min($size - 1, $start + $chunkSize - 1)
    $part = Join-Path $temporaryDirectory ('part{0:D4}.bin' -f $index)
    $log = Join-Path $temporaryDirectory ('part{0:D4}.log' -f $index)
    $expectedLength = $end - $start + 1
    if (Test-Path -LiteralPath $part) {
      $actualLength = (Get-Item -LiteralPath $part).Length
      if ($actualLength -eq $expectedLength) {
        continue
      }
      [System.IO.File]::Delete($part)
    }
    $url = $mirrors[$slot % $mirrors.Count] + $releasePath
    $arguments = @(
      '-L',
      '--fail',
      '--retry',
      '4',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '20',
      '--max-time',
      '240',
      '--range',
      "$start-$end",
      '-o',
      $part,
      $url
    )
    $process = Start-Process `
      -FilePath 'curl.exe' `
      -ArgumentList $arguments `
      -WindowStyle Hidden `
      -RedirectStandardError $log `
      -PassThru
    $processes.Add($process)
  }

  foreach ($process in $processes) {
    $process.WaitForExit()
  }

  $missingParts = New-Object System.Collections.Generic.List[string]
  for ($slot = 0; $slot -lt $batchCount; $slot++) {
    $index = $batchStart + $slot
    $start = [int64]($index * $chunkSize)
    $end = [int64][Math]::Min($size - 1, $start + $chunkSize - 1)
    $expectedLength = $end - $start + 1
    $part = Join-Path $temporaryDirectory ('part{0:D4}.bin' -f $index)
    if (-not (Test-Path -LiteralPath $part) -or
        (Get-Item -LiteralPath $part).Length -ne $expectedLength) {
      $missingParts.Add($part)
    }
  }

  if ($missingParts.Count -gt 0) {
    Get-ChildItem -LiteralPath $temporaryDirectory -Filter '*.log' |
      ForEach-Object {
        Write-Output ("--- " + $_.Name)
        Get-Content -LiteralPath $_.FullName
      }
    throw ("Missing payload chunks: " + ($missingParts -join ', '))
  }
}

if (Test-Path -LiteralPath $outputPath) {
  [System.IO.File]::Delete($outputPath)
}

$outputStream = [System.IO.File]::Create($outputPath)
try {
  Get-ChildItem -LiteralPath $temporaryDirectory -Filter 'part*.bin' |
    Sort-Object Name |
    ForEach-Object {
      $input = [System.IO.File]::OpenRead($_.FullName)
      try {
        $input.CopyTo($outputStream)
      }
      finally {
        $input.Dispose()
      }
    }
}
finally {
  $outputStream.Dispose()
}

$actualHash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
  throw "Checksum mismatch. Expected $expectedHash, received $actualHash"
}

Get-ChildItem -LiteralPath $temporaryDirectory -File |
  ForEach-Object { [System.IO.File]::Delete($_.FullName) }

Write-Output "Downloaded and verified: $outputPath"
Write-Output "SHA256: $actualHash"
