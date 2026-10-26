export const ATOMIC = { C: 12.011, H: 1.008, O: 15.999, N: 14.007, S: 32.06, Ar: 39.948 };
export const COMPONENTS = {
  Methane: ['CH4', '甲烷'],
  Water: ['H2O', '水', '水蒸气', '水蒸汽'],
  Hydrogen: ['H2', '氢气'],
  'Carbon Monoxide': ['CO', '一氧化碳'],
  'Carbon Dioxide': ['CO2', '二氧化碳'],
  Oxygen: ['O2', '氧气'],
  Nitrogen: ['N2', '氮气'],
  Ammonia: ['NH3', '氨'],
  Toluene: ['C7H8', '甲苯'],
  Benzene: ['C6H6', '苯'],
  'o-Xylene': ['C8H10', '邻二甲苯'],
  'm-Xylene': ['C8H10', '间二甲苯'],
  'p-Xylene': ['C8H10', '对二甲苯'],
  Ethane: ['C2H6', '乙烷'],
  Ethylene: ['C2H4', '乙烯'],
  Propane: ['C3H8', '丙烷'],
  Methanol: ['CH4O', '甲醇', 'CH3OH'],
  Ethanol: ['C2H6O', '乙醇', 'C2H5OH'],
};
export function atoms(f) {
  const a = {};
  let consumed = '';
  for (const m of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    if (!ATOMIC[m[1]]) throw Error(`未知元素 ${m[1]}`);
    a[m[1]] = (a[m[1]] || 0) + Number(m[2] || 1);
    consumed += m[0];
  }
  if (consumed !== f || !consumed) throw Error(`无效分子式 ${f}`);
  return a;
}
export function canonical(n) {
  const matches = Object.keys(COMPONENTS).filter(
    (k) =>
      k.toLowerCase() === String(n).toLowerCase() ||
      COMPONENTS[k].some((a) => a.toLowerCase() === String(n).toLowerCase()),
  );
  if (matches.length > 1) throw Error(`组分 ${n} 存在异构体歧义，请指定英文组分名。`);
  return matches[0] || n;
}
export function formula(n, custom = {}) {
  return custom[n] || COMPONENTS[n]?.[0];
}
export function mw(n, custom = {}) {
  const f = formula(n, custom);
  if (!f) throw Error(`缺少 ${n} 的分子式`);
  return Object.entries(atoms(f)).reduce((s, [e, c]) => s + ATOMIC[e] * c, 0);
}
export function reactionBalance(stoich, custom = {}) {
  const b = {};
  for (const [n, c] of Object.entries(stoich)) {
    const f = formula(n, custom);
    if (!f) throw Error(`缺少 ${n} 的分子式`);
    for (const [e, v] of Object.entries(atoms(f))) b[e] = (b[e] || 0) + c * v;
  }
  return b;
}
export function feedMoles(p) {
  const mean = Object.entries(p.feed.composition).reduce(
    (s, [k, z]) => s + z * mw(k, p.formulas),
    0,
  );
  const total = p.feed.flowUnit === 'kg/h' ? p.feed.flow / mean : p.feed.flow;
  return Object.fromEntries(p.components.map((k) => [k, total * (p.feed.composition[k] || 0)]));
}
export function inventory(flows, custom = {}) {
  const b = {};
  for (const [n, f] of Object.entries(flows))
    for (const [e, v] of Object.entries(atoms(formula(n, custom)))) b[e] = (b[e] || 0) + v * f;
  return b;
}
export function crossCheck(p) {
  if (p.reactor !== 'conversion')
    throw Error('独立校核仅支持指定转化率的计量反应；平衡组成必须由 HYSYS 求解。');
  const initial = feedMoles(p),
    out = { ...initial },
    extents = [];
  for (const r of p.reactions) {
    const extent = (initial[r.baseComponent] * r.conversion) / -r.stoichiometry[r.baseComponent];
    for (const [k, v] of Object.entries(r.stoichiometry)) out[k] += extent * v;
    extents.push({ name: r.name, kmol_h: extent });
  }
  if (Object.values(out).some((v) => v < -1e-8))
    throw Error('指定转化率导致负物流，请检查反应物供给和并行反应分配。');
  const total = Object.values(out).reduce((a, b) => a + b, 0),
    before = inventory(initial, p.formulas),
    after = inventory(out, p.formulas);
  return {
    source: 'stoichiometric-cross-check',
    isHysysResult: false,
    status: '校核完成（非 HYSYS 模拟）',
    extents,
    componentFlows: Object.fromEntries(
      Object.entries(out).map(([k, v]) => [
        k,
        {
          kmol_h: Math.max(0, v),
          kg_h: Math.max(0, v) * mw(k, p.formulas),
          moleFraction: Math.max(0, v) / total,
        },
      ]),
    ),
    elementResidual: Object.fromEntries(
      Object.entries(before).map(([e, v]) => [e, (after[e] || 0) - v]),
    ),
    notes: ['仅计量校核，不包含汽液闪蒸、出口温度和热负荷。'],
  };
}
