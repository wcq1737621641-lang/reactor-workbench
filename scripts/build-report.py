"""Generate the two-page technical report. Requires reportlab (development only)."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "technical-report.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
font_path = Path("C:/Windows/Fonts/simsun.ttc")
if font_path.exists():
    pdfmetrics.registerFont(TTFont("ReportChinese", str(font_path), subfontIndex=0))
else:
    raise RuntimeError("Set up a Chinese TrueType font before generating the report.")
INK, BLUE, MUTED, LINE = [HexColor(x) for x in ["#223b4b", "#176b87", "#6c7f8b", "#dbe4e9"]]
PAGE_W, PAGE_H = 595.276, 841.89
c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H))
c.setTitle("AI 化工反应器建模 - 本地开发阶段技术报告")
c.setAuthor("Reactor Workbench")
style = ParagraphStyle("body", fontName="ReportChinese", fontSize=10, leading=16, textColor=INK, wordWrap="CJK", alignment=TA_LEFT)
small = ParagraphStyle("small", parent=style, fontSize=8, leading=12)
y = 0

def paragraph(text, space=9, st=style):
    global y
    p = Paragraph(text, st)
    w, h = p.wrap(PAGE_W - 88, 700)
    if y - h < 50:
        raise RuntimeError(f"Page overflow at: {text[:40]}")
    p.drawOn(c, 44, y-h)
    y -= h + space

def heading(text):
    global y
    y -= 5
    c.setFillColor(BLUE)
    c.setFont("ReportChinese", 12)
    c.drawString(44, y-13, text)
    y -= 25

def page(number, subtitle):
    global y
    c.setFillColor(BLUE)
    c.rect(0, PAGE_H-8, PAGE_W, 8, fill=1, stroke=0)
    c.setFont("Helvetica", 9)
    c.drawString(44, PAGE_H-39, "REACTOR WORKBENCH / ENGINEERING NOTE")
    c.setFillColor(INK)
    c.setFont("ReportChinese", 22)
    c.drawString(44, PAGE_H-77, "AI 化工反应器智能建模")
    c.setFillColor(MUTED)
    c.setFont("ReportChinese", 9)
    c.drawString(44, PAGE_H-99, subtitle)
    c.setStrokeColor(LINE)
    c.line(44, 41, PAGE_W-44, 41)
    c.setFont("Helvetica", 8)
    c.drawString(44, 26, "2026-10-26 | LOCAL DEVELOPMENT / HYSYS VALIDATION PENDING")
    c.drawRightString(PAGE_W-44, 26, f"{number} / 2")
    y = PAGE_H-122

page(1, "技术选型、系统架构与模型判断 | 本地开发阶段，实机闭环尚未验收")
paragraph("<b>交付边界：</b>已实现本地交互、方案生成、确定性校验和独立计量校核；已编写 HYSYS COM 宿主与探测工具。V15 反应器创建适配器、真实求解及录屏待工作站联调。用户已明确选择先完成本地项目。")
heading("技术选型与架构")
paragraph("采用 Node.js 22+、原生网页及 Windows PowerShell STA。运行时不引入 npm 依赖，可直接复制到 HYSYS 工作站。COM 路径符合 AspenTech 自动化架构；界面支持审阅假设和查看结果来源，CLI 方便复现。语言模型通过可配置的 OpenAI 兼容 JSON 接口接入；未配置时明确使用有限本地解析器。")
paragraph("输入 → LLM/本地解析 → JSON 方案 → 确定性选型与化学校验 → 条件澄清/假设审阅 → 独立校核或 HYSYS 宿主 → 工作站适配器 → COM 真实结果 → 元素衡算与证据保存。AI 不能提供脚本或模拟结果替代 HYSYS；模型输出仍须经过业务校验。")
heading("两个必测场景的工程判断")
paragraph("<b>甲烷蒸汽重整：</b>明确两条可逆反应且未给转化率，优先 Equilibrium Reactor。CH4 + H2O &lt;=&gt; CO + 3H2；CO + H2O &lt;=&gt; CO2 + H2。进料 520 °C、13.5 bar(a)，出口 710/600 °C 分为独立工况，等温热负荷由 HYSYS 计算。平衡常数取自可用热化学数据，不能编造 Ka。")
paragraph("任务允许自定规模：选总进料 3700 kmol/h，1:2.7 时为甲烷 1000、水 2700 kmol/h。按 8000 h/a，甲烷约 12.8344 万吨/年。假设化学平衡，不含积碳与动力学限制；处理量及 PR 物性均作为建模假设审阅，产物分布待实算。")
paragraph("<b>甲苯歧化：</b>给出甲苯转化率 50% 且无需动力学，选 Conversion Reactor。进料 10000 kg/h、380 °C、2.5 MPa = 25 bar(a)。总转化率无法确定邻/间/对二甲苯分布，必须询问选择性。示例明确补充 1:1:1，采用一条等效计量反应，避免三次各消耗 50%。未给热条件时声明绝热、零压降。")
heading("通用性与可检查的边界")
paragraph("新增反应不依赖固定产物表，使用组分、计量矩阵与工况数据。提供乙烯加氢、合成氨平衡和甲烷燃烧候选组分案例。动力学优先识别 CSTR/PFR，但当前阻止执行，等待专用适配。Gibbs 的允许产物集合、物性与相态需工程确认；聚合与电解质不作为已支持工况。")
c.showPage()

page(2, "探索过程、验证证据与未完成项 | 不将本地校核标记为 HYSYS 实算")
heading("探索过程与遇到的问题")
paragraph("初始目录为空，本机没有 HYSYS COM 注册。通过用户提供的 RDP 配置检查远程连接，3389 可达，SSH/WinRM 未响应；远程画面有 Aspen HYSYS V15 图标。前台窗口受本机操作切换影响，自动化脚本尚未稳定执行，随后按用户要求暂停远程操控。")
paragraph("没有把旧文档中的成员名当作 V15 已验证接口。增加 inspect-hysys.ps1 导出实际 COM 成员，并将版本差异隔离到工作站适配器。适配器文件缺失时，健康检查与执行器均拒绝实算。后续应结合本机 Help 和类型库核实反应创建、反应集关联、端口连接和求解状态；必要时补充受控 UI 自动化。")
heading("已执行的验证与结果解释")
paragraph("本地单元与 HTTP 集成测试覆盖选型、两个重整温度保留、MPa/bar 换算、元素守恒、异构体缺失、限量反应物、并行转化率、假设确认及新反应校核。模型服务通路使用模拟响应测试，不能视为真实 LLM 账户验证。浏览器交互、移动布局与测试日志另存 evidence。")
paragraph("甲苯示例的独立校核：未反应甲苯 5000 kg/h；总出口摩尔分数甲苯 50%、苯 25%、三种二甲苯各 8.3333%。这是等比例选择性假设下的计量值，不是 HYSYS 结果；不包含出口温度、热负荷或汽液分相。乙烯加氢示例由 40/60 kmol/h 的乙烯/氢气进料、80% 乙烯转化率得到 8/28/32 kmol/h 的乙烯/氢气/乙烷。")
heading("真实结果的验收约束")
paragraph("宿主为每次任务保存输入快照、日志、结果/失败记录和 .hsc。适配器必须按 HYSYS 实际组分顺序设置组成；温压和流量均显式带单位；等温连接能量流，不以 Solver 停止作为收敛证明。输出必须读取气/液两股物流与反应器状态，进行组成和元素衡算检查。失败时返回原因，不生成替代结果。")
heading("交付与下一阶段")
paragraph("本地代码、README、示例、测试、两页报告和脱敏真实公开对话导出可交付。HYSYS 实机反应创建适配器尚未实现，两个必测及额外反应的真实求解、全流程录屏和 Live Demo 均待完成。GitHub 凭证目前无效，远程仓库发布待重新授权；不能把本地仓库等同于已发布 GitHub 仓库。")
paragraph("联调顺序：导出 V15 COM 接口 → 实现通用适配器 → 回读反应/类型/热条件 → 实算重整两工况和甲苯歧化 → 额外反应与失败工况 → 保存证据 → 更新报告并录制演示。只有全部实测通过后才能声称完成考核闭环。")
heading("参考与 AI 协作证据")
paragraph("AspenTech：Automation and Extensibility，Article 000066742；V15 Unit Operations Guide，Article 000103491。OpenAI 官方 Structured model outputs 文档：JSON mode 不保证业务 schema，需独立校验。完整链接见 README。开发公开消息原始导出见 docs/AI-SESSION.md；敏感凭证及远程地址已脱敏，未复制第三方项目仓库。", st=small)
c.save()
print(OUT)
