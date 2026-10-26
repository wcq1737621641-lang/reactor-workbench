import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { feedMoles, inventory, mw, crossCheck } from './chemistry.js';
const exec = promisify(execFile);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let busy = false;
export async function doctor() {
  if (process.platform !== 'win32')
    return { available: false, message: 'HYSYS COM 需要 Windows 工作站。' };
  try {
    const { stdout } = await exec(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/doctor.ps1')],
      { timeout: 15000, maxBuffer: 2e6 },
    );
    return JSON.parse(stdout.replace(/^\uFEFF/, ''));
  } catch {
    return {
      available: false,
      message: '无法读取 HYSYS COM 注册信息。请在已安装并授权的工作站运行 npm run doctor。',
    };
  }
}
export function verifyResult(plan, result) {
  if (
    result.source !== 'hysys-com' ||
    result.isHysysResult !== true ||
    !Array.isArray(result.cases) ||
    result.cases.length !== plan.conditions.length
  )
    throw Error('HYSYS 返回结果来源或工况数量不完整。');
  const before = inventory(feedMoles(plan), plan.formulas);
  const expected = plan.reactor === 'conversion' ? crossCheck(plan).componentFlows : null;
  for (const [index, c] of result.cases.entries()) {
    if (c.converged !== true || !Array.isArray(c.streams) || c.streams.length !== 2)
      throw Error('HYSYS 未确认求解完成或出口物流缺失。');
    const output = Object.fromEntries(plan.components.map((k) => [k, 0]));
    for (const s of c.streams) {
      if (
        !Number.isFinite(s.flowKmolH) ||
        s.flowKmolH < 0 ||
        !Number.isFinite(s.temperatureC) ||
        !Number.isFinite(s.pressureBar)
      )
        throw Error('出口温度、压力或流量缺失/无效。');
      if (s.flowKmolH > 1e-7) {
        const target = plan.conditions[index];
        if (Math.abs(s.pressureBar - target.pressureBar) > 0.001)
          throw Error('HYSYS 出口压力与工况不一致。');
        if (
          plan.thermalMode === 'isothermal' &&
          Math.abs(s.temperatureC - target.temperatureC) > 0.01
        )
          throw Error('HYSYS 出口温度与等温工况不一致。');
      }
      let zsum = 0;
      for (const k of plan.components) {
        const z = s.composition[k];
        if (!Number.isFinite(z) || z < -1e-8) throw Error(`出口 ${k} 摩尔分数缺失/无效。`);
        zsum += z;
        output[k] += z * s.flowKmolH;
      }
      if (s.flowKmolH > 1e-7 && Math.abs(zsum - 1) > 1e-5) throw Error('出口摩尔分数总和异常。');
    }
    const after = inventory(output, plan.formulas);
    c.elementRelativeResidual = {};
    for (const [el, v] of Object.entries(before)) {
      const residual = Math.abs((after[el] || 0) - v) / Math.max(1, Math.abs(v));
      c.elementRelativeResidual[el] = residual;
      if (residual > 1e-4) throw Error(`HYSYS 结果 ${el} 元素衡算不通过：${residual}`);
    }
    if (expected) {
      for (const k of plan.components) {
        const residual = Math.abs(output[k] - expected[k].kmol_h) / Math.max(1, expected[k].kmol_h);
        if (residual > 1e-4) throw Error(`HYSYS 组分 ${k} 与指定转化率/选择性不一致。`);
      }
    }
    const total = Object.values(output).reduce((a, b) => a + b, 0);
    c.componentFlows = Object.fromEntries(
      Object.entries(output).map(([k, v]) => [
        k,
        { kmol_h: v, kg_h: v * mw(k, plan.formulas), moleFraction: total ? v / total : 0 },
      ]),
    );
  }
  return result;
}
export async function simulate(plan) {
  if (!plan.ready) throw Error('方案尚有待补充信息，不能执行。');
  if (busy) throw Error('HYSYS 正在运行其他任务，请稍后重试。');
  const health = await doctor();
  if (!health.available) throw Error(health.message);
  // Diagnostics await above may allow another request to acquire the COM session.
  if (busy) throw Error('HYSYS 正在运行其他任务，请稍后重试。');
  busy = true;
  const id = randomUUID(),
    dir = path.join(ROOT, 'artifacts', id);
  try {
    await mkdir(dir, { recursive: true });
    const input = path.join(dir, 'plan.json'),
      output = path.join(dir, 'result.json');
    await writeFile(input, JSON.stringify(plan, null, 2));
    const started = Date.now();
    const { stdout, stderr } = await exec(
      'powershell.exe',
      [
        '-STA',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(ROOT, 'scripts/hysys.ps1'),
        '-PlanPath',
        input,
        '-OutputPath',
        output,
        '-CaseDirectory',
        dir,
      ],
      { timeout: Number(process.env.HYSYS_TIMEOUT_MS || 120000), maxBuffer: 8e6 },
    );
    await writeFile(path.join(dir, 'automation.log'), stdout + '\n' + stderr);
    const data = JSON.parse((await readFile(output, 'utf8')).replace(/^\uFEFF/, ''));
    if (data.error) throw Error(data.error);
    const result = verifyResult(plan, data);
    result.id = id;
    result.elapsedMs = Date.now() - started;
    await writeFile(output, JSON.stringify(result, null, 2));
    return result;
  } catch (e) {
    if (e.stdout || e.stderr) {
      await writeFile(path.join(dir, 'automation.log'), (e.stdout || '') + '\n' + (e.stderr || ''));
    }
    await writeFile(
      path.join(dir, 'failure.json'),
      JSON.stringify({ id, error: e.message, date: new Date().toISOString() }, null, 2),
    );
    throw Error(`HYSYS 执行失败：${e.message}（记录 ${id}）`);
  } finally {
    busy = false;
  }
}
