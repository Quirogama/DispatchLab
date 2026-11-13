@echo off
setlocal
cd /d "%~dp0"

echo Starting DispatchLab in watch mode...
where docker >nul 2>&1
if errorlevel 1 (
    echo Docker was not found. Install Docker Desktop and try again.
    pause
    exit /b 1
)

docker compose watch
if errorlevel 1 (
    echo.
    echo DispatchLab watch mode could not start. Make sure Docker Desktop is running.
    pause
)
