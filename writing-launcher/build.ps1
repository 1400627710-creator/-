param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher=Join-Path $root 'writing-assistant\START.cmd'
$payload=[IO.File]::ReadAllText($launcher,[Text.Encoding]::UTF8)
# The EXE supplies its original folder even though its private CMD is elsewhere.
foreach($line in @('set "WRITER_LAUNCH_DIR=%~dp0"','set "WRITER_ACTION=Start"')){
 if(!$payload.Contains($line)){throw ('Unexpected embedded launcher source: '+$line)}
 $variable=if($line.Contains('WRITER_LAUNCH_DIR')){'WRITER_LAUNCH_DIR'}else{'WRITER_ACTION'}
 $payload=$payload.Replace($line,('if not defined '+$variable+' '+$line))
}
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Launcher.cs'),[Text.Encoding]::UTF8).Replace('@EMBEDDED_CMD@',$encoded)
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('writer-launcher-build-'+[guid]::NewGuid().ToString('N')+'.cs')
$destination=[IO.Path]::GetFullPath($Output)
[IO.Directory]::CreateDirectory((Split-Path -Parent $destination))|Out-Null
try{
 [IO.File]::WriteAllText($temporary,$source,(New-Object Text.UTF8Encoding($true)))
 $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
 if(!(Test-Path -LiteralPath $compiler)){throw 'Windows .NET Framework C# compiler not found.'}
 & $compiler /nologo /target:winexe /platform:anycpu /optimize+ /utf8output /r:System.dll /r:System.Core.dll /r:System.Windows.Forms.dll ('/out:'+$destination) $temporary
 if($LASTEXITCODE -ne 0){throw 'Native launcher compilation failed.'}
 $hash=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText($destination+'.sha256',$hash+'  '+(Split-Path -Leaf $destination)+[Environment]::NewLine,(New-Object Text.UTF8Encoding($false)))
 Write-Host ('Native EXE built: '+$destination+' SHA256 '+$hash)
}finally{Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue}
