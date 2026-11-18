param(
    [switch]$SetEnvironment
)

$ErrorActionPreference = "Stop"

$jdkRoots = @(
    "C:\Program Files\Eclipse Adoptium",
    "C:\Program Files\Microsoft",
    "C:\Program Files\Java"
) | Where-Object { Test-Path $_ }

$jdk = Get-ChildItem -Path $jdkRoots -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(jdk-)?25(?:\.|$)' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if (-not $jdk) {
    throw "Java 25 JDK was not found. Install Eclipse Temurin 25 before continuing."
}

if ($SetEnvironment) {
    [Environment]::SetEnvironmentVariable("JAVA_HOME", $jdk.FullName, "User")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $javaBin = Join-Path $jdk.FullName "bin"
    $entries = @($userPath -split ";" | Where-Object { $_ })
    $entries = @($javaBin) + @($entries | Where-Object { $_ -notmatch '\\(Java|Eclipse Adoptium).*(jdk|jre)' })
    [Environment]::SetEnvironmentVariable("Path", ($entries -join ";"), "User")
    $env:JAVA_HOME = $jdk.FullName
    $env:Path = "$javaBin;$env:Path"
}

$java = Join-Path $jdk.FullName "bin\java.exe"
$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$versionOutput = & $java -version 2>&1 | Out-String
$ErrorActionPreference = $previousErrorPreference
if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch 'version "25') {
    throw "The discovered JDK does not report Java 25.`n$versionOutput"
}

Write-Output "Java 25 verified: $($jdk.FullName)"
Write-Output (($versionOutput -split "`r?`n" | Select-Object -First 1).Trim())
