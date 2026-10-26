const $ = (s) => document.querySelector(s);
const examples = {
  reforming:
    '我需要模拟甲烷蒸汽重整。甲烷和水蒸气摩尔比1:2.7，主反应甲烷和水生成一氧化碳和氢气，副反应一氧化碳和水生成二氧化碳和氢气。进料温度520℃，压力13.5bar，分别比较出口温度710℃和出口温度600℃的产物分布。进料流量可自定。',
  toluene:
    '甲苯歧化：2C7H8 → C6H6 + C8H10。甲苯进料流量10000kg/h，进料温度380℃，操作压力2.5MPa，甲苯转化率50%。不讨论动力学，不考虑其他副反应。邻、间、对二甲苯异构体比例1:1:1（演示假设）。',
};
const names = {
  conversion: 'Conversion Reactor',
  equilibrium: 'Equilibrium Reactor',
  gibbs: 'Gibbs Reactor',
  pfr: 'Plug Flow Reactor',
  cstr: 'CSTR',
};
const sources = {
  'local-parser': '本地有限解析',
  'structured-input': '结构化输入',
  llm: 'AI 语言模型',
};
let current = null,
  result = null,
  hysysAvailable = false,
  revision = 0;
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
function message(text, error = false) {
  $('#message').textContent = text;
  $('#message').className = error ? 'error' : '';
}
async function api(url, data) {
  const r = await fetch(
    url,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error || '请求失败');
  return d;
}
async function health() {
  try {
    const h = await api('/api/health');
    hysysAvailable = h.hysys.available;
    $('#health').textContent = hysysAvailable
      ? '已检测到 HYSYS · 实算待验证'
      : h.hysys.installed
        ? '已安装 HYSYS · 适配器待联调'
        : '当前电脑未安装 HYSYS';
    $('#health').title = h.hysys.message;
    $('.dot').classList.toggle('available', hysysAvailable);
    $('#planner-label').textContent = h.planner === 'llm' ? 'AI 语言模型' : '本地有限解析';
    syncButtons();
  } catch (e) {
    $('#health').textContent = '连接失败，请确认服务已启动';
  }
}
function reset() {
  revision++;
  current = null;
  result = null;
  $('#plan-body').hidden = true;
  $('#plan-empty').hidden = false;
  $('#plan-status').textContent = '等待输入';
  $('#plan-status').className = 'tag';
  $('#result-source').textContent = '尚未计算';
  $('#result-body').textContent =
    '完成方案审阅后运行计算。结果将显示组分流量、摩尔分数及衡算检查。';
  $('#export-result').hidden = true;
  message('');
  syncButtons();
}
function syncButtons() {
  const p = current?.plan,
    accepted = p && (!p.assumptions.length || $('#accept').checked);
  $('#simulate').disabled = !p?.ready || !accepted || !hysysAvailable;
  $('#simulate').title = hysysAvailable
    ? '在本机 HYSYS 创建并求解算例'
    : '请将项目运行在已安装 HYSYS 的 Windows 工作站';
  $('#check').disabled = !p?.ready || !accepted || p?.reactor !== 'conversion';
}
document.querySelectorAll('[data-example]').forEach((b) =>
  b.addEventListener('click', () => {
    $('#request').value = examples[b.dataset.example];
    reset();
  }),
);
$('#json-example').addEventListener('click', async () => {
  try {
    $('#request').value = JSON.stringify(await api('/api/schema'), null, 2);
    reset();
  } catch (e) {
    message(e.message, true);
  }
});
$('#request').addEventListener('input', reset);
$('#accept').addEventListener('change', syncButtons);
$('#refresh').addEventListener('click', health);
function renderPlan(p) {
  $('#plan-empty').hidden = true;
  $('#plan-body').hidden = false;
  $('#plan-status').textContent = p.ready ? '可运行' : '需补充';
  $('#plan-status').className = 'tag ' + (p.ready ? 'ready' : 'needs-input');
  $('#reactor-type').textContent = names[p.reactor] || p.reactor;
  $('#reason').textContent = p.reason;
  $('#planner-label').textContent = sources[p.plannerSource];
  $('#plan-json').textContent = JSON.stringify(p, null, 2);
  const conditions = $('#conditions');
  conditions.replaceChildren();
  const feed = el('div', undefined, 'condition');
  feed.append(
    el('small', '进料'),
    el(
      'span',
      `${p.feed.flow ?? '—'} ${p.feed.flowUnit ?? ''} / ${p.feed.temperatureC ?? '—'} °C / ${p.feed.pressureBar ?? '—'} bar`,
    ),
  );
  conditions.append(feed);
  p.conditions.forEach((c, i) => {
    const b = el('div', undefined, 'condition');
    b.append(
      el('small', `出口工况 ${i + 1}`),
      el(
        'span',
        `${p.thermalMode === 'isothermal' ? (c.temperatureC ?? '—') + ' °C' : '绝热，温度待计算'} / ${c.pressureBar ?? '—'} bar`,
      ),
    );
    conditions.append(b);
  });
  $('#reactions').replaceChildren();
  for (const r of p.reactions) {
    const left = [],
      right = [];
    for (const [k, v] of Object.entries(r.stoichiometry))
      (v < 0 ? left : right).push(
        `${Math.abs(v) === 1 ? '' : Number(Math.abs(v).toFixed(4)) + ' '}${k}`,
      );
    $('#reactions').append(
      el(
        'div',
        `${left.join(' + ')} ${p.reactor === 'equilibrium' ? '⇌' : '→'} ${right.join(' + ')}`,
      ),
    );
  }
  for (const key of ['questions', 'assumptions']) {
    $('#' + key).replaceChildren(...p[key].map((t) => el('li', t)));
    $('#' + key + '-box').hidden = !p[key].length;
  }
  $('#accept').checked = false;
  syncButtons();
}
async function withBusy(button, fn) {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await fn();
  } catch (e) {
    message(e.message, true);
  } finally {
    button.removeAttribute('aria-busy');
    if (button.id === 'analyze') button.disabled = false;
    else syncButtons();
  }
}
$('#analyze').addEventListener('click', () =>
  withBusy($('#analyze'), async () => {
    const text = $('#request').value;
    reset();
    const version = revision;
    const data = await api('/api/plan', { text });
    if (version !== revision) return;
    current = data;
    renderPlan(data.plan);
    message(
      data.plan.ready
        ? '方案已生成，请审阅假设后选择计算方式。'
        : '已识别建模方向，请补充右侧列出的条件。',
    );
  }),
);
for (const [selector, url] of [
  ['#check', '/api/check'],
  ['#simulate', '/api/simulate'],
])
  $(selector).addEventListener('click', () =>
    withBusy($(selector), async () => {
      message(
        selector === '#simulate'
          ? '正在创建 HYSYS 算例并求解，请保持工作站会话。'
          : '正在执行独立计量校核…',
      );
      const id = current.id;
      const d = await api(url, { id, acceptAssumptions: $('#accept').checked });
      if (current?.id !== id) return;
      result = d;
      renderResult(d);
      message('计算完成。');
    }),
  );
