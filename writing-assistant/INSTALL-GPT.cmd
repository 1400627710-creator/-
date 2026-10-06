@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先双击 START.cmd 完成 Node.js 安装，再运行本文件。
  pause
  exit /b
)
if not exist node_modules\@modelcontextprotocol\sdk (
  call npm ci --ignore-scripts
  if errorlevel 1 goto failed
)
if not exist dist\main.js (
  call npm run build
  if errorlevel 1 goto failed
)
node scripts\setup.mjs
if errorlevel 1 goto failed
pause
exit /b
:failed
echo 安装文件准备失败。请把报错文本发给当前 ChatGPT。
pause
