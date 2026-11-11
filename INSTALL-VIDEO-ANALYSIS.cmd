@echo off
setlocal
cd /d "%~dp0"
if not exist ".ai-venv\Scripts\python.exe" (
 echo First run INSTALL-AI-TRAINING.cmd to install Python training environment.
 pause
 exit /b 1
)
".ai-venv\Scripts\python.exe" -m pip install opencv-python-headless
if errorlevel 1 (echo Installation failed. & pause & exit /b 1)
echo Video review dependency installed. Drag your gameplay MP4 onto ANALYZE-VIDEO.cmd.
pause
