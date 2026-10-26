import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planFromText, validatePlan, SCHEMA_EXAMPLE } from '../src/planner.js';
import { crossCheck, mw, atoms, canonical } from '../src/chemistry.js';
import { verifyResult } from '../src/hysys.js';
const sample = () => structuredClone(SCHEMA_EXAMPLE);
const read = (name) => readFile(new URL('../examples/' + name, import.meta.url), 'utf8');
test('reformer chooses equilibrium and preserves both independent temperature cases', async () => {
  const p = await planFromText(await read('reforming.txt'));
  assert.equal(p.ready, true);
  assert.equal(p.reactor, 'equilibrium');
  assert.deepEqual(
    p.conditions.map((c) => c.temperatureC),
    [710, 600],
  );
  assert.equal(p.feed.flow, 3700);
  assert.equal(p.feed.temperatureC, 520);
  assert.ok(p.assumptions.length);
  assert.throws(() => crossCheck(p), /HYSYS/);
});
test('toluene mass and atom balance, conversion and isomer split', async () => {
  const p = await planFromText(await read('toluene.txt'));
  assert.equal(p.ready, true);
  assert.equal(p.reactor, 'conversion');
  assert.equal(p.feed.pressureBar, 25);
  const r = crossCheck(p);
  assert.equal(r.isHysysResult, false);
  assert.ok(Math.abs(r.componentFlows.Toluene.kg_h - 5000) < 1e-8);
  assert.ok(
    Math.abs(Object.values(r.componentFlows).reduce((s, x) => s + x.kg_h, 0) - 10000) < 1e-7,
  );
  assert.ok(Object.values(r.elementResidual).every((x) => Math.abs(x) < 1e-8));
  assert.equal(r.componentFlows['o-Xylene'].moleFraction, 1 / 12);
  assert.equal(r.componentFlows.Benzene.moleFraction, 0.25);
});
test('toluene requires isomer selectivity even with known total conversion', async () => {
  const p = await planFromText((await read('toluene.txt')).split('邻、间')[0]);
  assert.equal(p.ready, false);
  assert.ok(p.questions.some((s) => s.includes('异构体')));
});
test('new hydrogenation reaction solves from generic JSON without scenario routing', async () => {
  const p = await planFromText(await read('hydrogenation.json'));
  assert.equal(p.ready, true);
  const r = crossCheck(p);
  assert.equal(r.componentFlows.Ethylene.kmol_h, 8);
  assert.equal(r.componentFlows.Hydrogen.kmol_h, 28);
  assert.equal(r.componentFlows.Ethane.kmol_h, 32);
});
test('equilibrium ammonia and Gibbs combustion choose different reactor models', async () => {
  const a = await planFromText(await read('ammonia-equilibrium.json')),
    b = await planFromText(await read('combustion-gibbs.json'));
  assert.equal(a.ready, true);
  assert.equal(b.ready, true);
  assert.equal(a.reactor, 'equilibrium');
  assert.equal(b.reactor, 'gibbs');
});
test('missing parameters and unsupported free text require clarification', async () => {
  const p = await planFromText('模拟一个新的化学反应');
  assert.equal(p.ready, false);
  assert.ok(p.questions.length >= 4);
});
test('unbalanced reaction is blocked', () => {
  const p = sample();
  p.reactions[0].stoichiometry.Ethane = 2;
  assert.equal(validatePlan(p).ready, false);
});
test('negative or nonsumming mole fractions are blocked', () => {
  for (const z of [
    { Ethylene: 0.4, Hydrogen: 0.7 },
    { Ethylene: -0.1, Hydrogen: 1.1 },
  ]) {
    const p = sample();
    p.feed.composition = z;
    assert.equal(validatePlan(p).ready, false);
  }
});
test('pressure must be absolute, positive, and not rise inside a passive reactor', () => {
  for (const v of [-1, 0, 21]) {
    const p = sample();
    p.conditions[0].pressureBar = v;
    assert.equal(validatePlan(p).ready, false);
  }
});
test('invalid conversion and missing base reactant are blocked', () => {
  for (const x of [-0.1, 1.1]) {
    const p = sample();
    p.reactions[0].conversion = x;
    assert.equal(validatePlan(p).ready, false);
  }
  const p = sample();
  p.reactions[0].baseComponent = 'Ethane';
  assert.equal(validatePlan(p).ready, false);
});
test('limiting reagent violation is reported rather than clamped to fake results', () => {
  const p = sample();
  p.feed.composition = { Ethylene: 0.9, Hydrogen: 0.1 };
  const plan = validatePlan(p);
  assert.equal(plan.ready, true);
  assert.throws(() => crossCheck(plan), /负物流/);
});
test('parallel conversion fractions cannot exceed one', () => {
  const p = sample();
  p.reactions.push(structuredClone(p.reactions[0]));
  assert.equal(validatePlan(p).ready, false);
});
test('kinetics select liquid CSTR or gas PFR but explicitly require an adapter', () => {
  for (const [phase, type] of [
    ['liquid', 'cstr'],
    ['gas', 'pfr'],
  ]) {
    const p = sample();
    p.kinetics = { rateConstant: 1 };
    p.phase = phase;
    const v = validatePlan(p);
    assert.equal(v.reactor, type);
    assert.equal(v.ready, false);
  }
});
test('do not infer equilibrium merely because conversion is missing', () => {
  const p = sample();
  delete p.reactions[0].conversion;
  const v = validatePlan(p);
  assert.equal(v.ready, false);
  assert.ok(v.questions.some((x) => x.includes('是否按化学平衡')));
});
test('formula parsing rejects malformed formula and ambiguous xylene', () => {
  assert.deepEqual(atoms('C7H8'), { C: 7, H: 8 });
  assert.ok(Math.abs(mw('Toluene') - 92.141) < 1e-8);
  assert.throws(() => atoms('C6H6!'));
  assert.throws(() => canonical('C8H10'), /歧义/);
});
test('NaN, null and duplicate components cannot become ready', () => {
  const p = sample();
  p.feed.flow = NaN;
  assert.equal(validatePlan(p).ready, false);
  assert.throws(() => validatePlan(null));
  const q = sample();
  q.components.push('Ethane');
  assert.equal(validatePlan(q).ready, false);
});
test('a fake or incomplete HYSYS result is rejected', () => {
  const p = validatePlan(sample());
  assert.throws(() => verifyResult(p, { source: 'stoichiometric-cross-check', cases: [] }), /来源/);
  assert.throws(
    () =>
      verifyResult(p, { source: 'hysys-com', isHysysResult: true, cases: [{ converged: false }] }),
    /求解/,
  );
});
test('HYSYS output mass and composition validation', () => {
  const p = validatePlan(sample()),
    r = crossCheck(p),
    total = Object.values(r.componentFlows).reduce((s, c) => s + c.kmol_h, 0);
  const vap = {
    name: 'Vapour',
    temperatureC: 160,
    pressureBar: 20,
    flowKmolH: total,
    composition: Object.fromEntries(
      Object.entries(r.componentFlows).map(([k, v]) => [k, v.moleFraction]),
    ),
  };
  const liq = { ...vap, name: 'Liquid', flowKmolH: 0 };
  const d = {
    source: 'hysys-com',
    isHysysResult: true,
    cases: [{ converged: true, streams: [vap, liq] }],
  };
  assert.equal(verifyResult(p, structuredClone(d)).cases[0].componentFlows.Ethane.kmol_h, 32);
  const bad = structuredClone(d);
  bad.cases[0].streams[0].flowKmolH *= 2;
  assert.throws(() => verifyResult(p, bad), /元素衡算/);
  const missing = structuredClone(d);
  delete missing.cases[0].streams[0].composition.Hydrogen;
  assert.throws(() => verifyResult(p, missing), /缺失/);
  const temp = structuredClone(d);
  temp.cases[0].streams[0].temperatureC = 100;
  assert.throws(() => verifyResult(p, temp), /温度/);
  const wrongConversion = structuredClone(d);
  wrongConversion.cases[0].streams[0].flowKmolH = 100;
  wrongConversion.cases[0].streams[0].composition = { Ethylene: 0.4, Hydrogen: 0.6, Ethane: 0 };
  assert.throws(() => verifyResult(p, wrongConversion), /转化率/);
});
test('language model output still passes deterministic validation', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ ...sample(), feed: { flow: -1 } }) } }],
    }),
  });
  try {
    const p = await planFromText('模拟新的反应', { apiKey: 'test-only', model: 'test' });
    assert.equal(p.plannerSource, 'llm');
    assert.equal(p.ready, false);
  } finally {
    globalThis.fetch = old;
  }
});
test('model HTTP errors do not expose credentials or response text', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    await assert.rejects(
      planFromText('模拟新的反应', { apiKey: 'never-print-this', model: 'test' }),
      (e) => !e.message.includes('never-print-this') && e.message.includes('401'),
    );
  } finally {
    globalThis.fetch = old;
  }
});
