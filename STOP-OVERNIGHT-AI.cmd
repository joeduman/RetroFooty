@echo off
cd /d "%~dp0"
if not exist "bot-memory" mkdir "bot-memory"
echo stop> "bot-memory\overnight-stop.flag"
echo Stop requested. Current training cycle will stop at its next safe checkpoint.
echo Your AI models, saved learning, and replay archive will remain intact.
pause
