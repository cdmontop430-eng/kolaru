# EAS Build Script - Start build and exit
$env:CI = "1"
& npx eas build --platform android --profile preview --no-wait
