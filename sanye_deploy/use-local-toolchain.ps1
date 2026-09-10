# Dot-source this file to align Maven with the project Java runtime in this terminal.
$sanyeJavaHome = Join-Path $env:USERPROFILE '.jdks/microsoft-jdk-21.0.12'
if (-not (Test-Path -LiteralPath (Join-Path $sanyeJavaHome 'bin/java.exe'))) {
    throw "Project JDK not found: $sanyeJavaHome"
}
$env:JAVA_HOME = $sanyeJavaHome
$env:PATH = (Join-Path $sanyeJavaHome 'bin') + [IO.Path]::PathSeparator + $env:PATH
