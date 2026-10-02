@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Card Studio] 未检测到 Node.js。
  echo 请先安装 Node.js 18 或更高版本，然后重新双击此文件。
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo [Card Studio] 第一次启动，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8787"
echo [Card Studio] 正在启动，浏览器将自动打开...
call npm start
pause
