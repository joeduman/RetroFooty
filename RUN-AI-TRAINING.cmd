@echo off
cd /d "%~dp0"
if exist ".ai-venv\Scripts\python.exe" (
  ".ai-venv\Scripts\python.exe" "train\train.py" --cycles 1
) else (
  py -3 "train\train.py" --cycles 1
)
if errorlevel 1 echo Training stopped or could not start. Ensure Python and numpy are installed and no players are connected.
pause
