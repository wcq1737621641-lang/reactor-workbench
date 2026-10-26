import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

async function unusedPort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
test('launcher starts and recognizes an existing workbench without opening extra servers', async (t) => {
  const port = await unusedPort();
  const env = { ...process.env, PORT: String(port) };
  const server = spawn(process.execPath, ['src/launch.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Launcher startup timed out')), 10000);
    server.stdout.on('data', (data) => {
      if (data.toString().includes('Reactor Workbench:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('error', reject);
    server.once('exit', (code) => {
      if (code) reject(Error('Launcher exited: ' + code));
    });
  });
  const result = await (await fetch(`http://127.0.0.1:${port}/api/version`)).json();
  assert.equal(result.app, 'reactor-workbench');
  const duplicate = await exec(process.execPath, ['src/launch.js'], { env, timeout: 10000 });
  assert.match(duplicate.stdout, /already running/);
});
test('launcher rejects invalid port with a useful error', async () => {
  await assert.rejects(
    exec(process.execPath, ['src/launch.js'], { env: { ...process.env, PORT: 'invalid' } }),
    (error) => error.stderr.includes('PORT must be'),
  );
});
