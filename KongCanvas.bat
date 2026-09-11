@echo off
setlocal
title KongCanvas

cd /d "%~dp0"
if errorlevel 1 (
    echo Failed to enter the KongCanvas directory.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed or is not available in PATH.
    pause
    exit /b 1
)

echo Starting KongCanvas local proxy...
start "KongCanvas Proxy" /b node "%~dp0canvas-proxy\index.js" --host 127.0.0.1 --port 23210

cd /d "%~dp0web"
if errorlevel 1 (
    echo Failed to enter the web directory.
    pause
    exit /b 1
)

where bun >nul 2>&1
if errorlevel 1 (
    echo Bun is not installed or is not available in PATH.
    echo Install Bun first, then run this script again.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing web dependencies...
    bun install
    if errorlevel 1 (
        echo Dependency installation failed.
        pause
        exit /b 1
    )
)

echo Starting KongCanvas web development server...
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3099/'"
bun run dev

exit /b %errorlevel%
