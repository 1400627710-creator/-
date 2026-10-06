@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
if not exist "%~dp0diagnose.bat" goto missing
call "%~dp0diagnose.bat" %*
exit /b %errorlevel%
:missing
echo 自检文件不完整。请先完整解压下载包，再双击“一键自检.bat”。
pause
exit /b 1
