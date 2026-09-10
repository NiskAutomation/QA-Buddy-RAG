import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const automationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = await readFile(path.join(automationRoot, 'sample-app', 'index.html'));
const playwrightCli = path.join(automationRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const cucumberCli = path.join(automationRoot, 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');

const server = createServer((request, response) => {
  if (request.url === '/' || request.url === '/index.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else response.end(page);
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const run = (script, args, env = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: automationRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${path.basename(script)} failed (${signal ?? code})`));
  });
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(4173, '127.0.0.1', resolve);
});

try {
  await run(playwrightCli, ['test', ...process.argv.slice(2)], { PW_EXTERNAL_SERVER: '1' });
  await run(cucumberCli, ['--config', 'cucumber.js']);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
