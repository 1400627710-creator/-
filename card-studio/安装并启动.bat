@echo off
setlocal
chcp 65001 >nul
title Card Studio 安装并启动
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto installnode

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 goto installnode
goto nodeok

:installnode
echo.
echo [Card Studio] 正在安装 Node.js 22+ ...
where winget >nul 2>nul
if errorlevel 1 (
  echo.
  echo 当前 Windows 没有检测到 winget，无法自动安装 Node.js。
  echo 将打开 Node.js 官方下载页，请安装 Node.js 22 或更高版本后重新双击本文件。
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo.
  echo Node.js 自动安装失败，请检查网络后重试。
  pause
  exit /b 1
)
set "PATH=%PATH%;C:\Program Files\nodejs"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 已安装，但当前终端还未刷新。
  echo 请关闭此窗口后，再双击一次“安装并启动.bat”。
  pause
  exit /b 1
)

:nodeok
if not exist node_modules (
  echo.
  echo [Card Studio] 正在安装程序依赖...
  call npm install
  if errorlevel 1 (
    echo.
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo.
echo [Card Studio] 正在启动...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8787"
call npm start
pause
