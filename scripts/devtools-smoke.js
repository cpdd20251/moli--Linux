const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const child = spawn(electron, [root], {
  cwd: root,
  env: {
    ...process.env,
    MOLI_DEVTOOLS_SMOKE: '1'
  },
  stdio: 'inherit'
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
