@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto no_folder
py -3 -c "import sys; raise SystemExit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto py3
py -3.11 -c "import sys; raise SystemExit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto py311
python -c "import sys; raise SystemExit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto python_path
if not exist ".venv\Scripts\python.exe" goto no_python
".venv\Scripts\python.exe" -c "import sys; raise SystemExit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto venv_python
goto no_python
:py311
py -3.11 bootstrap.py %*
goto finished
:py3
py -3 bootstrap.py %*
goto finished
:python_path
python bootstrap.py %*
goto finished
:venv_python
".venv\Scripts\python.exe" bootstrap.py %*
goto finished
:finished
set "relay_exit=%errorlevel%"
if "%relay_exit%"=="0" goto close_window
echo.
echo 启动未完成。请保留上方报错；安装记录位于 .data\install.log。
:close_window
pause
exit /b %relay_exit%
:no_python
echo 请安装完整的 64 位 Python 3.11 或更新版本，安装时勾选 Add python.exe to PATH。
echo 下载地址：https://www.python.org/downloads/
echo 安装后关闭此窗口，重新双击 start.bat。
pause
exit /b 1
:no_folder
echo 无法打开项目文件夹，请先完整解压 ZIP 再启动。
pause
exit /b 1
