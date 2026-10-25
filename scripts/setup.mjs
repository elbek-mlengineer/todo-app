import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootEnv = resolve(root, '.env');
if (!existsSync(rootEnv)) writeFileSync(rootEnv, `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\n`);
const password = readFileSync(rootEnv, 'utf8').match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]?.trim();
if (!password) throw new Error('Root .env must contain POSTGRES_PASSWORD.');
const backendEnv = resolve(root, 'todo_backend/.env');
if (!existsSync(backendEnv)) {
  const template = readFileSync(resolve(root, 'todo_backend/.env.example'), 'utf8');
  writeFileSync(backendEnv, template.replace('YOUR_LOCAL_PASSWORD', encodeURIComponent(password)));
}
const frontEnv = resolve(root, 'todo_frontend/.env.local');
if (!existsSync(frontEnv)) writeFileSync(frontEnv, 'API_INTERNAL_URL=http://127.0.0.1:3001\n');
console.log('Local environment ready. Existing configuration was preserved. Read README.md for Google/Telegram setup.');
