import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const node24Requirement = 'Node.js >=24.15.0 <25';

export function assertNode24Lts() {
  if (!isNode24Lts()) {
    throw new Error(`${node24Requirement} is required for this project. Found v${process.versions.node}. Use Node 24 LTS before building or releasing.`);
  }
}

export function ensureNode24Lts() {
  if (isNode24Lts()) return;

  const candidate = findNode24Binary();
  if (candidate && path.resolve(candidate) !== path.resolve(process.execPath)) {
    const child = spawnSync(candidate, process.argv.slice(1), {
      env: {
        ...process.env,
        PATH: [path.dirname(candidate), process.env.PATH].filter(Boolean).join(path.delimiter)
      },
      stdio: 'inherit'
    });
    if (child.error) throw child.error;
    process.exit(child.status ?? 1);
  }

  assertNode24Lts();
}

export function nodeFirstEnv(env = process.env) {
  const nodeBinDir = path.dirname(process.execPath);
  return {
    ...env,
    PATH: [nodeBinDir, env.PATH].filter(Boolean).join(path.delimiter)
  };
}

export function npmCommand(args) {
  const npmExecPath = process.env.npm_execpath?.trim();
  if (npmExecPath && npmExecPath.endsWith('.js')) {
    return { command: process.execPath, args: [npmExecPath, ...args] };
  }
  return { command: 'npm', args };
}

function isNode24Lts() {
  const [major, minor] = process.versions.node.split('.').map(value => Number(value));
  return major === 24 && minor >= 15;
}

function findNode24Binary() {
  const candidates = [
    process.env.INTRAQ_NODE24_BIN?.trim(),
    '/opt/homebrew/opt/node@24/bin/node',
    '/usr/local/opt/node@24/bin/node'
  ].filter(Boolean);

  return candidates.find(candidate => existsSync(candidate) && isUsableNode24(candidate));
}

function isUsableNode24(candidate) {
  const result = spawnSync(candidate, ['-e', `
const [major, minor] = process.versions.node.split('.').map(Number);
process.exit(major === 24 && minor >= 15 ? 0 : 1);
`], { stdio: 'ignore' });
  return result.status === 0;
}
