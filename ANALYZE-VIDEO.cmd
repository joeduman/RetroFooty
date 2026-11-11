@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Drag a locally saved Teamball gameplay MP4 onto ANALYZE-VIDEO.cmd.
  echo Or run: ANALYZE-VIDEO.cmd "C:\path\gameplay.mp4"
  echo Advanced: ANALYZE-VIDEO.cmd "C:\path\gameplay.mp4" --approve-for-training
  pause
  exit /b 1
)
if exist ".ai-venv\Scripts\python.exe" (
  ".ai-venv\Scripts\python.exe" "train\analyze_video.py" "%~1" %2
) else (
  py -3 "train\analyze_video.py" "%~1" %2
)
if errorlevel 1 echo Video analysis failed; check OpenCV installation and the MP4 format.
pause
