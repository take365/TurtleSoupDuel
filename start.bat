@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Change to the directory of this script (project root)
pushd %~dp0

echo [START] TurtleSoupDuel starting...

REM Create venv if missing
if not exist .venv\Scripts\python.exe (
  echo [VENV] Creating virtual environment...
  py -3 -m venv .venv || (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
  )
)

REM Upgrade pip and install dependencies if needed
echo [PIP] Ensuring pip and requirements are installed...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul 2>&1
".venv\Scripts\python.exe" -m pip install -r requirements.txt || (
  echo [ERROR] Failed to install requirements.
  pause
  exit /b 1
)

REM Load .env is handled in app/main.py via python-dotenv
REM Optionally set default host/port if not provided in .env
if not defined HOST set HOST=0.0.0.0
if not defined PORT set PORT=8000

echo [UVICORN] Launching at http://%HOST%:%PORT% (Ctrl+C to stop)
".venv\Scripts\python.exe" -m uvicorn app.main:app --host %HOST% --port %PORT% --reload

popd
endlocal
