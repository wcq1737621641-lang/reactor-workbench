# HYSYS V15 联调：下一阶段的明确工作

本文件是待执行步骤，不是联调成功记录。当前缺少工作站的接口探测结果与 `scripts/adapters/hysys-v15.ps1`，因此不能声称已能自动创建反应器。

## 在工作站准备

将项目复制到工作站，安装 Node.js 22+，确保 HYSYS V15 能交互启动且许可证有效。不要复制账号、密码或 `.rdp` 到仓库。先在 HYSYS 中新建一个可丢弃的空算例，再执行：

```powershell
npm run doctor
powershell -STA -NoProfile -ExecutionPolicy Bypass -File scripts/inspect-hysys.ps1 -CreateScratchCase
```

`artifacts/com-inspection.json` 会导出应用、算例、基准环境、流股、单元操作等公开 COM 成员。探测脚本会启动 HYSYS；`-CreateScratchCase` 会新建空算例并留在屏幕上。默认不创建新算例，只检查活动算例。不探测所有属性以免触发需要参数的调用。

在 V15 的对象浏览器、Help/Customization 文档和 AspenTech 自动化示例中检查实际签名，尤其是：

| 配置 | 必须核实 |
|---|---|
| 物性 | BasisManager、FluidPackages、新组分列表和 PR/SRK 名称 |
| 反应创建 | Conversion/Equilibrium reaction 对象、化学计量、基准组分、相态 |
| 平衡 | Gibbs-energy 数据模式、活度/逸度/分压基准、温度范围 |
| 反应集 | 创建、激活、关联物性包、关联反应器 |
| 反应器创建 | Operations.Add 的类型 ID、参数顺序、进料与汽液出口连接 |
| 热条件 | 压降、出口温度指定、能量流连接、绝热模式 |
| 求解 | 对反应器本身的已求解状态检查，不能只看 Solver.IsSolving=false |

如某些反应属性未通过 COM 暴露，应结合 V15 的脚本语言或 Windows UI Automation 完成**通用配置**，并读取配置回验。不要用两个固定 `.hsc` 文件替代通用创建能力。

## 适配器契约

在 `scripts/adapters/hysys-v15.ps1` 提供两个函数（只由本地受信代码实现，用户输入不能指定脚本）：

```powershell
function Build-HysysFlowsheet {
  param($Case, $Plan, $Condition)
  # 在宿主新建的空 Case 上，从 Plan 动态创建物性包、组分、反应集、
  # Feed、R-100、Vapour、Liquid，以及等温时的 Energy。
  # 返回哈希表，不将意外输出写到 stdout：
  # @{Reactor=$operation; Feed=$feed; Vapour=$vapour; Liquid=$liquid; Energy=$energy}
}
function Get-HysysSolved {
  param($Case, $Reactor)
  # 仅当反应器真实求解完成且无欠规格/错误时返回单个 $true，否则 $false。
}
```

宿主已将 `Case.Solver.CanSolve` 暂停，创建完成后统一启用。适配器必须：

1. 按 **HYSYS 实际组分顺序**生成进料组成向量，不依赖输入 JSON 顺序。
2. 每项温度/压力/流量显式指定单位。压力是绝对压力，流量 kmol/h 对应 HYSYS 常用 `kgmole/h` 标签，标签必须以 V15 实际可用单位为准。
3. 检查所有反应元素守恒；不能让芳烃三异构体各自消耗 50% 甲苯。
4. `equilibriumMethod=gibbs-energy` 时检查标准 Gibbs 数据可用性；不在模型中编造平衡常数。`lnK` 必须回验系数形式、温度单位、基准和适用区间，不把不同定义的 Ka/Kp/Kc 混用。
5. 等温工况连接能量流；绝热工况不同时固定出口温度和热负荷。
6. 建立两个物料出口，即使其中一股流量为零。Gibbs 必须确认候选产物与允许相态。
7. 创建后读取反应器类型、反应集、计量、转化率、热条件回验，不只检查创建调用是否成功。

宿主读取 `ComponentMolarFractionValue`、`Temperature.GetValue('C')`、`Pressure.GetValue('bar')`、`MolarFlow.GetValue('kgmole/h')`，这些读取路径也必须在工作站验证。组分别名可能需映射；目前宿主严格要求返回名字与计划一致，避免静默错位。

## 验收

```powershell
npm run cli -- run examples/reforming.txt --accept-assumptions
npm run cli -- run examples/toluene.txt --accept-assumptions
npm run cli -- run examples/hydrogenation.json
```

要保留三个独立输入、各自 `.hsc`、COM 日志、真实汽液流股、反应器求解状态和元素衡算残差。两温度重整工况要同基准比较湿基/干基，核对温度影响但不能预设结果。甲苯总消耗应 5000 kg/h，苯与二甲苯总摩尔生成量相等。

测试记录还应加入失败/欠规格工况、修改进料比或转化率后重新求解、必测外的反应创建。全部实测通过后，再将 README 和报告中的“待联调”改为实际证据与结果，录制 HYSYS 全流程演示。