function resultTable(flows) {
  const wrap = el('div', undefined, 'table-wrap'),
    table = el('table'),
    head = el('thead'),
    tr = el('tr');
  ['组分', '摩尔流量 / kmol·h⁻¹', '质量流量 / kg·h⁻¹', '摩尔分数'].forEach((t) =>
    tr.append(el('th', t)),
  );
  head.append(tr);
  table.append(head);
  const body = el('tbody');
  for (const [k, v] of Object.entries(flows)) {
    const row = el('tr');
    row.append(el('td', k), el('td', v.kmol_h.toFixed(4)), el('td', v.kg_h.toFixed(3)));
    const td = el('td'),
      cell = el('div', undefined, 'bar-cell'),
      track = el('div', undefined, 'bar-track'),
      fill = el('div', undefined, 'bar-fill');
    fill.style.width = `${Math.max(0, Math.min(100, v.moleFraction * 100))}%`;
    track.append(fill);
    cell.append(track, el('span', (v.moleFraction * 100).toFixed(3) + '%'));
    td.append(cell);
    row.append(td);
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  return wrap;
}
function renderResult(r) {
  const box = $('#result-body');
  box.replaceChildren();
  $('#result-source').textContent = r.isHysysResult
    ? 'HYSYS COM / 真实求解'
    : '独立计量校核 / 非 HYSYS';
  $('#result-source').className = r.isHysysResult ? 'success' : 'muted';
  $('#export-result').hidden = false;
  if (!r.isHysysResult) {
    box.append(
      el(
        'div',
        '以下数据由反应计量与指定转化率计算，不代表 HYSYS 模拟；未计算温度、热负荷与汽液分相。',
        'notice',
      ),
      resultTable(r.componentFlows),
    );
    box.append(
      el(
        'p',
        `元素衡算最大绝对残差：${Math.max(...Object.values(r.elementResidual).map(Math.abs)).toExponential(2)} kmol-atoms/h`,
        'success',
      ),
    );
  } else
    for (const [i, c] of r.cases.entries()) {
      box.append(el('h4', `工况 ${i + 1} · 收敛 ${c.converged ? '是' : '否'}`));
      for (const s of c.streams)
        box.append(
          el(
            'p',
            `${s.name} / ${s.temperatureC.toFixed(2)} °C / ${s.pressureBar.toFixed(3)} bar / ${s.flowKmolH.toFixed(3)} kmol/h`,
          ),
        );
      box.append(resultTable(c.componentFlows));
      box.append(
        el(
          'p',
          `元素衡算最大相对残差：${Math.max(...Object.values(c.elementRelativeResidual)).toExponential(2)}`,
          'success',
        ),
      );
    }
}
function download(value, name) {
  const a = document.createElement('a'),
    u = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    );
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
$('#export-plan').addEventListener('click', () => download(current.plan, 'reactor-plan.json'));
$('#export-result').addEventListener('click', () => download(result, 'reactor-result.json'));
health();
