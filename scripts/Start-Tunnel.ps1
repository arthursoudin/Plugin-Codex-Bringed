param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9-]{0,47}$')][string]$ProfileName)
. (Join-Path $PSScriptRoot 'Common.ps1')
$clientExe = $null
if ($BridgeSettings.tunnelClientPath) {
    $clientExe = Resolve-BridgeExecutable -Configured $BridgeSettings.tunnelClientPath -Bundled (Join-Path $BridgeRoot 'tools\tunnel-client.exe') -UserInstalled (Get-ManagedBridgeTool 'tunnelClient') -Command 'tunnel-client.exe'
} else {
    try { $clientExe = Resolve-BridgeExecutable -Bundled (Join-Path $BridgeRoot 'tools\tunnel-client.exe') -UserInstalled (Get-ManagedBridgeTool 'tunnelClient') -Command 'tunnel-client.exe' }
    catch {
        if ($BridgeSettings.autoInstallTools -eq $false) { throw "tunnel-client nao foi encontrado. Execute Install.cmd ou habilite autoInstallTools." }
        Write-Host 'tunnel-client nao encontrado. Instalando a versao oficial verificada...'
        & (Join-Path $PSScriptRoot 'Install-Tools.ps1') -Component Tunnel
        $clientExe = Get-ManagedBridgeTool 'tunnelClient'
    }
    $versionOutput = if ($clientExe) { (& $clientExe --version 2>&1 | Out-String).Trim() } else { '' }
    if (-not $clientExe -or $LASTEXITCODE -ne 0 -or $versionOutput -notmatch 'v?0\.0\.18') {
        if ($BridgeSettings.autoInstallTools -eq $false) { throw "tunnel-client v0.0.18 e necessario para esta instalacao. Versao encontrada: $versionOutput" }
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
}
