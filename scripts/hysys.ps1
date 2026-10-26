param([Parameter(Mandatory=$true)][string]$PlanPath,[Parameter(Mandatory=$true)][string]$OutputPath,[Parameter(Mandatory=$true)][string]$CaseDirectory)
$ErrorActionPreference='Stop'
$app=$null;$case=$null
try{
 $plan=Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8|ConvertFrom-Json
 if(-not $plan.ready){throw 'Plan is incomplete.'}
 $adapter=Join-Path $PSScriptRoot 'adapters/hysys-v15.ps1'
 if($env:HYSYS_ADAPTER_PATH){$adapter=$env:HYSYS_ADAPTER_PATH}
 if(-not (Test-Path -LiteralPath $adapter)){throw 'V15 reaction creation adapter is pending workstation integration. Run scripts/inspect-hysys.ps1 and follow docs/HYSYS-INTEGRATION.md. No model was created.'}
 . $adapter
 foreach($name in @('Build-HysysFlowsheet','Get-HysysSolved')){if(-not (Get-Command $name -ErrorAction SilentlyContinue)){throw ('Adapter missing '+$name)}}
 $app=New-Object -ComObject HYSYS.Application
 $app.Visible=$true
 $cases=@();$index=0
 foreach($condition in $plan.conditions){
  $index++;$case=$app.SimulationCases.Add();$case.Visible=$true;$case.Solver.CanSolve=$false
  # Build-HysysFlowsheet must create all basis data, reactions and connections
  # from this plan, without using fixed scenario-specific .hsc templates.
  $model=Build-HysysFlowsheet -Case $case -Plan $plan -Condition $condition
  foreach($key in @('Reactor','Feed','Vapour','Liquid')){if($null -eq $model[$key]){throw ('Adapter returned no '+$key)}}
  if($plan.thermalMode -eq 'isothermal' -and $null -eq $model.Energy){throw 'Isothermal model requires an energy stream.'}
  $case.Solver.CanSolve=$true
  $deadline=[DateTime]::UtcNow.AddSeconds(45);$solved=$false
  do{
   Start-Sleep -Milliseconds 250
   $solved=Get-HysysSolved -Case $case -Reactor $model.Reactor
   if($solved -eq $true){break}
  }while([DateTime]::UtcNow -lt $deadline)
  if($solved -ne $true){throw ('Case '+$index+' did not converge within 45 s.')}
  $actualComponents=@();for($j=0;$j -lt $case.Flowsheet.Components.Count;$j++){$actualComponents+=[string]$case.Flowsheet.Components.Item($j).Name}
  if($actualComponents.Count -ne $plan.components.Count){throw 'Unexpected HYSYS component count.'}
  foreach($name in $plan.components){if($name -notin $actualComponents){throw ('HYSYS component mapping mismatch: '+$name)}}
  $streams=@()
  foreach($key in @('Vapour','Liquid')){
   $s=$model[$key];$z=@($s.ComponentMolarFractionValue)
   if($z.Count -ne $actualComponents.Count){throw 'Composition vector length mismatch.'}
   $composition=[ordered]@{};for($j=0;$j -lt $actualComponents.Count;$j++){$composition[$actualComponents[$j]]=[double]$z[$j]}
   $streams+=@{name=[string]$s.Name;temperatureC=[double]$s.Temperature.GetValue('C');pressureBar=[double]$s.Pressure.GetValue('bar');flowKmolH=[double]$s.MolarFlow.GetValue('kgmole/h');composition=$composition}
  }
  $caseFile=Join-Path $CaseDirectory ('case-'+$index+'.hsc')
  $case.SaveAs($caseFile)
  $cases+=@{converged=$true;streams=$streams;caseFile=$caseFile;reactorName=[string]$model.Reactor.Name;condition=$condition}
 }
 @{source='hysys-com';isHysysResult=$true;createdAt=[DateTime]::UtcNow.ToString('o');cases=$cases}|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $OutputPath -Encoding UTF8
}catch{
 @{source='hysys-com';isHysysResult=$false;error=$_.Exception.Message}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $OutputPath -Encoding UTF8
 Write-Error $_.Exception.Message -ErrorAction Continue
}finally{
 # Keep the user's HYSYS application and generated cases open for inspection.
 # Never close unrelated documents or terminate the application's process.
 if($null -ne $case){try{$case.Solver.CanSolve=$true}catch{}}
}
