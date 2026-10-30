$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') { throw 'Este instalador foi preparado para Windows.' }

$graphifyCommand = Get-Command 'graphify.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $graphifyCommand) { $graphifyCommand = Get-Command 'graphify' -ErrorAction SilentlyContinue | Select-Object -First 1 }
$graphifyExe = if ($graphifyCommand -and $graphifyCommand.Source) { $graphifyCommand.Source } else { '' }
$knownGraphify = Join-Path $env:USERPROFILE '.local\bin\graphify.exe'
if (-not $graphifyExe -and (Test-Path -LiteralPath $knownGraphify -PathType Leaf)) { $graphifyExe = $knownGraphify }

if (-not $graphifyExe) {
    $uv = Get-Command 'uv.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $uv) { $uv = Get-Command 'uv' -ErrorAction SilentlyContinue | Select-Object -First 1 }
    $knownUv = Join-Path $env:USERPROFILE 'bin\uv.exe'
    if (-not $uv -and (Test-Path -LiteralPath $knownUv -PathType Leaf)) { $uv = [pscustomobject]@{ Source = $knownUv } }
    if (-not $uv -or -not $uv.Source) {
        throw 'Graphify nao foi encontrado e uv tambem nao. Instale uv com o gerenciador oficial ou winget install astral-sh.uv e tente novamente.'
    }
    Write-Host 'Instalando o pacote oficial graphifyy em uma ferramenta Python isolada do usuario...'
    & $uv.Source tool install graphifyy
    if ($LASTEXITCODE -ne 0) { throw 'A instalacao do pacote graphifyy falhou.' }
    if (Test-Path -LiteralPath $knownGraphify -PathType Leaf) { $graphifyExe = $knownGraphify }
    if (-not $graphifyExe) {
        $graphifyCommand = Get-Command 'graphify.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $graphifyCommand) { $graphifyCommand = Get-Command 'graphify' -ErrorAction SilentlyContinue | Select-Object -First 1 }
        if ($graphifyCommand -and $graphifyCommand.Source) { $graphifyExe = $graphifyCommand.Source }
    }
}

if (-not $graphifyExe -or -not (Test-Path -LiteralPath $graphifyExe -PathType Leaf)) {
    throw 'O pacote foi instalado, mas nao encontrei graphify.exe. Atualize o PATH do usuario e tente novamente.'
}

$version = (& $graphifyExe --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $version) { throw 'Nao consegui validar a versao do Graphify.' }
Write-Host "Graphify CLI: $version"
Write-Host 'Registrando a integracao Graphify no perfil Codex deste usuario...'
& $graphifyExe install --platform codex
if ($LASTEXITCODE -ne 0) { throw 'O registro da integracao Graphify no Codex falhou.' }

Write-Host 'RTK: reduz saidas de comandos do terminal quando usado como ferramenta ou wrapper; seus ganhos sao estimativas.'
Write-Host 'Headroom: comprime contexto em requisicoes de clientes/API compativeis configurados para usar seu proxy ou SDK.'
Write-Host 'Graphify: cria um grafo local de codigo e documentos para consultar funcoes, arquivos e relacoes; nao mede economia diretamente.'
Write-Host 'A integracao Graphify foi preparada no perfil Codex do usuario. Revise as alteracoes indicadas pela ferramenta e reinicie o Codex se solicitado.'
