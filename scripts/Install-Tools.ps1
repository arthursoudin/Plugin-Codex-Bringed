param([ValidateSet('All', 'Node', 'Tunnel')][string]$Component = 'All')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($env:OS -ne 'Windows_NT') { throw 'Este instalador de ferramentas e destinado ao Windows.' }
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
$assetArch = switch ($architecture) {
    'X64' { 'x64' }
    'Arm64' { 'arm64' }
    default { throw "Arquitetura Windows nao suportada: $architecture. Use Windows x64 ou ARM64." }
}

$nodeVersion = '24.22.1'
$tunnelVersion = '0.0.18'
$nodeAssetArch = if ($assetArch -eq 'x64') { 'win-x64' } else { 'win-arm64' }
$tunnelAssetArch = if ($assetArch -eq 'x64') { 'windows-amd64' } else { 'windows-arm64' }
$nodeHashes = @{ x64 = 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'; arm64 = 'a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171' }
$tunnelHashes = @{ x64 = '8d0da1ce79532d44ccc5ed5d8bd36cdfffba37dfd287c602d69635c8bb5db2b2'; arm64 = 'b73237513d50bf7acbeb960d80d9cbb6513879292f80ec1bd04b886fac1fe1c8' }
$installRoot = Join-Path $env:LOCALAPPDATA 'CodexBridge\tools'
$manifestPath = Join-Path $installRoot 'current.json'
$downloadRoot = Join-Path $env:TEMP ("CodexBridge-Install-" + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Force -Path $downloadRoot, $installRoot

function Read-CurrentManifest {
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        try { return Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json }
        catch { throw "Manifest de ferramentas invalido: $manifestPath. Corrija-o antes de instalar." }
    }
    return $null
}

function Install-VerifiedArchive {
    param(
        [Parameter(Mandatory=$true)][string]$Label,
        [Parameter(Mandatory=$true)][string]$Url,
        [Parameter(Mandatory=$true)][string]$ExpectedHash,
        [Parameter(Mandatory=$true)][string]$ArchiveName,
        [Parameter(Mandatory=$true)][string]$TargetName,
        [Parameter(Mandatory=$true)][string]$ExecutableName,
        [Parameter(Mandatory=$true)][string]$VersionPattern
    )

    $archive = Join-Path $downloadRoot $ArchiveName
    $stage = Join-Path $downloadRoot ($TargetName + '-expanded')
    Write-Host "Baixando $Label do endereco oficial..."
    Invoke-WebRequest -Uri $Url -OutFile $archive -TimeoutSec 300 -UseBasicParsing
    $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedHash.ToLowerInvariant()) {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        throw "A verificacao SHA-256 de $Label falhou. O arquivo baixado foi descartado."
    }

    $null = New-Item -ItemType Directory -Force -Path $stage
    Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
    $executable = Get-ChildItem -LiteralPath $stage -Filter $ExecutableName -File -Recurse | Select-Object -First 1
    if (-not $executable) { throw "O pacote validado de $Label nao contem $ExecutableName." }
    $versionOutput = (& $executable.FullName --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch $VersionPattern) {
        throw "A verificacao da versao de $Label falhou: $versionOutput"
    }

    $target = Join-Path $installRoot $TargetName
    if (Test-Path -LiteralPath $target) {
        $backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Move-Item -LiteralPath $target -Destination $backup
        Write-Host "Instalacao anterior preservada em $backup"
    }
    Move-Item -LiteralPath $stage -Destination $target
    $installedExe = Get-ChildItem -LiteralPath $target -Filter $ExecutableName -File -Recurse | Select-Object -First 1
    if (-not $installedExe) { throw "Nao encontrei $ExecutableName depois de instalar $Label." }
    return [pscustomobject]@{ version = $versionOutput; path = $installedExe.FullName }
}

try {
    $current = Read-CurrentManifest
    $node = if ($current) { $current.node } else { $null }
    $tunnel = if ($current) { $current.tunnelClient } else { $null }

    if ($Component -in @('All', 'Node')) {
        $nodeOk = $false
        if ($node -and (Test-Path -LiteralPath $node.path -PathType Leaf) -and $node.version -match "v?$nodeVersion") {
            $nodeOk = ((& $node.path --version 2>&1 | Out-String).Trim() -match "^v?$nodeVersion$")
        }
        if (-not $nodeOk) {
            $nodeUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-$nodeAssetArch.zip"
            $nodeName = "node-v$nodeVersion-$nodeAssetArch"
            $node = Install-VerifiedArchive -Label "Node.js v$nodeVersion ($assetArch)" -Url $nodeUrl -ExpectedHash $nodeHashes[$assetArch] -ArchiveName "$nodeName.zip" -TargetName $nodeName -ExecutableName 'node.exe' -VersionPattern "^v?$nodeVersion$"
        } else { Write-Host "Node.js $nodeVersion ja esta instalado e verificado." }
    }

    if ($Component -in @('All', 'Tunnel')) {
        $tunnelOk = $false
        if ($tunnel -and (Test-Path -LiteralPath $tunnel.path -PathType Leaf) -and $tunnel.version -match "v?$tunnelVersion") {
            $tunnelOutput = (& $tunnel.path --version 2>&1 | Out-String).Trim()
            $tunnelOk = ($LASTEXITCODE -eq 0 -and $tunnelOutput -match "v?$tunnelVersion")
        }
        if (-not $tunnelOk) {
            $tunnelName = "tunnel-client-v$tunnelVersion-$tunnelAssetArch"
            $tunnelUrl = "https://github.com/openai/tunnel-client/releases/download/v$tunnelVersion/$tunnelName.zip"
            $tunnel = Install-VerifiedArchive -Label "tunnel-client v$tunnelVersion ($assetArch)" -Url $tunnelUrl -ExpectedHash $tunnelHashes[$assetArch] -ArchiveName "$tunnelName.zip" -TargetName $tunnelName -ExecutableName 'tunnel-client.exe' -VersionPattern "v?$tunnelVersion"
        } else { Write-Host "tunnel-client $tunnelVersion ja esta instalado e verificado." }
    }

    $manifest = [ordered]@{ schema = 1; node = $node; tunnelClient = $tunnel; updatedAt = [DateTime]::UtcNow.ToString('o') }
    $manifestTemp = "$manifestPath.tmp"
    [IO.File]::WriteAllText($manifestTemp, ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $manifestTemp -Destination $manifestPath -Force
    Write-Host "Ferramentas instaladas para este usuario em: $installRoot"
    if ($node) { Write-Host "Node.js: $($node.version)" }
    if ($tunnel) { Write-Host "tunnel-client: $($tunnel.version)" }
    Write-Host 'Nenhuma chave de API foi solicitada ou armazenada.'
} finally {
    Remove-Item -LiteralPath $downloadRoot -Recurse -Force -ErrorAction SilentlyContinue
}
