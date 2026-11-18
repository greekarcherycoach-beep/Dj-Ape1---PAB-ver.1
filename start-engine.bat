@echo off
rem Dj Ape1 Streaming Engine – requires Node.js and ffmpeg.exe in PATH
cd /d "%~dp0"
:loop
node engine\server.js
echo Engine stopped, restarting in 5s...
timeout /t 5 >nul
goto loop
