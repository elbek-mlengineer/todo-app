const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const result = spawnSync(process.execPath, ['--experimental-vm-modules', resolve(__dirname, '../node_modules/jest/bin/jest.js'), '--runInBand'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_REAL_POSTGRES: 'true' },
});
process.exitCode = result.status ?? 1;
