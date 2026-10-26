# 在 Windows 工作站运行

## 下载解压即用（推荐）

到本仓库的 **Releases** 下载 `reactor-workbench-windows-x64.zip`，解压到普通目录，例如 `C:\ReactorWorkbench`，双击 **`start.cmd`**。发布包已带 Node.js 运行时，不要求安装 Node、Python、Git 或管理员权限。启动成功后自动打开本机浏览器，窗口保持打开，按 Ctrl+C 停止。

不要在 ZIP 压缩文件内部直接双击启动，请先完整解压。ARM64 原生 Windows 请使用源码版，首次启动会下载 ARM64 Node；x64 发布包仅针对 Windows x64。

## Git 拉取后运行

私有仓库需要用你有权限的 GitHub 账号登录。

```powershell
git clone https://github.com/wcq1737621641-lang/reactor-workbench.git
cd reactor-workbench
.\start.cmd
```

已安装 Node.js 22.9+ 时直接使用；没有时，首次启动会从 `nodejs.org` 下载 Node.js 24 LTS 到本项目 `.runtime`，验证官方 SHA-256 后解压。只在首次准备时联网，无需修改系统 PATH。也可先安装 Node.js 24 LTS。

双击 `doctor.cmd` 检查本机 HYSYS 注册与适配器状态；双击 `test.cmd` 运行本地测试。命令行可加 `start.cmd -NoBrowser`，只启动服务。

## 配置 AI 服务（可选）

首次运行自动从 `.env.example` 创建 `.env`，后续更新不覆盖已有配置。用记事本打开，设置：

```dotenv
PORT=3210
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=填写账户可用的模型名称
LLM_API_KEY=填写服务密钥
HYSYS_TIMEOUT_MS=120000
```

服务必须支持 Chat Completions 和 JSON mode。保存后关闭启动窗口并重新运行。密钥不写入浏览器、不提交 Git。未配置时可使用有限中文解析与任意受支持的结构化 JSON 反应；不能把它当作通用大模型解析已经启用。

## 当前功能边界

**此版本可以启动工作台、生成方案和做独立计量校核，但不能完成 HYSYS 自动建模。**

即使工作站安装 HYSYS V15，`scripts/adapters/hysys-v15.ps1` 仍需依据实际接口实现和验收。启动器不会把占位文件安装为已完成适配器；界面会明确显示不可实算。操作步骤见 [HYSYS 联调说明](docs/HYSYS-INTEGRATION.md)。在这一缺口完成前，不能用本版作为考核要求的真实 HYSYS 全流程 Demo。

## 更新与故障处理

- 更新：停止服务后 `git pull`；解压版使用新版本解压到新目录，把旧 `.env` 复制过去。保留所需 `artifacts` 算例和日志。
- 端口被占用：如果同一个工作台已运行，启动器会打开已有页面；若是其他程序，修改 `.env` 的 `PORT` 后重启。
- 下载受阻：改用带运行时的 Windows 发布包，或自行安装 Node.js 24 LTS。
- 出现空白页或错误：保留启动窗口中的报错、运行 `doctor.cmd`，按错误信息检查。不要把密钥或远程桌面密码附到 Issue。
- HYSYS 未识别：在安装 HYSYS 的同一台 Windows 工作站运行。RDP 连接到工作站不会让本机自动获得远程 COM。
- 服务只绑定 `127.0.0.1`。浏览器应在运行服务的工作站上打开。
