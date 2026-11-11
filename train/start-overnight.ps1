$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venv = Join-Path $root '.ai-venv\Scripts\python.exe'
if (Test-Path $venv) {
    $python = $venv
    $arguments = '"train/overnight.py"'
    & $python -c 'import numpy' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'NumPy is missing. Run INSTALL-AI-TRAINING.cmd.' }
} else {
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if (-not $launcher) { throw 'Python launcher not found. Run INSTALL-AI-TRAINING.cmd.' }
    $python = $launcher.Source
    $arguments = '-3 "train/overnight.py"'
    & $python -3 -c 'import numpy' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'NumPy is missing. Run INSTALL-AI-TRAINING.cmd.' }
}
# Detached hidden Windows process. The Python supervisor logs to bot-memory.
$p = Start-Process -FilePath $python -WorkingDirectory $root -ArgumentList $arguments -WindowStyle Hidden -PassThru
Write-Host ("Overnight trainer launched, PID {0}." -f $p.Id)
Write-Host 'Game may remain open; learning only proceeds when nobody is connected.'
