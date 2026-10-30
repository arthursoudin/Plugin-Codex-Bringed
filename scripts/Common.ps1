$ErrorActionPreference = 'Stop'
$BridgeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$BridgeSettings = [pscustomobject]@{}
$settingsFile = Join-Path $BridgeRoot 'config\settings.local.json'
$ManagedToolsManifest = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'CodexBridge\tools\current.json' } else { '' }
if (Test-Path -LiteralPath $settingsFile) {
    $BridgeSettings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
}
function Get-ManagedBridgeTool {
    param([ValidateSet('node', 'tunnelClient')][string]$Name)
    if (-not $ManagedToolsManifest -or -not (Test-Path -LiteralPath $ManagedToolsManifest -PathType Leaf)) { return '' }
    try {
        $manifest = Get-Content -LiteralPath $ManagedToolsManifest -Raw | ConvertFrom-Json
        $entry = $manifest.$Name
        if ($entry -and $entry.path -and (Test-Path -LiteralPath $entry.path -PathType Leaf)) { return (Get-Item -LiteralPath $entry.path).FullName }
    } catch {}
    return ''
}
function Resolve-BridgeExecutable {
    param([string]$Configured, [string]$Bundled, [string]$UserInstalled, [string]$Known, [string]$Command)
    foreach ($candidate in @($Configured, $Bundled, $UserInstalled, $Known)) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Get-Item -LiteralPath $candidate).FullName
        }
        if ($candidate -and $candidate -eq $Configured) { throw "Executável configurado não encontrado: $candidate" }
    }
    $found = Get-Command $Command -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.Source }
    throw "Não encontrei $Command. Informe seu caminho em config\settings.local.json."
}

function Test-LocalMcpEndpoint {
    param([int]$Port, [int]$TimeoutSeconds = 10, [int]$IntervalMilliseconds = 250, [scriptblock]$Request)
    $url = "http://127.0.0.1:$Port/mcp"
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $ready = $false
        try {
            if ($Request) { $ready = [bool](& $Request $url) }
            else {
                $requestObject = [Net.HttpWebRequest]::Create($url)
                $requestObject.Method = 'GET'; $requestObject.Timeout = 1000
                try { $response = $requestObject.GetResponse() }
                catch [Net.WebException] { $response = $_.Exception.Response }
                if ($response) { $ready = ([int]$response.StatusCode -eq 405 -and $response.Headers['Allow'] -match 'POST'); $response.Close() }
            }
        } catch { $ready = $false }
        if ($ready) { return $true }
        if ([DateTime]::UtcNow -ge $deadline) { break }
        Start-Sleep -Milliseconds $IntervalMilliseconds
    } while ($true)
    return $false
}

function Wait-LocalMcpEndpoint {
    param([int]$Port, [int]$TimeoutSeconds = 15)
    if (-not (Test-LocalMcpEndpoint -Port $Port -TimeoutSeconds $TimeoutSeconds)) {
        throw "O endpoint MCP local não respondeu em http://127.0.0.1:$Port/mcp após ${TimeoutSeconds}s. Confira se o adapter iniciou e se a porta está correta; o processo não foi encerrado."
    }
}
