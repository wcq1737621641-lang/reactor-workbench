param([string]$OutputDirectory=(Join-Path $PSScriptRoot '../dist'),[string]$NodePath)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
if(-not $NodePath){$NodePath=(Get-Command node.exe -ErrorAction Stop).Source}
if((& $NodePath -p 'process.arch') -ne 'x64'){throw 'This release script requires a Windows x64 Node.js binary.'}
$signature=Get-AuthenticodeSignature -LiteralPath $NodePath
if($signature.Status -ne 'Valid'){throw 'Bundled node.exe must have a valid Authenticode signature.'}
New-Item -ItemType Directory -Path $OutputDirectory -Force|Out-Null
$archive=[IO.Path]::GetFullPath((Join-Path $OutputDirectory 'reactor-workbench-windows-x64.zip'))
& git archive --format=zip ('--output='+$archive) HEAD
if($LASTEXITCODE -ne 0){throw 'git archive failed'}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Update)
try{
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$NodePath,'.runtime/node.exe',[IO.Compression.CompressionLevel]::Optimal)|Out-Null
 $license=Join-Path (Split-Path -Parent $NodePath) 'LICENSE'
 if(-not (Test-Path -LiteralPath $license)){throw 'Node.js LICENSE must accompany the redistributed runtime.'}
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$license,'.runtime/LICENSE',[IO.Compression.CompressionLevel]::Optimal)|Out-Null
 $metadata=@{nodeVersion=(& $NodePath --version);nodeSHA256=(Get-FileHash -LiteralPath $NodePath -Algorithm SHA256).Hash;nodeSigner=$signature.SignerCertificate.Subject;sourceCommit=(& git rev-parse HEAD);hysysAdapter='pending';architecture='win-x64'}|ConvertTo-Json
 $entry=$zip.CreateEntry('release-metadata.json')
 $writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
 try{$writer.Write($metadata)}finally{$writer.Dispose()}
}finally{$zip.Dispose()}
Write-Output ('Release archive: '+$archive)
Get-FileHash -LiteralPath $archive -Algorithm SHA256|ForEach-Object { $_.Hash.ToLower()+'  '+[IO.Path]::GetFileName($archive) }|Set-Content -LiteralPath ($archive+'.sha256') -Encoding ASCII
