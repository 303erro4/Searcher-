$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$port = $env:PORT
if (-not $port) { $port = '8000' }
Write-Host "Démarrage de Nexus Legacy sur http://localhost:$port"
python .\server.py
