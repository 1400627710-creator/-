@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 正在安装 Node.js，本工具不需要额外账号或模型 Key。
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  echo 安装后请关闭此窗口，再次双击 START.cmd。若安装失败，请从 https://nodejs.org/ 下载 LTS 版。
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
call npm start
if errorlevel 1 goto failed
exit /b
:failed
echo 启动未完成。请保留报错，并把报错文本发给当前 ChatGPT；不要发送登录凭据。
pause
