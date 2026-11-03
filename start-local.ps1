param(
    [int]$Port = 3000,
    [ValidateNotNullOrEmpty()][string]$BindAddress = '0.0.0.0'
)

$ErrorActionPreference = 'Stop'
$bundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$projectRoot = $PSScriptRoot
$nextCli = Join-Path $projectRoot 'node_modules/next/dist/bin/next'

if (-not (Test-Path -LiteralPath $nextCli)) {
    throw 'Dependencies are missing. Run npm install in the project directory.'
}

if (-not (Test-Path -LiteralPath $bundledNode)) {
    $bundledNode = (Get-Command node -ErrorAction Stop).Source
}

Push-Location -LiteralPath $projectRoot
try {
    & $bundledNode $nextCli dev --hostname $BindAddress --port $Port
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
