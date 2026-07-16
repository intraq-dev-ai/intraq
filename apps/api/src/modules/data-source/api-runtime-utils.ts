import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_TABLE_NAME,
  MAX_ROWS,
  type ApiRuntimeResult
} from './api-runtime-types.js';

export function compactTemplateValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

export function credentialValue(value: unknown, fallback?: unknown): unknown {
  return hasCredentialValue(value) ? value : fallback;
}

export function hasCredentialValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function normalizeBodyFormat(value: string | undefined): string {
  const normalized = value?.toLowerCase().replace(/[\s_-]+/g, '') ?? '';
  if (normalized.includes('xwwwformurlencoded') || normalized === 'form' || normalized === 'urlencoded') return 'form';
  if (normalized === 'raw' || normalized === 'text') return 'raw';
  return 'json';
}

export function withOptionalContentType(
  body: string,
  headers: Record<string, string>,
  contentType: string
): { body: string; contentType?: string } {
  return hasHeader(headers, 'content-type') ? { body } : { body, contentType };
}

export function appendFormValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendFormValue(params, key, item);
    return;
  }
  params.append(key, String(value));
}

export function hasHeader(headers: Record<string, string>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some(key => key.toLowerCase() === normalized);
}

export function firstStringPath(value: unknown, paths: Array<string | undefined>): string | undefined {
  for (const path of paths) {
    if (!path) continue;
    const item = readPath(value, path);
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return undefined;
}

export function firstPath(value: unknown, paths: Array<string | undefined>): unknown {
  for (const path of paths) {
    if (!path) continue;
    const item = readPath(value, path);
    if (item !== undefined && item !== null && item !== '') return item;
  }
  return undefined;
}

export function applyRecordTemplate(
  value: Record<string, unknown>,
  templateValues: Record<string, unknown>
): ApiRuntimeResult<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const templated = applyValueTemplate(item, templateValues);
    if (!templated.ok) return templated;
    output[key] = templated.data;
  }
  return { ok: true, data: output };
}

export function applyAuthValueTemplate(
  value: string,
  templateValues: Record<string, unknown>
): ApiRuntimeResult<string> {
  const templated = applyValueTemplate(value, templateValues);
  if (!templated.ok) return templated;
  return { ok: true, data: String(templated.data) };
}

export function applyValueTemplate(value: unknown, templateValues: Record<string, unknown>): ApiRuntimeResult<unknown> {
  if (typeof value === 'string') {
    try {
      const exact = exactTemplateValue(value, templateValues);
      if (exact.ok) return { ok: true, data: exact.data };
      return { ok: true, data: applyTemplate(value, templateValues) };
    } catch (error) {
      return { ok: false, statusCode: 400, error: error instanceof Error ? error.message : 'Missing API parameter value' };
    }
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const templated = applyValueTemplate(item, templateValues);
      if (!templated.ok) return templated;
      items.push(templated.data);
    }
    return { ok: true, data: items };
  }
  if (isRecord(value)) {
    const record = applyRecordTemplate(value, templateValues);
    return record.ok ? { ok: true, data: record.data } : record;
  }
  return { ok: true, data: value };
}

export function exactTemplateValue(value: string, templateValues: Record<string, unknown>): { ok: true; data: unknown } | { ok: false } {
  const match = /^\s*\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\s*$/.exec(value);
  if (!match?.[1]) return { ok: false };
  const replacement = readPath(templateValues, match[1]);
  if (replacement === undefined || replacement === null) {
    throw new Error(`Missing API parameter value: ${match[1]}`);
  }
  return { ok: true, data: replacement };
}

export function applyTemplate(value: string, templateValues: Record<string, unknown>): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const replacement = readPath(templateValues, key);
    if (replacement === undefined || replacement === null) {
      throw new Error(`Missing API parameter value: ${key}`);
    }
    return String(replacement);
  });
}

export function readPath(value: unknown, path: string): unknown {
  const parts = path.split('.').flatMap(part => {
    const tokens: string[] = [];
    part.replace(/([^\[\]]+)|\[(\d+)\]/g, (_match, key: string | undefined, index: string | undefined) => {
      tokens.push(key ?? index ?? '');
      return '';
    });
    return tokens.filter(Boolean);
  });
  return parts.reduce<unknown>((current, part) => {
    const value = typeof current === 'string' ? parseJsonContainer(current) : current;
    if (Array.isArray(value)) return part === 'length' ? value.length : value[Number(part)];
    return isRecord(value) ? readRecordPathPart(value, part) : undefined;
  }, value);
}

export function readRecordPathPart(value: Record<string, unknown>, part: string): unknown {
  if (Object.prototype.hasOwnProperty.call(value, part)) return value[part];
  const lower = part.toLowerCase();
  const matches = Object.keys(value).filter(key => key.toLowerCase() === lower);
  return matches.length === 1 ? value[matches[0]!] : undefined;
}

export function parseJsonContainer(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function readObjectConfig(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return { ...value };
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readBooleanConfig(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

export function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

export function serializeTokenBody(
  value: unknown,
  bodyFormat: string,
  headers: Record<string, string>
): { body: string; contentType?: string } {
  if (bodyFormat === 'raw') return { body: typeof value === 'string' ? value : JSON.stringify(value) };
  if (bodyFormat === 'form') {
    const params = new URLSearchParams();
    if (isRecord(value)) {
      for (const [key, item] of Object.entries(value)) appendFormValue(params, key, item);
    } else if (typeof value === 'string') {
      return withOptionalContentType(value, headers, 'application/x-www-form-urlencoded');
    }
    return withOptionalContentType(params.toString(), headers, 'application/x-www-form-urlencoded');
  }
  return withOptionalContentType(typeof value === 'string' ? value : JSON.stringify(value), headers, 'application/json');
}

export function stringifyHeaders(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (item === undefined || item === null || item === '') return [];
    return [[key, String(item)]];
  }));
}

export function appendQueryParam(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    for (const item of value) appendQueryParam(url, key, item);
    return;
  }
  url.searchParams.set(key, String(value));
}

export function normalizedLimit(defaultLimit: unknown, maxLimit: unknown): number {
  return Math.min(
    boundedNumber(defaultLimit, MAX_ROWS, MAX_ROWS),
    boundedNumber(maxLimit, MAX_ROWS, MAX_ROWS)
  );
}

export function boundedNumber(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

export function readApiRequestTimeoutMs(config: Record<string, unknown>): number {
  return boundedNumber(
    config.timeoutMs ?? config.requestTimeoutMs ?? config.queryTimeoutMs ?? config.sqlQueryTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    120_000
  );
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || DEFAULT_TABLE_NAME;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(item => readString(item) ?? []);
  const single = readString(value);
  return single ? single.split(',').map(item => item.trim()).filter(Boolean) : [];
}
