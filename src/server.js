import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { planFromText, SCHEMA_EXAMPLE } from './planner.js';
import { crossCheck } from './chemistry.js';
import { doctor, simulate, ROOT } from './hysys.js';
export function createServer() {
  const plans = new Map();
  return http.createServer(async (req, res) => {
    const reply = (code, data) => {
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || ''))
        return reply(403, { error: '只接受本机 Host。' });
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`)
        return reply(403, { error: '只接受本机页面请求。' });
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health')
        return reply(200, {
          hysys: await doctor(),
          planner: process.env.LLM_API_KEY && process.env.LLM_MODEL ? 'llm' : 'local-parser',
        });
      if (req.method === 'GET' && url.pathname === '/api/schema') return reply(200, SCHEMA_EXAMPLE);
      if (
        req.method === 'POST' &&
        ['/api/plan', '/api/check', '/api/simulate'].includes(url.pathname)
      ) {
        if (!req.headers['content-type']?.startsWith('application/json'))
          return reply(415, { error: '需要 application/json。' });
        let body = '';
        for await (const c of req) {
          body += c;
          if (Buffer.byteLength(body) > 100000) return reply(413, { error: '请求过大。' });
        }
        const data = JSON.parse(body);
        if (url.pathname === '/api/plan') {
          const plan = await planFromText(data.text, {
            apiKey: process.env.LLM_API_KEY,
            model: process.env.LLM_MODEL,
            baseURL: process.env.LLM_BASE_URL,
          });
          const id = randomUUID();
          plans.set(id, plan);
          if (plans.size > 100) plans.delete(plans.keys().next().value);
          return reply(200, { id, plan });
        }
        const plan = plans.get(data.id);
        if (!plan) return reply(404, { error: '方案已过期，请重新分析。' });
        if (!plan.ready)
          return reply(422, { error: '请先补充信息并重新分析。', questions: plan.questions });
        if (data.acceptAssumptions !== true && plan.assumptions.length)
          return reply(422, { error: '请先阅读并勾选建模假设。' });
        return reply(200, url.pathname === '/api/check' ? crossCheck(plan) : await simulate(plan));
      }
      const pages = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
      if (req.method === 'GET' && pages[url.pathname]) {
        const f = pages[url.pathname];
        res.writeHead(200, {
          'Content-Type': f.endsWith('.html')
            ? 'text/html; charset=utf-8'
            : f.endsWith('.js')
              ? 'text/javascript; charset=utf-8'
              : 'text/css; charset=utf-8',
          'Content-Security-Policy':
            "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff',
        });
        return res.end(await readFile(path.join(ROOT, 'public', f)));
      }
      reply(404, { error: '页面不存在。' });
    } catch (e) {
      reply(400, { error: e.message });
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'src/server.js'))
  createServer().listen(Number(process.env.PORT || 3210), '127.0.0.1', () =>
    console.log(`Reactor Workbench: http://127.0.0.1:${process.env.PORT || 3210}`),
  );
