import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { validateRuntimeSecrets } from './security/runtime-secrets.js';

export interface ApiConfig {
  acceptAuthCookie?: boolean;
  dashboardPersistence?: 'memory' | 'prisma';
  enableRuntimeDiagnostics?: boolean;
  enforceApiAuth?: boolean;
  host: string;
  port: number;
  seedDemoRuntime?: boolean;
  serveWebFromApi?: boolean;
  webOrigin: string;
  staticWebDir: string;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (env === process.env) loadRootEnvFile();
  validateRuntimeSecrets(env);
  return {
    acceptAuthCookie: parseBoolean(env.API_ACCEPT_AUTH_COOKIE) ?? false,
    dashboardPersistence: env.DASHBOARD_PERSISTENCE === 'memory' || !env.DATABASE_URL?.trim() ? 'memory' : 'prisma',
    enableRuntimeDiagnostics: parseBoolean(env.ENABLE_RUNTIME_DIAGNOSTICS) ?? false,
    enforceApiAuth: parseBoolean(env.API_ENFORCE_AUTH) ?? env.NODE_ENV === 'production',
    host: env.API_HOST?.trim() || '127.0.0.1',
    port: parsePort(env.API_PORT ?? env.PORT),
    seedDemoRuntime: env.SEED_DEMO_RUNTIME !== 'false',
    serveWebFromApi: parseBoolean(env.SERVE_WEB_FROM_API) ?? true,
    webOrigin: env.WEB_ORIGIN ?? 'http://127.0.0.1:5173',
    staticWebDir: env.WEB_DIST_DIR ?? fileURLToPath(new URL('../../web/dist/', import.meta.url))
  };
}

let envLoaded = false;

function loadRootEnvFile(): void {
  if (envLoaded) return;
  envLoaded = true;
  const path = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(path)) loadEnvFile(path);
}

function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function parsePort(value: string | undefined): number {
  if (!value) return 4100;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4100;
}
