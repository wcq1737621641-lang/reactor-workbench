import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createServer } from '../src/server.js';
import { SCHEMA_EXAMPLE } from '../src/planner.js';
test('local HTTP flow, stale plans, missing assumptions, and source labels', async (t) => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, data, headers = {}) =>
    fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  assert.equal((await fetch(base + '/')).status, 200);
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(typeof health.hysys.available, 'boolean');
  assert.equal(typeof health.hysys.message, 'string');
  const response = await post('/api/plan', { text: JSON.stringify(SCHEMA_EXAMPLE) });
  assert.equal(response.status, 200);
  const { id, plan } = await response.json();
  assert.equal(plan.ready, true);
  const check = await post('/api/check', { id });
  assert.equal(check.status, 200);
  assert.equal((await check.json()).isHysysResult, false);
  assert.equal((await post('/api/check', { id: 'missing' })).status, 404);
  assert.equal(
    (await post('/api/plan', { text: 'test' }, { Origin: 'https://untrusted.invalid' })).status,
    403,
  );
  const badHost = await new Promise((resolve, reject) => {
    const req = httpRequest(base + '/', { headers: { Host: 'untrusted.invalid' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(badHost, 403);
  const p = { ...SCHEMA_EXAMPLE, assumptions: ['演示假设'] };
  const a = await (await post('/api/plan', { text: JSON.stringify(p) })).json();
  assert.equal((await post('/api/check', { id: a.id })).status, 422);
  assert.equal((await post('/api/check', { id: a.id, acceptAssumptions: true })).status, 200);
  const incomplete = await (await post('/api/plan', { text: '甲苯歧化' })).json();
  assert.equal((await post('/api/simulate', { id: incomplete.id })).status, 422);
  assert.equal((await fetch(base + '/../.env')).status, 404);
});
