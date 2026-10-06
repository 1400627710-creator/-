@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
if not exist "%~dp0start.bat" goto missing
call "%~dp0start.bat" %*
exit /b %errorlevel%
:missing
echo 启动文件不完整。请右键下载的 ZIP，选择“全部解压”，再双击“启动中继器.bat”。
pause
exit /b 1
