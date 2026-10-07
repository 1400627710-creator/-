#!/usr/bin/env python3
"""Build readable, self-contained CMD entries; no companion file is needed for recovery."""
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]
MARKER = '# WRITER_POWERSHELL'

def launchers():
    script = (ROOT / 'scripts/windows-bootstrap.ps1').read_text(encoding='utf-8-sig').replace('\r\n', '\n')
    for filename, action in [('START.cmd', 'Start'), ('INSTALL-GPT.cmd', 'Install'), ('DIAGNOSE.cmd', 'Diagnose')]:
        # Read our own UTF-8 payload after the last marker. Paths travel through
        # environment variables, never through executable PowerShell source.
        header = f'''@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "WRITER_LAUNCH_DIR=%~dp0"
set "WRITER_BOOT_FILE=%~f0"
set "WRITER_ACTION={action}"
if /i "%~1"=="--check" set "WRITER_CHECK_ONLY=1"
"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:WRITER_BOOT_FILE,[Text.Encoding]::UTF8);$m='{MARKER}'; & ([scriptblock]::Create($s.Substring($s.LastIndexOf($m)+$m.Length)))"
set "WRITER_EXIT_CODE=%ERRORLEVEL%"
echo.
echo Exit code: %WRITER_EXIT_CODE%
echo This window keeps the result. Close it only after reading the message.
if "%WRITER_NONINTERACTIVE%"=="1" goto done
pause
:done
exit /b %WRITER_EXIT_CODE%
{MARKER}
'''
        yield ROOT / filename, (header + script).replace('\n', '\r\n').encode('utf-8')

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args = parser.parse_args()
    for target, body in launchers():
        if args.check:
            if target.read_bytes() != body: raise SystemExit('Stale launcher: ' + target.name)
        else: target.write_bytes(body)
    print('Self-contained Windows launchers verified.' if args.check else 'Self-contained Windows launchers generated.')

if __name__ == '__main__': main()
