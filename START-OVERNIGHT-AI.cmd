@echo off
setlocal
cd /d "%~dp0"
echo Starting Teamball overnight learning in the background...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0train\start-overnight.ps1"
if errorlevel 1 (
  echo Could not start. Run INSTALL-AI-TRAINING.cmd to install Python and NumPy.
  pause
  exit /b 1
)
echo Use CHECK-OVERNIGHT-AI.cmd to see progress or STOP-OVERNIGHT-AI.cmd to end training.
