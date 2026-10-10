#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$Config,
    [Parameter(Mandatory = $true)] [string]$BackupDirectory,
    [string]$NodePath = 'node'
)
$ErrorActionPreference = 'Stop'
& $NodePath (Join-Path $PSScriptRoot 'recovery.mjs') restore $Config $BackupDirectory
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; inspect retained targets.' }
