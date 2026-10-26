// Optional development check: npm install --no-save playwright, then run this.
// Alternatively set PLAYWRIGHT_MODULE to an already-installed Playwright path.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let runningBrowser;
(async () => {
  const root = path.resolve(__dirname, '..'),
    out = path.join(root, 'docs/evidence');
  mkdirSync(out, { recursive: true });
  const options = { headless: true };
  if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(options);
  runningBrowser = browser;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: {
      dir: path.join(root, 'artifacts/browser-video'),
      size: { width: 1440, height: 1000 },
    },
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:3210');
  await page.waitForFunction(() => !document.querySelector('#health').textContent.includes('检测'));
  await page.locator('[data-example=toluene]').click();
  await page.locator('#analyze').click();
  await page.locator('#reactor-type').getByText('Conversion Reactor', { exact: true }).waitFor();
  assert.equal(await page.locator('#check').isDisabled(), true);
  await page.locator('#accept').check();
  await page.locator('#check').click();
  await page.getByText('独立计量校核 / 非 HYSYS', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 5);
  await page.screenshot({ path: path.join(out, 'workbench-desktop.png'), fullPage: true });
  const missing = '甲苯歧化，进料流量10000kg/h，进料温度380℃，操作压力2.5MPa，甲苯转化率50%';
  await page.locator('#request').fill(missing);
  await page.locator('#analyze').click();
  await page.getByText('需补充', { exact: true }).waitFor();
  assert.equal(await page.locator('#check').isDisabled(), true);
  assert.equal(await page.locator('#questions-box').isVisible(), true);
  await page.locator('[data-example=reforming]').click();
  await page.locator('#analyze').click();
  await page.getByText('Equilibrium Reactor', { exact: true }).waitFor();
  assert.equal(await page.locator('#conditions .condition').count(), 3);
  assert.equal(await page.locator('#check').isDisabled(), true);
  assert.ok((await page.locator('#conditions').textContent()).includes('600'));
  await page.screenshot({ path: path.join(out, 'reforming-plan.png'), fullPage: true });
  await page.locator('#json-example').click();
  await page.locator('#analyze').click();
  await page.getByText('Conversion Reactor', { exact: true }).waitFor();
  await page.locator('#check').click();
  await page.getByText('独立计量校核 / 非 HYSYS', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, 'workbench-mobile.png'), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  assert.deepEqual(errors, []);
  // A slow old planning response must not replace a newly edited request.
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('**/api/plan', async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await page.locator('#analyze').click();
  await page.waitForTimeout(150);
  await page.locator('#request').fill('这里已经换成另一条需求，旧方案不可运行');
  release();
  await page.waitForFunction(
    () => document.querySelector('#analyze').getAttribute('aria-busy') !== 'true',
  );
  assert.equal(await page.locator('#plan-body').isHidden(), true);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(path.join(out, 'local-demo.webm'));
  await browser.close();
  writeFileSync(
    path.join(out, 'browser-check.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        status: 'passed',
        checks: [
          'assumptions gate',
          'toluene material balance UI',
          'isomer clarification',
          'reformer two temperatures',
          'generic JSON hydrogenation',
          'mobile overflow',
          'no page errors',
          'stale response ignored after input edit',
        ],
        isHysysEvidence: false,
      },
      null,
      2,
    ),
  );
  console.log('Browser checks passed. Evidence saved to docs/evidence (local only).');
})().catch(async (e) => {
  console.error(e);
  await runningBrowser?.close();
  process.exitCode = 1;
});
