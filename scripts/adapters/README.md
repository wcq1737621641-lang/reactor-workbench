# 工作站适配器状态：待实现、待联调

尚未添加 `hysys-v15.ps1`。不能将 `hysys.ps1` 的执行框架理解为已经完成反应器自动创建。

原因：当前工作站仅提供 RDP，实际 COM 接口尚未读取；用户已要求先完成本地项目，稍后联调。反应、反应集、连接端口和收敛属性必须以该机 V15 类型库为准，不能猜测 API。

在工作站执行 `scripts/inspect-hysys.ps1 -CreateScratchCase` 后，按 `docs/HYSYS-INTEGRATION.md` 实现并验证两个函数。完整实现后再添加此文件，健康检查才会启用运行按钮。
