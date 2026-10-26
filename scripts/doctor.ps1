$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$keys=@('HYSYS.Application','HYSYS.Application.V15.0','HYSYS.Application.V15')
$found=@($keys|Where-Object {Test-Path ('Registry::HKEY_CLASSES_ROOT\'+$_)})
$adapterPath=Join-Path $PSScriptRoot 'adapters/hysys-v15.ps1'
if($env:HYSYS_ADAPTER_PATH){$adapterPath=$env:HYSYS_ADAPTER_PATH}
$adapterReady=Test-Path -LiteralPath $adapterPath
if($found.Count -eq 0){@{available=$false;installed=$false;adapterReady=$adapterReady;message='未找到 HYSYS COM 注册。请在安装 HYSYS V15 的 Windows 工作站运行本项目。'}|ConvertTo-Json -Compress}
else{@{available=$adapterReady;installed=$true;adapterReady=$adapterReady;progIds=$found;message=$(if($adapterReady){'检测到 COM 注册及本机适配器；许可证和实际求解仍需算例验证。'}else{'检测到 HYSYS，但反应器创建适配器尚待 V15 接口探测与联调。'})}|ConvertTo-Json -Compress}
