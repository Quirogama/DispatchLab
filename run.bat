@echo off
setlocal
cd /d "%~dp0"

echo Starting DispatchLab...
where docker >nul 2>&1
if errorlevel 1 (
    echo Docker was not found. Install Docker Desktop and try again.
    pause
    exit /b 1
)

docker compose up --build
if errorlevel 1 (
    echo.
    echo DispatchLab could not start. Make sure Docker Desktop is running.
    pause
)
