import { readFile } from 'node:fs/promises';
import { planFromText } from './planner.js';
import { crossCheck } from './chemistry.js';
import { simulate, doctor } from './hysys.js';
try {
  const [command = 'help', file] = process.argv.slice(2);
  if (command === 'doctor') console.log(JSON.stringify(await doctor(), null, 2));
  else if (['plan', 'check', 'run'].includes(command) && file) {
    const text = await readFile(file, 'utf8');
    const p = await planFromText(text, {
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      baseURL: process.env.LLM_BASE_URL,
    });
    if (command === 'plan' || !p.ready) console.log(JSON.stringify(p, null, 2));
    else if (p.assumptions.length && !process.argv.includes('--accept-assumptions'))
      throw Error('先执行 plan 查看假设，再添加 --accept-assumptions。');
    else
      console.log(JSON.stringify(command === 'check' ? crossCheck(p) : await simulate(p), null, 2));
    if (!p.ready) process.exitCode = 2;
  } else
    console.log(
      'Usage: npm run cli -- plan|check|run request.txt [--accept-assumptions]\n       npm run cli -- doctor',
    );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
