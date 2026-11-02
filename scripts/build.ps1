$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$distDirectory = Join-Path $projectRoot "dist"
$zipPath = Join-Path $distDirectory "SAMSARA.zip"
$packagePath = Join-Path $distDirectory "SAMSARA.wpk"
$requiredFiles = @(
    (Join-Path $projectRoot "manifest.webapp"),
    (Join-Path $projectRoot "index.html"),
    (Join-Path $projectRoot "css"),
    (Join-Path $projectRoot "js")
)

foreach ($path in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required app content is missing: $path"
    }
}

$manifest = Get-Content -LiteralPath (Join-Path $projectRoot "manifest.webapp") -Raw | ConvertFrom-Json
if ($manifest.name -ne "SAMSARA" -or $manifest.launch_path -ne "/index.html") {
    throw "manifest.webapp has an unexpected app name or launch path."
}

if (-not (Test-Path -LiteralPath $distDirectory)) {
    New-Item -ItemType Directory -Path $distDirectory | Out-Null
}
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
if (Test-Path -LiteralPath $packagePath) {
    Remove-Item -LiteralPath $packagePath -Force
}

Compress-Archive -Path $requiredFiles -DestinationPath $zipPath -CompressionLevel Optimal
Rename-Item -LiteralPath $zipPath -NewName "SAMSARA.wpk"

Write-Output "KaiOS package created: $packagePath"
Write-Output "This is an unsigned development package; target-firmware installation may require developer access or platform signing."
