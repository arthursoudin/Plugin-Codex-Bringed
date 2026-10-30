param(
  [Parameter(Mandatory = $true)][string]$OldRoot,
  [Parameter(Mandatory = $true)][string]$PreparedRoot
)

$ErrorActionPreference = 'Stop'

function Resolve-Directory([string]$Candidate) {
  $resolved = Resolve-Path -LiteralPath $Candidate -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $resolved.Path -PathType Container)) {
    throw "Diretório inválido: $Candidate"
  }
  return [System.IO.Path]::GetFullPath($resolved.Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

function Count-Files([string]$Root, [string]$RelativePath, [string]$Filter = '*') {
  $directory = Join-Path $Root $RelativePath
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { return 0 }
  return @(Get-ChildItem -LiteralPath $directory -File -Filter $Filter -Recurse -Force -ErrorAction Stop).Count
}

$old = Resolve-Directory $OldRoot
$prepared = Resolve-Directory $PreparedRoot
if ($old.Equals($prepared, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'OldRoot e PreparedRoot precisam ser diretórios diferentes.'
}

$codeFiles = @(
  'server.mjs', 'workflow.mjs', 'dashboard.mjs', 'package.json', 'package-lock.json',
  'bridge\server.mjs', 'scripts\Start-Adapter.ps1', 'README.md', 'PROMPT-CODEX.md'
)
$comparisons = foreach ($relative in $codeFiles) {
  $oldFile = Join-Path $old $relative
  $preparedFile = Join-Path $prepared $relative
  $oldExists = Test-Path -LiteralPath $oldFile -PathType Leaf
  $preparedExists = Test-Path -LiteralPath $preparedFile -PathType Leaf
  $oldHash = if ($oldExists) { (Get-FileHash -LiteralPath $oldFile -Algorithm SHA256).Hash } else { $null }
  $preparedHash = if ($preparedExists) { (Get-FileHash -LiteralPath $preparedFile -Algorithm SHA256).Hash } else { $null }
  [pscustomobject]@{
    path = $relative
    old_exists = $oldExists
    prepared_exists = $preparedExists
    same_hash = ($oldExists -and $preparedExists -and $oldHash -eq $preparedHash)
    old_sha256 = $oldHash
    prepared_sha256 = $preparedHash
  }
}

$stateDirectories = @('history', 'bridge\approvals', 'bridge\reports', 'config\tunnels')
$state = foreach ($relative in $stateDirectories) {
  [pscustomobject]@{
    path = $relative
    old_file_count = Count-Files $old $relative
    prepared_file_count = Count-Files $prepared $relative
  }
}
$approvalCounts = foreach ($root in @($old, $prepared)) {
  [pscustomobject]@{
    root = if ($root -eq $old) { 'old' } else { 'prepared' }
    pending_record_file_count = Count-Files $root 'bridge\approvals' '*.pending.json'
    approved_proof_file_count = Count-Files $root 'bridge\approvals' '*.approved.json'
    active_lock_present = Test-Path -LiteralPath (Join-Path $root 'bridge\active.lock') -PathType Leaf
  }
}

$report = [pscustomobject]@{
  generated_at = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  roots = [pscustomobject]@{ old = $old; prepared = $prepared }
  code_files = @($comparisons)
  state_counts = @($state)
  approval_safety = @($approvalCounts)
  state_file_contents_read = $false
  code_files_hashed = $true
  files_copied = $false
  processes_changed = $false
  note = 'Hashes are calculated only for the fixed code-file allowlist. State directories are counted without reading their contents. A .pending.json file count is only a count of stored record files, not proof of a current or valid approval. Approval records require manual reconciliation and are never copied by this script.'
}

$report | ConvertTo-Json -Depth 6
