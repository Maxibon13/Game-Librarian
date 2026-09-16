param(
  [Parameter(Mandatory = $true)][string]$LocalJson,
  [Parameter(Mandatory = $true)][string]$RemoteUrl,
  [Parameter(Mandatory = $true)][string]$RepoUrl,
  [switch]$FlagOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Parse-AppVersion([string]$raw) {
  $s = ([string]$raw).Trim()
  if ($s -match '^\(\s*(\d+)\.(\d+)\s*\)\s+(\d{5,6})\s*(?:-\s*(.+))?$') {
    $pad = $Matches[3].PadLeft(6, '0')
    $dd = [int]$pad.Substring(0, 2)
    $mm = [int]$pad.Substring(2, 2)
    $yy = [int]$pad.Substring(4, 2)
    $ch = if ($Matches[4]) { $Matches[4].Trim() } else { 'Release' }
    return @{ Kind = 'stamp'; Major = [int]$Matches[1]; Minor = [int]$Matches[2]; Date = ($yy * 10000 + $mm * 100 + $dd); Channel = $ch }
  }
  $n = 0.0
  if ([double]::TryParse($s, [ref]$n)) {
    return @{ Kind = 'decimal'; Value = $n }
  }
  return @{ Kind = 'unknown' }
}

function Channel-Rank([string]$ch) {
  switch ($ch.Trim().ToLowerInvariant()) {
    { $_ -in @('pre', 'preview', 'alpha', 'dev') } { return 0 }
    { $_ -in @('beta', 'rc') } { return 1 }
    default { return 2 }
  }
}

function Compare-AppVersion([string]$local, [string]$remote) {
  $a = Parse-AppVersion $local
  $b = Parse-AppVersion $remote
  if ($a.Kind -eq 'stamp' -and $b.Kind -eq 'stamp') {
    if ($a.Major -ne $b.Major) { return $a.Major - $b.Major }
    if ($a.Minor -ne $b.Minor) { return $a.Minor - $b.Minor }
    if ($a.Date -ne $b.Date) { return $a.Date - $b.Date }
    return (Channel-Rank $a.Channel) - (Channel-Rank $b.Channel)
  }
  if ($a.Kind -eq 'stamp' -and $b.Kind -ne 'stamp') { return 1 }
  if ($a.Kind -ne 'stamp' -and $b.Kind -eq 'stamp') { return -1 }
  if ($a.Kind -eq 'decimal' -and $b.Kind -eq 'decimal') {
    if ($a.Value -lt $b.Value) { return -1 }
    if ($a.Value -gt $b.Value) { return 1 }
    return 0
  }
  return 0
}

$local = ''
try {
  $local = [string]((Get-Content -Raw -LiteralPath $LocalJson | ConvertFrom-Json).version)
} catch { $local = '' }

$remote = ''
try {
  $raw = (Invoke-WebRequest -UseBasicParsing $RemoteUrl).Content
  $remote = [string](($raw | ConvertFrom-Json).version)
} catch { $remote = '' }

$update = $false
if ($remote -and ((Compare-AppVersion $local $remote) -lt 0)) { $update = $true }

if ($FlagOnly) {
  if ($update) { Write-Output '1' } else { Write-Output '0' }
  exit 0
}

[ordered]@{
  ok = $true
  updateAvailable = $update
  localVersion = $local
  remoteVersion = $remote
  repository = $RepoUrl
} | ConvertTo-Json -Compress
