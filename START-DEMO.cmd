@echo off
cd /d "%~dp0"
if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
echo Di Chung - API http://localhost:4000 - App http://localhost:8081
call npm.cmd run dev
