@echo off
cd /d "%~dp0"
title DrumFord Studio launcher

:: --- DrumFord Studio one-click launcher ---------------------------------
:: Opens DrumFord Studio (the MIDI->chart generator + piano-roll editor) in a
:: NATIVE desktop window (Electron) - not a browser tab. It starts the Vite
:: dev server on port 5273 in the background, then launches the window.
:: Close the window to quit; the dev server is shut down automatically.
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

:: Start the Studio Vite dev server in the background (no window)
echo Starting DrumFord Studio dev server...
start /b "" npx vite --config studio/vite.config.ts > nul 2>&1

:: Wait for Vite to be listening on 5273 (up to ~30s)
echo Waiting for the dev server...
set /a tries=0
:waitloop
timeout /t 1 /nobreak >nul
set /a tries+=1
netstat -ano | findstr ":5273.*LISTENING" >nul 2>&1
if %errorlevel%==0 goto ready
if %tries% geq 30 (
    echo Dev server did not come up after 30s. Aborting.
    goto cleanup
)
goto waitloop

:ready
:: Launch the native DrumFord Studio window (Electron). Blocks until closed.
echo Launching DrumFord Studio...
call npx electron studio/electron-main.cjs

:cleanup
:: Window closed (or aborted) - stop the background dev server.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5273.*LISTENING"') do taskkill /F /PID %%p >nul 2>&1
exit /b 0
