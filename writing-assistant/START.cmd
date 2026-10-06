@echo off
setlocal
cd /d "%~dp0"
if /i "%~1"=="--check" set "WRITER_CHECK_ONLY=1"
if not exist "%~dp0scripts\windows-launch.ps1" goto incomplete
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-launch.ps1" -Action Start
set "WRITER_EXIT_CODE=%ERRORLEVEL%"
goto finish
:incomplete
echo [ARCHIVE_INCOMPLETE] Extract the entire ZIP before running this file.
set "WRITER_EXIT_CODE=1"
:finish
echo.
echo Exit code: %WRITER_EXIT_CODE%
echo This window keeps the result. Close it only after reading the message.
if "%WRITER_NONINTERACTIVE%"=="1" goto done
pause
:done
exit /b %WRITER_EXIT_CODE%
