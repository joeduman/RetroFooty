@echo off
cd /d "%~dp0"
if exist ".ai-venv\Scripts\python.exe" (
  ".ai-venv\Scripts\python.exe" "train\overnight.py"
) else (
  py -3 "train\overnight.py"
)
echo.
echo Overnight training finished. See bot-memory\overnight-training.log.
pause
