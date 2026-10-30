param([string]$Project = '', [int]$Port = 0)
. (Join-Path $PSScriptRoot 'Common.ps1')
$nodeExe = $null
if ($BridgeSettings.nodePath) {
    $nodeExe = Resolve-BridgeExecutable -Configured $BridgeSettings.nodePath -Bundled (Join-Path $BridgeRoot 'tools\node.exe') -UserInstalled (Get-ManagedBridgeTool 'node') -Known (Join-Path $env:USERPROFILE 'node22\node.exe') -Command 'node.exe'
} else {
    try { $nodeExe = Resolve-BridgeExecutable -Bundled (Join-Path $BridgeRoot 'tools\node.exe') -UserInstalled (Get-ManagedBridgeTool 'node') -Known (Join-Path $env:USERPROFILE 'node22\node.exe') -Command 'node.exe' }
    catch {
        if ($BridgeSettings.allowAutomaticToolInstall -ne $true) { throw "Node.js nao foi encontrado. Execute Install.cmd ou defina allowAutomaticToolInstall como true para permitir a instalacao automatica." }
        Write-Host 'Node.js nao encontrado. Instalando a versao LTS verificada para este usuario...'
        & (Join-Path $PSScriptRoot 'Install-Tools.ps1') -Component Node
        $nodeExe = Resolve-BridgeExecutable -Bundled (Join-Path $BridgeRoot 'tools\node.exe') -UserInstalled (Get-ManagedBridgeTool 'node') -Command 'node.exe'
    }
}
$nodeVersion = (& $nodeExe --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(?<major>\d+)\.' -or [int]$Matches.major -lt 22) {
    if ($BridgeSettings.nodePath -or $BridgeSettings.allowAutomaticToolInstall -ne $true) { throw "Node.js 22 ou superior e necessario. Versao encontrada: $nodeVersion. Atualize-o manualmente ou defina allowAutomaticToolInstall como true para permitir a instalacao automatica." }
    Write-Host "Node.js $nodeVersion e antigo. Instalando a LTS validada..."
    & (Join-Path $PSScriptRoot 'Install-Tools.ps1') -Component Node
    $nodeExe = Get-ManagedBridgeTool 'node'
    if (-not $nodeExe) { throw 'A instalacao do Node.js nao registrou o executavel.' }
}
if ($Project) {
    if (-not (Test-Path -LiteralPath $Project -PathType Container)) { throw "Pasta do projeto não encontrada: $Project" }
    $Project = (Get-Item -LiteralPath $Project).FullName
}
if (-not $Port) { $Port = if ($BridgeSettings.httpPort) { [int]$BridgeSettings.httpPort } else { 18473 } }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Porta inválida.' }
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listener) { throw "A porta $Port já está ocupada. Nenhum processo foi encerrado." }
}
$oldCore = $env:CODEXBRIDGE_SERVER
$oldProject = $env:CODEXBRIDGE_PROJECT
$oldPort = $env:CODEXBRIDGE_HTTP_PORT
try {
    $env:CODEXBRIDGE_SERVER = Join-Path $BridgeRoot 'bridge\server.mjs'
    $env:CODEXBRIDGE_PROJECT = $Project
    $env:CODEXBRIDGE_HTTP_PORT = [string]$Port
    if ($Project) { Write-Host "Projeto autorizado: $Project" } else { Write-Host 'Adapter iniciado sem projeto padrão: guias e diagnósticos disponíveis; cada tarefa em arquivos exige uma pasta existente informada explicitamente.' }
    Write-Host "Dashboard: http://127.0.0.1:$Port/dashboard"
    $serverProcess = Start-Process -FilePath $nodeExe -ArgumentList @((Join-Path $BridgeRoot 'server.mjs')) -PassThru -WindowStyle Hidden
    try {
        Wait-LocalMcpEndpoint -Port $Port -TimeoutSeconds 15
        Write-Host "Endpoint MCP pronto: http://127.0.0.1:$Port/mcp"
        Wait-Process -Id $serverProcess.Id
        $serverProcess.Refresh()
        if ($serverProcess.ExitCode -ne 0) { throw "O adapter encerrou com código $($serverProcess.ExitCode)." }
    } catch {
        if (-not $serverProcess.HasExited) { Write-Warning "O adapter continua ativo no processo $($serverProcess.Id); encerre-o manualmente se necessário." }
        throw
    }
} finally {
    $env:CODEXBRIDGE_SERVER = $oldCore
    $env:CODEXBRIDGE_PROJECT = $oldProject
    $env:CODEXBRIDGE_HTTP_PORT = $oldPort
}
