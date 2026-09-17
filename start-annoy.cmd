@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing...
  call npm install
)
set FLY_FLAVOR=annoy
call npx electron .
