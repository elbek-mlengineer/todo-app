import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exitCode = code;
}
function start(dir, script) {
  const child = spawn(npm, ['run', script], { cwd: resolve(root, dir), stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true });
  children.push(child);
  child.on('error', () => stop(1)); child.on('exit', code => stop(code || 0));
}
function listening(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.setTimeout(1000, () => done(false));
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
if (await listening(3000) || await listening(3001)) {
  console.error('A todo server is already running on port 3000 or 3001. Stop its terminal with Ctrl+C before running npm run dev again.');
  process.exitCode = 1;
} else {
  start('todo_backend', 'start:dev');
  let ready = false;
  for (let n = 0; n < 90 && !stopping; n++) {
    try { const r = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(1000) }); ready = r.ok && (await r.json()).status === 'ok'; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!stopping && ready) start('todo_frontend', 'dev');
  else if (!stopping) { console.error('Backend did not become ready. Check PostgreSQL and run npm run db:migrate.'); stop(1); }
}
