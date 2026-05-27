@echo off
cd /d "%~dp0"

:: Kill any previous Vite dev server on port 5173
netstat -ano | findstr ":5173.*LISTENING" >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173.*LISTENING"') do (
        echo Shutting down previous Vite instance [PID %%p]...
        taskkill /F /PID %%p >nul 2>&1
    )
    timeout /t 1 /nobreak >nul
)

:: Kill any previous Electron instance
tasklist /FI "IMAGENAME eq electron.exe" 2>nul | findstr "electron.exe" >nul 2>&1
if %errorlevel%==0 (
    echo Shutting down previous Electron instance...
    taskkill /F /IM electron.exe >nul 2>&1
    timeout /t 1 /nobreak >nul
)

:: Compile Electron main process TypeScript → .cjs
echo Building Electron...
call npm run build:electron
if %errorlevel% neq 0 (
    echo Electron build failed!
    pause
    exit /b 1
)

:: Start Vite dev server in background
start /b "" npx vite > nul 2>&1

:: Wait for Vite to be ready
echo Waiting for Vite dev server...
:waitloop
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":5173.*LISTENING" >nul 2>&1
if %errorlevel% neq 0 goto waitloop

:: Launch Electron
echo Launching DrumFord X...
npx electron .
