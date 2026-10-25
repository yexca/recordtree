@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "UV_VERSION=0.13.5"
set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "ENV_DIR=%ROOT_DIR%\env"

set "LOCAL_UV_DIR=%ENV_DIR%\uv"
set "LOCAL_UV=%LOCAL_UV_DIR%\uv.exe"
set "VENV_DIR=%ROOT_DIR%\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "RECORDTREE_EXE=%VENV_DIR%\Scripts\recordtree.exe"
set "UV_INSTALLER_URL=https://astral.sh/uv/%UV_VERSION%/install.ps1"

rem A Python that uv has to download goes into env\python, next to env\uv.
set "UV_PYTHON_INSTALL_DIR=%ENV_DIR%\python"

echo [RecordTree] Preparing local environment...
if not exist "%ENV_DIR%" mkdir "%ENV_DIR%"

if exist "%LOCAL_UV%" (
    set "UV=%LOCAL_UV%"
    goto :sync
)

for /f "delims=" %%P in ('where uv 2^>nul') do if not defined UV set "UV=%%P"
if defined UV echo [RecordTree] Found uv: %UV%
if defined UV goto :sync

echo [RecordTree] uv was not found. Installing uv %UV_VERSION% into env\uv...
call :install_uv || exit /b 1
set "UV=%LOCAL_UV%"

:sync
rem uv uses the Python pinned in .python-version, installing it when missing,
rem and builds .venv from uv.lock.
echo [RecordTree] Installing project dependencies locally...
"%UV%" sync --locked --project "%ROOT_DIR%"
if errorlevel 1 (
    echo [RecordTree] uv sync failed.
    exit /b 1
)

echo [RecordTree] Initializing config and database...
"%RECORDTREE_EXE%" init
if errorlevel 1 exit /b 1

echo.
echo [RecordTree] Environment is ready.
echo Python: %VENV_PYTHON%
echo Run: "%RECORDTREE_EXE%" doctor
echo Run: "%RECORDTREE_EXE%" import
exit /b 0

:install_uv
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $env:UV_UNMANAGED_INSTALL = '%LOCAL_UV_DIR%'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-RestMethod -Uri '%UV_INSTALLER_URL%' | Invoke-Expression"
if errorlevel 1 (
    echo [RecordTree] Failed to install uv from:
    echo %UV_INSTALLER_URL%
    exit /b 1
)
if not exist "%LOCAL_UV%" (
    echo [RecordTree] The uv installer completed, but uv.exe was not found at:
    echo %LOCAL_UV%
    exit /b 1
)
exit /b 0
