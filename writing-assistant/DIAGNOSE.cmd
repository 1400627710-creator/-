@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "WRITER_LAUNCH_DIR=%~dp0"
set "WRITER_BOOT_FILE=%~f0"
set "WRITER_ACTION=Diagnose"
if /i "%~1"=="--check" set "WRITER_CHECK_ONLY=1"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:WRITER_BOOT_FILE,[Text.Encoding]::UTF8);$m='# WRITER_POWERSHELL'; & ([scriptblock]::Create($s.Substring($s.LastIndexOf($m)+$m.Length)))"
set "WRITER_EXIT_CODE=%ERRORLEVEL%"
echo.
echo Exit code: %WRITER_EXIT_CODE%
echo This window keeps the result. Close it only after reading the message.
if "%WRITER_NONINTERACTIVE%"=="1" goto done
pause
:done
exit /b %WRITER_EXIT_CODE%
# WRITER_POWERSHELL
$ErrorActionPreference='Stop'
$utf8=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=$utf8
$OutputEncoding=$utf8
$temporary=$null
function Find-App([string]$Base) {
 if(!$Base){return $null}
 foreach($candidate in @($Base,(Join-Path $Base 'author-writing'))) {
  if(Test-Path -LiteralPath (Join-Path $candidate 'scripts\windows-launch.ps1') -PathType Leaf){return $candidate}
 }
 return $null
}
try {
 $cache=$env:WRITER_RECOVERY_DIR
 if(!$cache){
  $base=$env:LOCALAPPDATA;if(!$base){$base=[IO.Path]::GetTempPath()}
  $cache=Join-Path $base 'AuthorWritingProgram'
 }
 $cache=[IO.Path]::GetFullPath($cache)
 $pointer=Join-Path $cache 'current.txt'
 $app=Find-App $env:WRITER_LAUNCH_DIR
 $zip=$env:WRITER_PACKAGE_FILE
 if(!$app -and !$zip -and (Test-Path -LiteralPath $pointer -PathType Leaf)){
  $saved=[IO.Path]::GetFullPath([IO.File]::ReadAllText($pointer).Trim())
  if($saved.StartsWith($cache+'\',[StringComparison]::OrdinalIgnoreCase)){$app=Find-App $saved}
 }
 if(!$app){
  Write-Host '[RECOVERY] 启动器缺少配套程序，正在准备从完整 ZIP 恢复。'
  if(!$zip){
   if($env:WRITER_NONINTERACTIVE -eq '1'){throw '[ARCHIVE_INCOMPLETE] No companion scripts or selected full ZIP.'}
   Add-Type -AssemblyName System.Windows.Forms
   $dialog=New-Object Windows.Forms.OpenFileDialog
   $dialog.Title='请选择已下载的小说码字助手 Windows 完整 ZIP'
   $dialog.Filter='Windows 完整包 (*.zip)|*.zip'
   try{if($dialog.ShowDialog() -ne 'OK'){throw '[PACKAGE_NOT_SELECTED] 未选择完整 ZIP；程序尚未启动。'};$zip=$dialog.FileName}
   finally{$dialog.Dispose()}
  }
  if(!(Test-Path -LiteralPath $zip -PathType Leaf)){throw '[PACKAGE_NOT_FOUND] Selected ZIP does not exist.'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $temporary=Join-Path $cache ('package-'+[guid]::NewGuid().ToString('N'))
  [IO.Directory]::CreateDirectory($temporary)|Out-Null
  $archive=[IO.Compression.ZipFile]::OpenRead($zip)
  try{
   foreach($entry in $archive.Entries){
    # Accept the old Windows backslash ZIP as well as the standard new package.
    $name=$entry.FullName.Replace('\','/')
    if(!$name.StartsWith('author-writing/') -or $name -match '(^|/)\.\.?(/|$)|:'){throw '[PACKAGE_INVALID] Unsafe or unexpected ZIP entry.'}
    if($name.EndsWith('/')){continue}
    $target=[IO.Path]::GetFullPath((Join-Path $temporary $name.Replace('/','\')))
    if(!$target.StartsWith($temporary+'\',[StringComparison]::OrdinalIgnoreCase)){throw '[PACKAGE_INVALID] ZIP entry outside program directory.'}
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
   }
  }finally{$archive.Dispose()}
  $app=Find-App $temporary
  if(!$app){throw '[ARCHIVE_INCOMPLETE] Selected ZIP has no Windows launch script.'}
  foreach($required in @('package.json','package-lock.json','dist\main.js','dist\editor.html','runtime\node.exe','node_modules\zod\package.json')){
   if(!(Test-Path -LiteralPath (Join-Path $app $required) -PathType Leaf)){throw ('[ARCHIVE_INCOMPLETE] Full Windows ZIP is missing: '+$required)}
  }
  [IO.File]::WriteAllText($pointer,$app,$utf8)
  $temporary=$null
  Write-Host ('[RECOVERED] 完整程序已恢复到：'+$app)
 }
 Write-Host ('[PROGRAM] '+$app)
 & (Join-Path $app 'scripts\windows-launch.ps1') -Action $env:WRITER_ACTION
 exit $LASTEXITCODE
}catch{
 Write-Host ('启动失败：'+$_.Exception.Message)
 if($temporary){Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue}
 Write-Host '请保留以上错误信息。无需密码或模型 Key。'
 exit 1
}
