@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto no_folder
if not exist ".venv\Scripts\python.exe" goto try_py
".venv\Scripts\python.exe" -c "import sys; raise SystemExit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto venv_python
:try_py
py -3 -c "import sys; raise SystemExit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto py3
python -c "import sys; raise SystemExit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto python_path
echo 没有找到 Python 3.11 或更新版本。你已安装 3.14 时可运行：
echo py -V:3.14 diagnose.py
pause
exit /b 1
:venv_python
".venv\Scripts\python.exe" diagnose.py %*
goto finished
:py3
py -3 diagnose.py %*
goto finished
:python_path
python diagnose.py %*
goto finished
:finished
set "relay_diagnostic_exit=%errorlevel%"
echo.
echo 运行成功后，报告在本文件旁的 diagnostics 文件夹。
pause
exit /b %relay_diagnostic_exit%
:no_folder
echo 请先完整解压诊断工具，再运行 diagnose.bat。
pause
exit /b 1
