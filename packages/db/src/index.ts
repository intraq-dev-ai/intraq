import { existsSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

export { seedBaseline } from './seed/baseline-seed.js';
export type { BaselineSeedOptions, BaselineSeedResult } from './seed/baseline-seed.js';
export { Prisma, PrismaClient } from '@prisma/client';
export type { PrismaClient as IntraQPrismaClient } from '@prisma/client';

export function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL ?? readLocalDatabaseUrl();
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
  return new PrismaClient();
}

function readLocalDatabaseUrl(): string | undefined {
  const envPath = new URL('../.env', import.meta.url);
  if (!existsSync(envPath)) return undefined;
  const content = readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find(item => item.trim().startsWith('DATABASE_URL='));
  if (!line) return undefined;
  const [, rawValue] = line.split(/=(.*)/s);
  const value = rawValue?.trim();
  if (!value) return undefined;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
