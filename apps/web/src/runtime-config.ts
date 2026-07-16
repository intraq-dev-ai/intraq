type RuntimeConfigKey =
  | 'BACKEND_URL'
  | 'FRONTEND_URL'
  | 'VITE_API_BASE_URL'
  | 'VITE_API_URL'
  | 'VITE_DEPLOYMENT_TYPE';

type RuntimeConfig = Partial<Record<RuntimeConfigKey, string>>;

declare global {
  interface Window {
    RUNTIME_CONFIG?: RuntimeConfig;
  }
}

export function readRuntimeConfigValue(key: RuntimeConfigKey): string | null {
  const runtimeValue = runtimeConfigValue(key);
  if (runtimeValue) return runtimeValue;
  return envValue(key);
}

export function readRuntimeDeploymentType(): string {
  return readRuntimeConfigValue('VITE_DEPLOYMENT_TYPE') ?? '';
}

export function readRuntimeApiBase(): string {
  const runtimeConfigured = firstNonEmpty(
    runtimeConfigValue('VITE_API_BASE_URL'),
    runtimeConfigValue('BACKEND_URL'),
    runtimeConfigValue('VITE_API_URL')
  );
  if (runtimeConfigured) return normalizeApiBase(runtimeConfigured);
  const envConfigured = firstNonEmpty(envValue('VITE_API_BASE_URL'), envValue('VITE_API_URL'));
  return envConfigured ? normalizeApiBase(envConfigured) : '/api';
}

function runtimeConfigValue(key: RuntimeConfigKey): string | null {
  const value = browserWindow()?.RUNTIME_CONFIG?.[key];
  return normalizeString(value);
}

function envValue(key: RuntimeConfigKey): string | null {
  const value = importMetaEnv()?.[key];
  return normalizeString(value);
}

function browserWindow(): Window | undefined {
  if (typeof globalThis !== 'object' || !('window' in globalThis)) return undefined;
  const value = (globalThis as { window?: unknown }).window;
  return value && typeof value === 'object' ? value as Window : undefined;
}

function importMetaEnv(): Record<string, string | undefined> | undefined {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  return meta.env;
}

function normalizeApiBase(value: string): string {
  if (/^https?:\/\//i.test(value) || value.startsWith('//')) {
    return value.replace(/\/+$/, '');
  }
  const trimmed = value.trim();
  if (!trimmed) return '/api';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || '/api';
}

function firstNonEmpty(...values: Array<string | null>): string | null {
  return values.find((value): value is string => Boolean(value)) ?? null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
