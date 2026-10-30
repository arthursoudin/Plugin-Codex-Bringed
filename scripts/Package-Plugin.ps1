param(
  [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\codexbridge-plugin-update.zip'),
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$files = @(
  'README.md', 'package.json', 'Start.cmd', 'Tunnel.cmd', 'Install.cmd',
  'dashboard.mjs', 'dashboard-workshop.js', 'server.mjs', 'stdio.mjs', 'workflow.mjs', 'project-catalog.mjs', 'task-retention.mjs', 'routing.mjs', 'runtime-info.mjs', 'mcp-setup.mjs', 'tool-annotations.mjs', 'process-safety.mjs', 'http-auth.mjs',
  'bridge\approve-task.mjs', 'bridge\server.mjs', 'browser-readonly.mjs',
  'scripts\Common.ps1', 'scripts\Start-Adapter.ps1', 'scripts\Start-Tunnel.ps1', 'scripts\Compare-Installations.ps1', 'scripts\Install-Tools.ps1', 'scripts\Install-Graphify.ps1', 'scripts\Install-TokenSavingsTool.ps1',
  'config\settings.example.json', 'config\tunnels\example.yaml',
  'tools\README.md', 'docs\roadmap-fases.md'
)

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
if (-not $resolvedOutput.StartsWith($distRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "O ZIP deve ser salvo dentro de dist: $distRoot"
}
foreach ($relative in $files) {
  $source = Join-Path $projectRoot $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Arquivo distributável ausente: $relative" }
}

if ($ValidateOnly) {
  Write-Output "Entradas distributivas validadas: $($files.Count) arquivos. Nenhum ZIP foi criado ou alterado."
  return
}

if (Test-Path -LiteralPath $resolvedOutput) {
  throw "O arquivo de destino já existe e foi preservado: $resolvedOutput. Escolha outro nome com -OutputPath."
}

$null = New-Item -ItemType Directory -Force -Path $distRoot
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($resolvedOutput, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $files) {
    $source = Join-Path $projectRoot $relative
    $entryName = $relative.Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }

Write-Output "Criado: $resolvedOutput"
Write-Output "Arquivos incluídos: $($files.Count)"
