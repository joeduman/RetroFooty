@echo off
cd /d "%~dp0"
node bot-memory-tool.mjs status
if exist "bot-memory\neural-training-status.json" type "bot-memory\neural-training-status.json"
pause
