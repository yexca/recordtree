$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Error "uv was not found. Install uv, or run run-install.bat, which installs it into env\uv."
    exit 1
}

# uv uses the Python pinned in .python-version and builds .venv from uv.lock.
uv sync --locked --project $Root
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Environment is ready."
Write-Host "Run: .\.venv\Scripts\recordtree.exe init"
