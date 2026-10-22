@echo off
setlocal
chcp 65001 >nul
title 车卡机启动器
set "ARCHIVE_START_FILE=%~dp0..\gpt-baseline-1.0\novel-archive\Novel-Archive.html"
if not exist "%ARCHIVE_START_FILE%" (
  echo 未找到车卡机页面。
  echo 请先将完整下载包全部解压，再运行车卡机启动器。
  echo 启动器文件夹应与 gpt-baseline-1.0 文件夹放在同一目录。
  pause
  exit /b 1
)
start "" "%ARCHIVE_START_FILE%"
if errorlevel 1 (
  echo 无法打开车卡机。请用 Edge 或 Chrome 打开对应的 HTML 文件。
  pause
  exit /b 1
)
exit /b 0
