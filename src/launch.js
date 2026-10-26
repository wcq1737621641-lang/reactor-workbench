import { execFile } from 'node:child_process';
import { createServer } from './server.js';

const port = Number(process.env.PORT || 3210);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('PORT must be an integer between 1024 and 65535. Edit .env and restart.');
  process.exit(1);
}
const url = `http://127.0.0.1:${port}`;
function ready() {
  console.log(`Reactor Workbench: ${url}`);
  if (!process.argv.includes('--open')) return;
  const [command, args] =
    process.platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  execFile(command, args, { windowsHide: true }, (error) => {
    if (error) console.log(`Open this address in your browser: ${url}`);
  });
}
const server = createServer();
server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`${url}/api/version`, { signal: AbortSignal.timeout(3000) });
      const identity = await response.json();
      if (identity.app === 'reactor-workbench') {
        console.log('The workbench is already running.');
        ready();
        return;
      }
    } catch {}
    console.error(`Port ${port} is occupied. Set another PORT in .env, then restart.`);
  } else console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', ready);
