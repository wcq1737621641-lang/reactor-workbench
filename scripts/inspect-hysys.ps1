param([string]$OutputPath=(Join-Path $PSScriptRoot '../artifacts/com-inspection.json'),[switch]$CreateScratchCase)
$ErrorActionPreference='Stop'
function Members($obj){
 if($null -eq $obj){return @()}
 @($obj|Get-Member|Where-Object {$_.MemberType -in 'Method','Property','ParameterizedProperty'}|Select-Object Name,MemberType,Definition)
}
$result=[ordered]@{createdAt=[DateTime]::UtcNow.ToString('o');host=$env:COMPUTERNAME;objects=[ordered]@{};errors=@()}
try{
 $app=New-Object -ComObject HYSYS.Application
 $app.Visible=$true
 $result.objects.Application=Members $app
 $result.objects.SimulationCases=Members $app.SimulationCases
 $case=$null
 if($CreateScratchCase){$case=$app.SimulationCases.Add();$case.Visible=$true}else{try{$case=$app.ActiveDocument}catch{}}
 if($null -ne $case){
  $result.objects.Case=Members $case
  foreach($item in @('BasisManager','Flowsheet','Solver')){try{$result.objects[$item]=Members $case.$item}catch{$result.errors+=($item+': '+$_.Exception.Message)}}
  foreach($item in @('FluidPackages','ReactionManager','Reactions','ReactionSets')){try{$result.objects['Basis.'+$item]=Members $case.BasisManager.$item}catch{$result.errors+=($item+': '+$_.Exception.Message)}}
  foreach($item in @('Operations','MaterialStreams','EnergyStreams','Components')){try{$result.objects['Flowsheet.'+$item]=Members $case.Flowsheet.$item}catch{$result.errors+=($item+': '+$_.Exception.Message)}}
  if($case.Flowsheet.Operations.Count -gt 0){$result.objects.FirstOperation=Members $case.Flowsheet.Operations.Item(0)}
  if($case.BasisManager.FluidPackages.Count -gt 0){$fp=$case.BasisManager.FluidPackages.Item(0);$result.objects.FluidPackage=Members $fp;foreach($item in @('Reactions','ReactionSets','Components')){try{$result.objects['FP.'+$item]=Members $fp.$item}catch{}}}
 }else{$result.errors+='No active case; open a scratch case or use -CreateScratchCase.'}
}catch{$result.errors+=$_.Exception.Message}
$parent=Split-Path -Parent $OutputPath
if($parent){New-Item -ItemType Directory -Path $parent -Force|Out-Null}
$result|ConvertTo-Json -Depth 15|Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output ('Inspection saved: '+[IO.Path]::GetFullPath($OutputPath))
