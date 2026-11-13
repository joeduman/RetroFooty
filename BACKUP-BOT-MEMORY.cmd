@echo off
cd /d "%~dp0"
if not exist "bot-memory" (echo No bot-memory folder exists yet. Start RetroFooty once. & pause & exit /b 1)
tar -a -cf "bot-memory-backup.zip" "bot-memory"
if errorlevel 1 (echo Backup failed. & pause & exit /b 1)
echo Created bot-memory-backup.zip including replays and learned policy.
pause
