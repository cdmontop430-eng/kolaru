# EAS Build Script - Start build and exit immediately
$env:CI = "true"

Write-Host "Starting EAS Build..."
Write-Host "Working directory: $(Get-Location)"
Write-Host "Platform: android"
Write-Host "Profile: preview"
Write-Host ""

# Start npx eas build process
$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = "C:\Program Files\nodejs\npx.cmd"
$pinfo.Arguments = "eas build --platform android --profile preview --no-wait --non-interactive"
$pinfo.WorkingDirectory = "d:\discord\kolaru\mobile-app"
$pinfo.UseShellExecute = $false
$pinfo.RedirectStandardOutput = $true
$pinfo.RedirectStandardError = $true

$pProcess = New-Object System.Diagnostics.Process
$pProcess.StartInfo = $pinfo
$pProcess.Start() | Out-Null

Write-Host "Build initiated successfully!"
Write-Host ""
Write-Host "Check your EAS dashboard for build progress:"
Write-Host "https://expo.dev/accounts/veeraexe/projects/veera-mobile-control/builds"
Write-Host ""
Write-Host "Or run: npx eas build:list"
