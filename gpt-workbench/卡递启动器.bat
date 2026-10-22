@echo off
chcp 65001 >nul
setlocal
title 卡递启动器
set "workbench_file=%~dp0cardstudio\CardStudio-Local.html"
if not exist "%workbench_file%" (
  echo 找不到卡递文件。请先完整解压，保留文件夹结构。
  pause
  exit /b 1
)
start "" "%workbench_file%"
if errorlevel 1 (
  echo 打开失败。请用 Chrome 或 Edge 手动打开对应 HTML 文件。
  pause
  exit /b 1
)
endlocal
