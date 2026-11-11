@echo off
cd /d "%~dp0"
echo TEAMBALL BUILD 14 - INSTALL OPTIONAL AI TRAINING
where py >nul 2>nul
if errorlevel 1 (
 echo Python 3 is required. Install it from https://www.python.org/downloads/ and enable the py launcher.
 pause
 exit /b 1
)
py -3 -m venv .ai-venv
if errorlevel 1 (echo Could not create Python environment. & pause & exit /b 1)
".ai-venv\Scripts\python.exe" -m pip install -r "train\requirements.txt"
if errorlevel 1 (echo Installation failed. Game remains playable without AI training. & pause & exit /b 1)
echo AI training dependencies installed. The server will train during idle periods.
echo Restart Teamball if it is running, then check training status.
pause
