@echo off
REM Set environment variables if needed
REM set CLAUDE_CLI_PATH=C:\custom\path\to\claude.exe

REM Get the directory of this script
SET SCRIPT_DIR=%~dp0

REM Start the server with the correct path
node "%SCRIPT_DIR%dist\container-server.js"