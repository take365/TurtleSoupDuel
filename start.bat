@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Change to the directory of this script (project root)
pushd %~dp0

echo [START] TurtleSoupDuel starting...

set "ROOT_DIR=%CD%"
set "LOG_DIR=%ROOT_DIR%\logs"
if not exist "%LOG_DIR%" (
  mkdir "%LOG_DIR%"
)
set "WEB_DIR=%ROOT_DIR%\web"
set "NEXT_LOG=%LOG_DIR%\next-dev.log"
set "FASTAPI_LOG=%LOG_DIR%\fastapi.log"

set "VENV_DIR=%~dp0.venv_win"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "OLD_VENV=%~dp0.venv"
if exist "%OLD_VENV%" (
  echo [VENV] Removing WSL virtualenv (.venv)
  rmdir /S /Q "%OLD_VENV%" >nul 2>&1
)
if exist "%VENV_DIR%\pyvenv.cfg" (
  findstr /C:"version = 3.11" "%VENV_DIR%\pyvenv.cfg" >nul 2>&1
  if errorlevel 1 (
    echo [VENV] Recreating .venv_win with Python 3.11...
    rmdir /S /Q "%VENV_DIR%"
  )
)


echo [PIP] Ensuring pip and requirements are installed...
"%VENV_PY%" -m pip install --upgrade pip >nul 2>&1
"%VENV_PY%" -m pip install -r requirements.txt || (
  echo [ERROR] Failed to install requirements.
  pause
  exit /b 1
)

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
    powershell -Command "Add-Content -Path $env:NEXT_LOG -Value ('--- Next.js dev start ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ---')"
    echo [NEXT] Starting Next.js dev server at http://localhost:3000 (logging to %NEXT_LOG%)
    start "Next.js" powershell -NoExit -Command "& { Set-Location -LiteralPath '%WEB_DIR%'; npm run dev 2>&1 | Tee-Object -FilePath $env:NEXT_LOG -Append }"
  )
  popd
)

if not defined HOST set HOST=0.0.0.0
if not defined PORT set PORT=8000

:START_UVICORN
powershell -Command "Add-Content -Path $env:FASTAPI_LOG -Value ('--- FastAPI start ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ---')"
echo [UVICORN] Launching at http://%HOST%:%PORT% (Ctrl+C to stop, logging to %FASTAPI_LOG%)
"%VENV_PY%" -m uvicorn app.main:app --host %HOST% --port %PORT% --reload 2>&1 | powershell -Command "$input | Tee-Object -FilePath $env:FASTAPI_LOG -Append"

popd
endlocal
