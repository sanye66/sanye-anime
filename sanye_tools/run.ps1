param(
    [ValidateSet('portable', 'client', 'admin', 'test', 'docs', 'output', 'check')]
    [string]$Action = 'portable',
    [string]$OutputDirectory,
    [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
function Invoke-Step([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
try {
    switch ($Action) {
        'portable' { & (Join-Path $PSScriptRoot 'package-portable.ps1') -OutputDirectory $OutputDirectory -NoOpen:$NoOpen -PublishDesktop }
        'client' { Invoke-Step 'pnpm' @('dev:client-only') }
        'admin' { Invoke-Step 'pnpm' @('dev:admin') }
        'test' { Invoke-Step 'pnpm' @('test:desktop') }
        'docs' { Invoke-Step 'pnpm' @('docs:check') }
        'output' {
            $output = Join-Path $repo 'sanye_desktop/dist/portable-packages'
            New-Item -ItemType Directory -Path $output -Force | Out-Null
            Start-Process explorer.exe -ArgumentList "`"$output`""
        }
        'check' {
            . (Join-Path $repo 'sanye_deploy/use-local-toolchain.ps1')
            Invoke-Step 'node' @('--version')
            Invoke-Step 'pnpm' @('--version')
            Invoke-Step 'java' @('-version')
            Invoke-Step 'mvn' @('--version')
            $pg = if ($env:SANYE_DESKTOP_PG_HOME) { $env:SANYE_DESKTOP_PG_HOME } else { 'C:/Program Files/PostgreSQL/18' }
            Invoke-Step (Join-Path $pg 'bin/postgres.exe') @('--version')
        }
    }
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
