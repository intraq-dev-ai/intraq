import { existsSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { seedBaseline } from './baseline-seed.js';

loadSeedEnv();

const prisma = new PrismaClient();

try {
  const result = await seedBaseline(prisma);
  console.log(`Seeded intraQ DB baseline: ${JSON.stringify(result)}`);
} finally {
  await prisma.$disconnect();
}

function loadSeedEnv(): void {
  loadEnvFile(new URL('../../../../.env', import.meta.url));
  loadEnvFile(new URL('../../.env', import.meta.url));
  if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
    loadEnvFile(new URL('../../.env.example', import.meta.url));
  }
}

function loadEnvFile(path: URL): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match?.[1] || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquote(match[2] ?? '');
  }
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
