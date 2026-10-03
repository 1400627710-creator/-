@echo off
setlocal
cd /d "%~dp0"
set "CARD_STUDIO_PORT=8793"
set "PORT=%CARD_STUDIO_PORT%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Card Studio] 未检测到 Node.js。
  echo 请先安装 Node.js 22 或更高版本，然后重新双击此文件。
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo.
  echo [Card Studio] 当前 Node.js 版本过旧。
  node --version
  echo 请安装 Node.js 22 或更高版本。
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [Card Studio] 第一次启动，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo.
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%CARD_STUDIO_PORT%/?v=2.2.0"
echo [Card Studio 2.2.0] 正在启动，新版专用端口 %CARD_STUDIO_PORT% ...
echo 浏览器打开后，顶部应显示“v2.2.0 · 自由布局版”。
call npm start
pause
