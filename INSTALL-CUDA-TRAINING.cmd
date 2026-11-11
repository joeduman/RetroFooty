@echo off
cd /d "%~dp0"
echo Optional NVIDIA CUDA training for Teamball 15
if not exist ".ai-venv\Scripts\python.exe" (
 py -3 -m venv .ai-venv
 if errorlevel 1 (echo Install Python 3 first. & pause & exit /b 1)
)
".ai-venv\Scripts\python.exe" -m pip install -r train\requirements.txt
if errorlevel 1 (pause & exit /b 1)
rem Use the official PyTorch wheel index. Override for a different GPU/driver.
rem Example: set TEAMBALL_TORCH_INDEX=https://download.pytorch.org/whl/cu128
if not defined TEAMBALL_TORCH_INDEX set "TEAMBALL_TORCH_INDEX=https://download.pytorch.org/whl/cu126"
".ai-venv\Scripts\python.exe" -m pip install --upgrade torch --index-url "%TEAMBALL_TORCH_INDEX%"
if errorlevel 1 (echo Check https://pytorch.org/get-started/locally/ for your GPU and Python version. & pause & exit /b 1)
".ai-venv\Scripts\python.exe" train\check_device.py
if errorlevel 1 (echo CPU fallback is still available. Check your NVIDIA driver and PyTorch build. & pause & exit /b 1)
echo CUDA ready. Auto mode uses it for the next training cycle.
pause
