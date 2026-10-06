@echo off
chcp 65001 >nul
title 连接 ChatGPT 中继器工具
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" goto missing
start "中继器服务" cmd /k call "%~dp0启动中继器.bat"
echo 首次连接需要你自己的官方 Tunnel ID 和隧道运行凭据。
echo 凭据会隐藏输入，只在本机保存；不要粘贴到聊天或 GitHub。
".venv\Scripts\python.exe" -X utf8 tool_connect.py
set "relay_tool_exit=%errorlevel%"
pause
exit /b %relay_tool_exit%
:missing
echo 请先完整解压新 ZIP，双击“启动中继器.bat”完成安装，再运行本启动器。
pause
exit /b 1
