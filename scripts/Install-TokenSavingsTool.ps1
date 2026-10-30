param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('rtk', 'headroom')]
    [string]$Tool
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Este instalador esta preparado para Windows.' }

function Get-ToolCommand([string]$Name, [string[]]$Candidates) {
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
    }
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and $command.Source) { return $command.Source }
    return $null
}

function Install-WithWinget([string]$Id) {
    $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $winget -or -not $winget.Source) { throw "O Windows Package Manager (winget) nao foi encontrado. Instale $Id manualmente e tente novamente." }
    Write-Host "Instalando o pacote oficial $Id pelo winget..."
    & $winget.Source install --id $Id --exact --accept-source-agreements --accept-package-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "winget terminou com codigo $LASTEXITCODE ao instalar $Id." }
}

if ($Tool -eq 'rtk') {
    $wingetRtk = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\rtk.exe'
    $rtkExe = if (Test-Path -LiteralPath $wingetRtk -PathType Leaf) { $wingetRtk } else { $null }
    if (-not $rtkExe) { Install-WithWinget 'rtk-ai.rtk' }
    $rtkExe = Get-ToolCommand 'rtk.exe' @((Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\rtk.exe'))
    if (-not $rtkExe) {
        Write-Host 'O winget concluiu a instalacao do RTK. O terminal atual talvez ainda nao tenha o novo PATH; reinicie o CodexBridge e verifique com rtk --version e rtk gain.'
        exit 0
    }
    $version = (& $rtkExe --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $version) { throw 'Nao consegui validar a versao do RTK.' }
    Write-Host "RTK instalado e validado: $version"
    Write-Host 'RTK reduz a saida de comandos do terminal. O painel importa apenas estimativas locais quando voce solicita a sincronizacao.'
    Write-Host 'A instalacao nao altera configuracoes do Codex. Para verificar o recurso, execute rtk gain no terminal.'
    exit 0
}

$uvCandidates = @(
    (Join-Path $env:USERPROFILE 'bin\uv.exe'),
    (Join-Path $env:USERPROFILE '.local\bin\uv.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\uv.exe')
)
$uvExe = Get-ToolCommand 'uv.exe' $uvCandidates
if (-not $uvExe) {
    Install-WithWinget 'astral-sh.uv'
    $uvExe = Get-ToolCommand 'uv.exe' $uvCandidates
}
if (-not $uvExe) { throw 'O winget instalou ou encontrou uv, mas o executavel nao esta disponivel. Reabra o CodexBridge e tente novamente.' }

$headroomExe = Get-ToolCommand 'headroom.exe' @((Join-Path $env:USERPROFILE '.local\bin\headroom.exe'))
if ($headroomExe) {
    $version = (& $headroomExe --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $version) {
        Write-Host "Headroom ja esta instalado: $version"
        Write-Host 'Headroom otimiza contexto em clientes de API compativeis configurados para usar o proxy ou SDK. A instalacao nao configura provedores nem guarda chaves.'
        exit 0
    }
}

Write-Host 'Instalando Headroom em um ambiente isolado do uv com Python 3.13...'
& $uvExe tool install --python 3.13 'headroom-ai[all]'
if ($LASTEXITCODE -ne 0) { throw 'A instalacao de headroom-ai falhou. Veja se Python 3.13 e as dependencias de compilacao do Windows estao disponiveis; nenhum segredo foi alterado.' }
$headroomExe = Get-ToolCommand 'headroom.exe' @((Join-Path $env:USERPROFILE '.local\bin\headroom.exe'))
if (-not $headroomExe) {
    Write-Host 'Headroom foi instalado, mas o executavel nao esta no PATH deste processo. Reabra o CodexBridge e verifique com headroom --version.'
    exit 0
}
$version = (& $headroomExe --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $version) { throw 'A instalacao terminou, mas nao consegui validar Headroom.' }
Write-Host "Headroom instalado e validado: $version"
Write-Host 'Headroom otimiza contexto em clientes de API compativeis configurados para usar seu proxy ou SDK. Esta instalacao nao configura provedores nem guarda chaves.'
Write-Host 'No Windows, se a instalacao falhar ao construir dependencias, confira os pre-requisitos Python/C++ indicados na documentacao oficial.'
