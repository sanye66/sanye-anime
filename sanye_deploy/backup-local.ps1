#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$Config,
    [Parameter(Mandatory = $true)] [string]$OutputDirectory,
    [string]$NodePath = 'node'
)
$ErrorActionPreference = 'Stop'
& $NodePath (Join-Path $PSScriptRoot 'recovery.mjs') backup $Config $OutputDirectory
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; incomplete files are retained for inspection.' }
