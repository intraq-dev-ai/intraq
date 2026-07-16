import { readFile } from 'node:fs/promises';
import type { IntraQPrismaClient } from '@intraq/db';
import { decodeSecret, encodeSecret } from '../../security/secret-codec.js';
import {
  codexAuthPathFromEnv,
  isUsableCodexAuthPayload,
  writeCodexAuthPayload
} from './codex-oauth-flow.js';

const DEFAULT_CODEX_MODEL = 'gpt-5.5';
const CODEX_AUTH_SETTING_KEY = 'codex.oauth.payload';
const CODEX_MODEL_SETTING_KEY = 'codex.oauth.model';

interface CodexOAuthPersistenceOptions {
  authPath?: string;
  env?: NodeJS.ProcessEnv;
  force?: boolean;
  model?: string | null;
  tenantId?: string | null;
}

interface CodexOAuthRestoreResult {
  authPath: string;
  reason: 'file_ready' | 'missing_db_auth' | 'no_database' | 'restored_from_db';
  restored: boolean;
}

export async function persistCodexOAuthPayload(
  client: IntraQPrismaClient | null,
  payload: unknown,
  options: CodexOAuthPersistenceOptions = {}
): Promise<void> {
  if (!client || !isUsableCodexAuthPayload(payload)) return;
  const model = nonEmptyString(options.model) ?? await resolveCodexModelSetting(client) ?? DEFAULT_CODEX_MODEL;
  await upsertSystemSetting(client, CODEX_AUTH_SETTING_KEY, encodeSecret(JSON.stringify(payload), options.env), 'Codex OAuth payload.');
  await saveCodexModelSetting(client, model);
}

export async function restoreCodexOAuthPayloadFromDb(
  client: IntraQPrismaClient | null,
  options: CodexOAuthPersistenceOptions = {}
): Promise<CodexOAuthRestoreResult> {
  const authPath = options.authPath ?? codexAuthPathFromEnv(options.env);
  if (!client) return { authPath, reason: 'no_database', restored: false };
  if (options.force !== true && await hasUsableAuthFile(authPath)) {
    return { authPath, reason: 'file_ready', restored: false };
  }

  const row = await client.systemSetting.findUnique({ where: { key: CODEX_AUTH_SETTING_KEY } });
  const payload = row ? readPersistedPayload(row.value, options.env) : null;
  if (isUsableCodexAuthPayload(payload)) {
    await writeCodexAuthPayload(authPath, payload);
    return { authPath, reason: 'restored_from_db', restored: true };
  }

  return { authPath, reason: 'missing_db_auth', restored: false };
}

export async function resolveCodexModelSetting(
  client: IntraQPrismaClient | null,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<string | null> {
  if (!client) return nonEmptyString(options.env?.CODEX_AGENT_MODEL) ?? null;
  const row = await client.systemSetting.findUnique({ where: { key: CODEX_MODEL_SETTING_KEY } });
  return nonEmptyString(row?.value) ?? nonEmptyString(options.env?.CODEX_AGENT_MODEL) ?? null;
}

export async function saveCodexModelSetting(
  client: IntraQPrismaClient | null,
  model: string
): Promise<void> {
  const normalized = nonEmptyString(model);
  if (!client || !normalized) return;
  await upsertSystemSetting(client, CODEX_MODEL_SETTING_KEY, normalized, 'Codex model for AI.');
}

async function hasUsableAuthFile(authPath: string): Promise<boolean> {
  try {
    const raw = await readFile(authPath, 'utf8');
    return isUsableCodexAuthPayload(JSON.parse(raw) as unknown);
  } catch {
    return false;
  }
}

function readPersistedPayload(value: string, env: NodeJS.ProcessEnv | undefined): unknown {
  try {
    return JSON.parse(decodeSecret(value, env));
  } catch {
    return null;
  }
}

async function upsertSystemSetting(
  client: IntraQPrismaClient,
  key: string,
  value: string,
  description: string
): Promise<void> {
  await client.systemSetting.upsert({
    where: { key },
    create: { key, value, category: 'ai', description },
    update: { value, category: 'ai', description }
  });
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
