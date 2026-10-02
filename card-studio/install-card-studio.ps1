$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Write-Host ""
Write-Host "=== Card Studio 一键安装 ===" -ForegroundColor Cyan
Write-Host ""

$installDir = Join-Path $env:LOCALAPPDATA "CardStudio"
$tempRoot = Join-Path $env:TEMP ("cardstudio-install-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tempRoot "cardstudio.zip"
$extractDir = Join-Path $tempRoot "src"
$repoZip = "https://github.com/1400627710-creator/-/archive/refs/heads/main.zip"

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Get-NodeMajor {
  try {
    $v = (& node -p "process.versions.node.split('.')[0]" 2>$null)
    if ($LASTEXITCODE -eq 0 -and $v) { return [int]$v }
  } catch {}
  return 0
}

$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 22) {
  Write-Host "正在安装 Node.js 22+ ..." -ForegroundColor Yellow
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Host "系统中没有 winget，正在打开 Node.js 下载页面。" -ForegroundColor Yellow
    Start-Process "https://nodejs.org/"
    Write-Host "请安装 Node.js 22 或更高版本后，再重新运行本安装器。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
  }

  & winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Node.js 自动安装失败。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
  }
  Refresh-Path
  $nodeMajor = Get-NodeMajor
}

if ($nodeMajor -lt 22) {
  Write-Host "Node.js 版本仍低于 22，无法继续。" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

Write-Host "Node.js 已就绪。" -ForegroundColor Green
Write-Host "正在下载 Card Studio 最新版..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $repoZip -OutFile $zipPath -UseBasicParsing
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$package = Get-ChildItem -Path $extractDir -Filter "package.json" -Recurse |
  Where-Object { $_.FullName -match "[\\/]card-studio[\\/]package\.json$" } |
  Select-Object -First 1

if (-not $package) {
  throw "下载包中没有找到 card-studio/package.json。"
}

$sourceDir = Split-Path $package.FullName -Parent
$envBackup = $null
if (Test-Path (Join-Path $installDir ".env")) {
  $envBackup = Get-Content (Join-Path $installDir ".env") -Raw
}

if (Test-Path $installDir) {
  Remove-Item $installDir -Recurse -Force
}
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item (Join-Path $sourceDir "*") $installDir -Recurse -Force

if ($envBackup) {
  Set-Content -Path (Join-Path $installDir ".env") -Value $envBackup -Encoding UTF8
}

Write-Host "正在安装程序依赖..." -ForegroundColor Yellow
Push-Location $installDir
try {
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install 失败。" }
} finally {
  Pop-Location
}

$startBat = Join-Path $installDir "启动卡牌工具.bat"
if (-not (Test-Path $startBat)) {
  throw "启动文件缺失。"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Card Studio.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $startBat
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = "卡牌组装流水线"
$shortcut.Save()

$uninstall = @'
@echo off
setlocal
echo 正在卸载 Card Studio...
taskkill /F /IM node.exe >nul 2>nul
rmdir /S /Q "%LOCALAPPDATA%\CardStudio"
del /Q "%USERPROFILE%\Desktop\Card Studio.lnk" >nul 2>nul
echo 已卸载。
pause
'@
Set-Content -Path (Join-Path $installDir "卸载CardStudio.bat") -Value $uninstall -Encoding Default

Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Card Studio 安装完成。" -ForegroundColor Green
Write-Host "安装位置：$installDir"
Write-Host "桌面快捷方式：Card Studio"
Write-Host ""
Write-Host "正在启动..." -ForegroundColor Cyan
Start-Process -FilePath $startBat
