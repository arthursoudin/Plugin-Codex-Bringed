. (Join-Path $PSScriptRoot 'Common.ps1')
$healthy = { param($url) $url -eq 'http://127.0.0.1:18473/mcp' }
if (-not (Test-LocalMcpEndpoint -Port 18473 -TimeoutSeconds 0 -Request $healthy)) { throw 'Endpoint saudável deveria passar.' }
$unavailable = { param($url) $false }
if (Test-LocalMcpEndpoint -Port 18473 -TimeoutSeconds 0 -Request $unavailable) { throw 'Endpoint indisponível deveria falhar.' }
$tunnelScript = Get-Content (Join-Path $PSScriptRoot 'Start-Tunnel.ps1') -Raw
$check = $tunnelScript.IndexOf('Test-LocalMcpEndpoint')
$doctor = $tunnelScript.IndexOf(' doctor --config ')
$run = $tunnelScript.IndexOf(' run --config ')
if ($check -lt 0 -or $doctor -lt 0 -or $run -lt 0 -or $check -ge $doctor -or $doctor -ge $run) { throw 'A ordem deve ser preflight, doctor e run.' }
Write-Output 'Preflight saudável/indisponível e ordem doctor/run validados.'
