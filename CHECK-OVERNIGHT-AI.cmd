@echo off
cd /d "%~dp0"
node "train\overnight-status.mjs"
pause
