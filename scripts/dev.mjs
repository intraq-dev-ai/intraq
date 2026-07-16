import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const envPath = new URL('../.env', import.meta.url);
if (existsSync(envPath)) loadEnvFile(envPath);

const processes = [
  {
    name: 'api',
    args: ['run', 'dev', '--workspace', '@intraq/api']
  },
  {
    name: 'web',
    args: ['run', 'dev', '--workspace', '@intraq/web']
  }
];

const children = processes.map(({ name, args }) => {
  const child = spawn(npmCommand, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      API_PORT: process.env.API_PORT ?? '4100'
    }
  });

  child.on('exit', code => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      for (const other of children) {
        if (other.pid !== child.pid) other.kill();
      }
      process.exitCode = code;
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) child.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
