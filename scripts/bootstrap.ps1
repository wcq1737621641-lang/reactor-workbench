param([switch]$NoBrowser,[switch]$NoStart,[switch]$Offline,[switch]$Test,[switch]$Portable)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot

function Get-UsableNode([string]$Candidate){
 if(-not $Candidate -or -not (Test-Path -LiteralPath $Candidate)){return $null}
 try{
  $versionText=& $Candidate --version
  if($LASTEXITCODE -ne 0){return $null}
  $version=[version]($versionText.TrimStart('v'))
  if($version -ge [version]'22.9.0'){return $Candidate}
 }catch{}
 return $null
}

try{
 $nodePath=Get-UsableNode (Join-Path $projectRoot '.runtime/node.exe')
 if(-not $nodePath -and -not $Portable){
  $installed=Get-Command node.exe -ErrorAction SilentlyContinue
  if($installed){$nodePath=Get-UsableNode $installed.Source}
 }
 if(-not $nodePath -and (Test-Path -LiteralPath (Join-Path $projectRoot '.runtime'))){
  foreach($candidate in Get-ChildItem (Join-Path $projectRoot '.runtime') -Filter 'node-v24*-win-*' -Directory){
   $nodePath=Get-UsableNode (Join-Path $candidate.FullName 'node.exe')
   if($nodePath){break}
  }
 }
 if(-not $nodePath){
  if($Offline){throw 'No bundled or installed Node.js 22.9+ was found. Download the Windows portable release, or install Node.js 24 LTS.'}
  Write-Host 'Preparing portable Node.js 24 LTS from nodejs.org (first run only)...'
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $architecture=if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){'arm64'}else{'x64'}
  $index=Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 60
  $release=$index|Where-Object {$_.version -match '^v24\.' -and $_.lts}|Select-Object -First 1
  if(-not $release){throw 'Could not find an official Node.js 24 LTS release.'}
  $fileName='node-'+$release.version+'-win-'+$architecture+'.zip'
  $releaseUrl='https://nodejs.org/dist/'+$release.version+'/'
  $runtimeDirectory=Join-Path $projectRoot '.runtime'
  New-Item -ItemType Directory -Path $runtimeDirectory -Force|Out-Null
  $archive=Join-Path $runtimeDirectory $fileName
  Invoke-WebRequest -UseBasicParsing -Uri ($releaseUrl+$fileName) -OutFile $archive -TimeoutSec 300
  $sums=(Invoke-WebRequest -UseBasicParsing -Uri ($releaseUrl+'SHASUMS256.txt') -TimeoutSec 60).Content
  $matching=@($sums -split "`n"|Where-Object {$_ -match ('\s'+[regex]::Escape($fileName)+'\s*$')})
  if($matching.Count -ne 1){throw 'Official checksum entry was missing or ambiguous.'}
  $expected=($matching[0].Trim() -split '\s+')[0]
  $actual=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  if($expected -ne $actual){Remove-Item -LiteralPath $archive;throw 'Node.js checksum verification failed. Download was discarded.'}
  Expand-Archive -LiteralPath $archive -DestinationPath $runtimeDirectory -Force
  $nodePath=Get-UsableNode (Join-Path $runtimeDirectory ('node-'+$release.version+'-win-'+$architecture+'/node.exe'))
  if(-not $nodePath){throw 'Portable Node.js did not pass the version check.'}
 }
 Write-Host ('Node.js: '+(& $nodePath --version))
 if(-not (Test-Path -LiteralPath '.env')){Copy-Item -LiteralPath '.env.example' -Destination '.env';Write-Host 'Created .env. Optional AI service settings can be edited there.'}
 if($NoStart){Write-Host 'Setup complete. Run start.cmd to launch.';exit 0}
 if($Test){& $nodePath --test;exit $LASTEXITCODE}
 Write-Host 'Starting Reactor Workbench. Keep this window open; Ctrl+C stops the server.'
 $arguments=@('--env-file-if-exists=.env','src/launch.js')
 if(-not $NoBrowser){$arguments+='--open'}
 & $nodePath @arguments
 exit $LASTEXITCODE
}catch{
 Write-Host ('Startup failed: '+$_.Exception.Message) -ForegroundColor Red
 Write-Host 'See DEPLOY.md. Existing .env and HYSYS cases were not changed.'
 exit 1
}
