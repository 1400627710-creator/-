param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $root
if((node -p "process.platform + '/' + process.arch") -ne 'win32/x64'){throw 'Build this package on native Windows x64.'}
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$staging=Join-Path ([IO.Path]::GetTempPath()) ('writer-windows-package-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($staging)|Out-Null
try {
 python scripts/build-windows-launchers.py --check
 if($LASTEXITCODE -ne 0){throw 'Self-contained launcher generation is stale.'}
 $sourceZip=Join-Path $staging 'source.zip'
 python scripts/package.py --output $sourceZip --manifest (Join-Path $staging 'source-manifest.json')
 if($LASTEXITCODE -ne 0){throw 'Source allowlist packaging failed.'}
 Expand-Archive -LiteralPath $sourceZip -DestinationPath (Join-Path $staging 'ready')
 $app=Join-Path $staging 'ready\author-writing'
 $npmCli=Join-Path (Split-Path -Parent (node -p 'process.execPath')) 'node_modules\npm\bin\npm-cli.js'
 node $npmCli ci --prefix $app --omit=dev --ignore-scripts --no-audit --no-fund
 if($LASTEXITCODE -ne 0){throw 'Production dependency install failed.'}
 $runtime=Join-Path $app 'runtime'
 [IO.Directory]::CreateDirectory($runtime)|Out-Null
 $nodePath=(node -p 'process.execPath')
 Copy-Item -LiteralPath $nodePath -Destination (Join-Path $runtime 'node.exe')
 $license=Join-Path (Split-Path -Parent $nodePath) 'LICENSE'
 if(!(Test-Path -LiteralPath $license)){throw 'Official Node distribution license is missing.'}
 Copy-Item -LiteralPath $license -Destination (Join-Path $runtime 'NODE-LICENSE.txt')
 $destination=[IO.Path]::GetFullPath($Output)
 python scripts/package-windows.py --app $app --output $destination
 if($LASTEXITCODE -ne 0){throw 'Portable Windows ZIP creation or CRC validation failed.'}
 # Verify delivery, not just the directory that existed before compression.
 $delivered=Join-Path $staging 'delivered'
 Expand-Archive -LiteralPath $destination -DestinationPath $delivered
 $deliveredApp=Join-Path $delivered 'author-writing'
 & (Join-Path $deliveredApp 'runtime\node.exe') (Join-Path $deliveredApp 'scripts\selfcheck.mjs') --output (Join-Path $staging 'packaged-selfcheck.json')
 if($LASTEXITCODE -ne 0){throw 'Packaged Windows runtime self-check failed.'}
 & (Join-Path $deliveredApp 'runtime\node.exe') (Join-Path $root 'tests\windows-launch.test.mjs') $deliveredApp $destination
 if($LASTEXITCODE -ne 0){throw 'Native Windows launcher checks failed.'}
 $hash=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText($destination+'.sha256',$hash+'  '+(Split-Path -Leaf $destination)+[Environment]::NewLine,(New-Object System.Text.UTF8Encoding($false)))
 Write-Host ('Final ZIP extracted and native launch verified: '+$destination+' SHA256 '+$hash)
} finally {Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue}
