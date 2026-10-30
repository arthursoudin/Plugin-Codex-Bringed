param(
  [ValidateSet('Codex', 'Claude Code', 'Antigravity')]
  [string]$Client
)

$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js não foi encontrado. Instale Node.js 22 ou superior antes de continuar.' }

if (-not $Client) {
  Write-Host 'Escolha o cliente para instalar os perfis nativos:'
  Write-Host '1. Codex'
  Write-Host '2. Claude Code'
  Write-Host '3. Antigravity'
  $choice = Read-Host 'Digite 1, 2 ou 3'
  $Client = @{ '1' = 'Codex'; '2' = 'Claude Code'; '3' = 'Antigravity' }[$choice]
}
if (-not $Client) { throw 'Escolha inválida. Nenhum arquivo foi alterado.' }

$target = switch ($Client) {
  'Codex' { 'codex' }
  'Claude Code' { 'claude_code' }
  'Antigravity' { 'antigravity' }
}
& $node.Source (Join-Path $PSScriptRoot 'Install-Agent-Profiles.mjs') --client $target
if ($LASTEXITCODE -ne 0) { throw 'A instalação não foi concluída. Arquivos existentes foram preservados.' }
