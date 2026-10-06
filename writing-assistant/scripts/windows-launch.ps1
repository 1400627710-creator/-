param([ValidateSet('Start','Install','Diagnose')][string]$Action='Start')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Set-StrictMode -Version 2.0
$script:LogFile=$null
$utf8=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=$utf8
$OutputEncoding=$utf8

function Write-Stage([string]$Message) {
 $line='['+[DateTime]::UtcNow.ToString('o')+'] '+$Message
 Write-Host $line
 if ($script:LogFile) { [IO.File]::AppendAllText($script:LogFile,$line+[Environment]::NewLine,$utf8) }
}
function Find-SupportedNode {
 $candidates=New-Object System.Collections.Generic.List[string]
 $candidates.Add((Join-Path $script:Root 'runtime\node.exe'))
 foreach($base in @($env:ProgramFiles,$env:LOCALAPPDATA)) {
  if($base) { $candidates.Add((Join-Path $base 'nodejs\node.exe'));$candidates.Add((Join-Path $base 'Programs\nodejs\node.exe')) }
 }
 foreach($command in @(Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue)) { $candidates.Add($command.Source) }
 foreach($candidate in ($candidates | Select-Object -Unique)) {
  if(Test-Path -LiteralPath $candidate -PathType Leaf) {
   $oldPreference=$ErrorActionPreference
   try { $ErrorActionPreference='Continue';$version=(& $candidate --version 2>$null | Out-String).Trim();$code=$LASTEXITCODE }
   finally { $ErrorActionPreference=$oldPreference }
   if($code -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { Write-Stage ('使用 Node.js '+$version);return $candidate }
   Write-Stage ('跳过无法使用或过旧的 Node.js：'+$candidate)
  }
 }
 return $null
}
function Invoke-Native([string]$Executable,[string[]]$Arguments) {
 $previous=$ErrorActionPreference
 try { $ErrorActionPreference='Continue'; & $Executable @Arguments; $code=$LASTEXITCODE }
 finally { $ErrorActionPreference=$previous }
 if($code -ne 0) { throw ('[PROCESS_FAILED] 进程退出码：'+$code) }
}
try {
 $script:Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
 Set-Location -LiteralPath $script:Root
 $base=$env:LOCALAPPDATA;if(!$base){$base=[IO.Path]::GetTempPath()}
 $logs=Join-Path $base 'AuthorWriting\logs'
 try{[IO.Directory]::CreateDirectory($logs)|Out-Null}catch{$logs=Join-Path ([IO.Path]::GetTempPath()) 'AuthorWriting\logs';[IO.Directory]::CreateDirectory($logs)|Out-Null}
 $script:LogFile=Join-Path $logs ('launcher-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+$PID+'.txt')
 Write-Stage ('小说码字助手 0.1.1；日志：'+$script:LogFile)
 if(!(Test-Path -LiteralPath (Join-Path $script:Root 'scripts\launcher.mjs'))) {throw '[ARCHIVE_INCOMPLETE] 请完整解压压缩包，不要只提取启动器。'}
 $node=Find-SupportedNode
 if(!$node) {
  if($env:WRITER_SKIP_NODE_INSTALL -eq '1') {throw '[NODE_MISSING] 未找到 Node.js 22 或更高版本。'}
  $winget=Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue
  if(!$winget){throw '[NODE_MISSING] 未找到 Node.js 或 winget。请下载 Windows 完整包，或从 https://nodejs.org/ 安装 LTS。'}
  Write-Stage '正在安装 Node.js LTS，完成后继续启动。系统可能显示安装许可窗口。'
  $oldPreference=$ErrorActionPreference
  try {$ErrorActionPreference='Continue'; & $winget.Source install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity 2>&1 | ForEach-Object {Write-Stage ($_.ToString())} }
  finally {$ErrorActionPreference=$oldPreference}
  $node=Find-SupportedNode
  if(!$node){throw '[NODE_INSTALL_FAILED] Node.js 安装未完成；请保留日志，或改用 Windows 完整包。'}
 }
 $env:PATH=(Split-Path -Parent $node)+';'+$env:PATH
 $env:WRITER_LAUNCH_LOG=$script:LogFile
 $launchArguments=@((Join-Path $script:Root 'scripts\launcher.mjs'))
 if($Action -eq 'Install'){$launchArguments+='--install'}
 elseif($Action -eq 'Diagnose' -or $env:WRITER_CHECK_ONLY -eq '1'){$launchArguments+='--check'}
 Invoke-Native $node $launchArguments
 Write-Stage '本次操作已完成。窗口会保留结果。'
 exit 0
} catch {
 Write-Stage ('启动或安装失败：'+$_.Exception.Message)
 Write-Host '请把上面的错误码或诊断日志提供给当前 ChatGPT。无需提供密码或模型 Key。'
 exit 1
}
