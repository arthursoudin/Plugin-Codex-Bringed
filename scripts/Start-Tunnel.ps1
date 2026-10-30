param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9-]{0,47}$')][string]$ProfileName)
. (Join-Path $PSScriptRoot 'Common.ps1')
$clientExe = $null
if ($BridgeSettings.tunnelClientPath) {
    $clientExe = Resolve-BridgeExecutable -Configured $BridgeSettings.tunnelClientPath -Bundled (Join-Path $BridgeRoot 'tools\tunnel-client.exe') -UserInstalled (Get-ManagedBridgeTool 'tunnelClient') -Command 'tunnel-client.exe'
} else {
    try { $clientExe = Resolve-BridgeExecutable -Bundled (Join-Path $BridgeRoot 'tools\tunnel-client.exe') -UserInstalled (Get-ManagedBridgeTool 'tunnelClient') -Command 'tunnel-client.exe' }
    catch {
        if ($BridgeSettings.allowAutomaticToolInstall -ne $true) { throw "tunnel-client nao foi encontrado. Instale-o manualmente ou defina allowAutomaticToolInstall como true para permitir a instalacao automatica." }
        Write-Host 'tunnel-client nao encontrado. Instalando a versao oficial verificada...'
        & (Join-Path $PSScriptRoot 'Install-Tools.ps1') -Component Tunnel
        $clientExe = Get-ManagedBridgeTool 'tunnelClient'
    }
    $versionOutput = if ($clientExe) { (& $clientExe --version 2>&1 | Out-String).Trim() } else { '' }
    if (-not $clientExe -or $LASTEXITCODE -ne 0 -or $versionOutput -notmatch 'v?0\.0\.18') {
        if ($BridgeSettings.allowAutomaticToolInstall -ne $true) { throw "tunnel-client v0.0.18 e necessario para esta instalacao. Versao encontrada: $versionOutput. Atualize-o manualmente ou defina allowAutomaticToolInstall como true para permitir a instalacao automatica." }
        Write-Host "Atualizando tunnel-client para v0.0.18 (versao encontrada: $versionOutput)..."
        & (Join-Path $PSScriptRoot 'Install-Tools.ps1') -Component Tunnel
        $clientExe = Get-ManagedBridgeTool 'tunnelClient'
        if (-not $clientExe) { throw 'A instalacao do tunnel-client nao registrou o executavel.' }
    }
}
$profileFile = Join-Path $BridgeRoot "config\tunnels\$ProfileName.yaml"
if (-not (Test-Path -LiteralPath $profileFile -PathType Leaf)) { throw "Perfil não encontrado: $profileFile. Cadastre-o na página Tunnels." }
$mcpPort = if ($BridgeSettings.httpPort) { [int]$BridgeSettings.httpPort } else { 18473 }
if (-not (Test-LocalMcpEndpoint -Port $mcpPort -TimeoutSeconds 3)) {
    throw "Endpoint MCP local indisponível em http://127.0.0.1:$mcpPort/mcp. Inicie o adapter com Start.cmd e tente novamente. doctor/run não foram executados."
}
$profileContents = Get-Content -LiteralPath $profileFile -Raw
if ($profileContents -notmatch '(?im)^\s*X-CodexBridge-Token\s*:') { throw "Tunnel profile '$ProfileName' is outdated. Open Dashboard > Tunnels and save the profile again to add MCP authentication." }
if ($env:MCP_EXTRA_HEADERS) { throw 'MCP_EXTRA_HEADERS overrides profile headers. Remove that environment variable before starting the tunnel.' }
$mcpTokenFile = if ($env:CODEXBRIDGE_MCP_TOKEN_FILE) { $env:CODEXBRIDGE_MCP_TOKEN_FILE } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'CodexBridge\auth\mcp-token' } else { Join-Path $HOME '.codexbridge\auth\mcp-token' }
if (-not (Test-Path -LiteralPath $mcpTokenFile -PathType Leaf)) { throw "MCP token not found at '$mcpTokenFile'. Start the adapter before starting the tunnel." }
$mcpToken = (Get-Content -LiteralPath $mcpTokenFile -Raw).Trim()
if ($mcpToken -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'Local MCP token is invalid. Restart the adapter to recreate it securely.' }
$priorMcpToken = $env:CODEXBRIDGE_MCP_TOKEN
$env:CODEXBRIDGE_MCP_TOKEN = $mcpToken
$keyEnteredHere = $false
try {
    if (-not $env:CONTROL_PLANE_API_KEY) {
        $secureKey = Read-Host 'Cole a runtime key (entrada oculta)' -AsSecureString
        $env:CONTROL_PLANE_API_KEY = [Net.NetworkCredential]::new('', $secureKey).Password
        Remove-Variable secureKey
        $keyEnteredHere = $true
    }
    & $clientExe doctor --config $profileFile
    if ($LASTEXITCODE -ne 0) { throw 'O diagnóstico falhou. O tunnel não foi iniciado.' }
    & $clientExe run --config $profileFile
    if ($LASTEXITCODE -ne 0) { throw "O tunnel encerrou com código $LASTEXITCODE." }
} finally {
    if ($keyEnteredHere) { Remove-Item Env:\CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue }
    if ($null -eq $priorMcpToken) { Remove-Item Env:\CODEXBRIDGE_MCP_TOKEN -ErrorAction SilentlyContinue } else { $env:CODEXBRIDGE_MCP_TOKEN = $priorMcpToken }
}
