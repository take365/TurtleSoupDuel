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

REM --- Optionally start Next.js frontend (requires Node.js 18+) ---
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [WARN] Node.js not found. Skipping Next.js frontend. Install Node.js 18+ to enable web UI.
) else (
  pushd web
  if not exist package.json (
    echo [INFO] web/ not initialized. Skipping Next.js.
  ) else (
    if not exist node_modules (
      echo [NPM] Installing web dependencies...
      call npm install || (
        echo [ERROR] npm install failed in web/.
        popd
        goto START_UVICORN
      )
    )
    echo [NEXT] Starting Next.js dev server at http://localhost:3000
    start "Next.js" cmd /k "npm run dev"
  )
  popd
)

REM Load .env is handled in app/main.py via python-dotenv
REM Optionally set default host/port if not provided in .env
if not defined HOST set HOST=0.0.0.0
if not defined PORT set PORT=8000

:
:START_UVICORN
echo [UVICORN] Launching at http://%HOST%:%PORT% (Ctrl+C to stop)
".venv\Scripts\python.exe" -m uvicorn app.main:app --host %HOST% --port %PORT% --reload

popd
endlocal
