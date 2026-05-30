@echo off
cd /d "%~dp0"
title DrumFord Studio launcher

:: --- DrumFord Studio one-click launcher ---------------------------------
:: Browser-first companion app (the MIDI->chart generator + piano-roll
:: editor). Unlike the player's start.bat there is NO Electron step: this
:: starts the Studio Vite dev server (port 5273) and opens your browser.
:: To stop it, close the "DrumFord Studio - dev server" window that opens.
:: ------------------------------------------------------------------------

:: Kill any previous Studio Vite dev server on port 5273
netstat -ano | findstr ":5273.*LISTENING" >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5273.*LISTENING"') do (
        echo Shutting down previous Studio dev server [PID %%p]...
        taskkill /F /PID %%p >nul 2>&1
    )
    timeout /t 1 /nobreak >nul
)

:: Start the Studio Vite dev server in its own window (close it to stop)
echo Starting DrumFord Studio dev server...
start "DrumFord Studio - dev server (close this window to stop)" cmd /k "npm run dev:studio"

:: Wait for Vite to be listening on 5273 (up to ~30s), then open the browser
echo Waiting for the dev server to come up...
set /a tries=0
:waitloop
timeout /t 1 /nobreak >nul
set /a tries+=1
netstat -ano | findstr ":5273.*LISTENING" >nul 2>&1
if %errorlevel%==0 goto ready
if %tries% geq 30 (
    echo Dev server did not report ready after 30s - opening anyway.
    goto ready
)
goto waitloop

:ready
echo Opening DrumFord Studio at http://localhost:5273 ...
start "" http://localhost:5273
exit /b 0
