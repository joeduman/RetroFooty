@echo off
cd /d "%~dp0"
echo Starting the AI comparison dashboard...
node tests/ai-dev-server.mjs --open
pause
