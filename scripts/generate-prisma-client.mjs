import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const fallbackDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/intraq_prisma_generate';
const databaseUrl = process.env.DATABASE_URL?.trim() || fallbackDatabaseUrl;

const result = spawnSync(npmCommand, ['run', 'db:generate', '--workspace', '@intraq/db'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  }
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
