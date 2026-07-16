import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { resolveAuthTokenSecret } from '../../security/runtime-secrets.js';

const CONFIG_SECRET_PREFIX = 'enc:ds:v1:';
const SAFE_CONFIG_KEYS = new Set([
  'allowBodyOnGet',
  'authType',
  'authVariableLookup',
  'baseDataSourceId',
  'baseUrl',
  'bucket',
  'catalog',
  'columns',
  'credentialLookup',
  'database',
  'dataPath',
  'endpoint',
  'format',
  'host',
  'httpPath',
  'method',
  'outputLocation',
  'parameters',
  'path',
  'pagination',
  'port',
  'protocol',
  'query',
  'region',
  'responseMapping',
  'rowContextColumns',
  'schema',
  'serverHostname',
  'ssl',
  'templateVariableLookup',
  'tokenApplyAs',
  'tokenAllowBodyOnGet',
  'tokenBaseUrl',
  'tokenBodyFormat',
  'tokenCacheTtlSeconds',
  'tokenEndpoint',
  'tokenExpiresAtPath',
  'tokenExpiresInPath',
  'tokenHeaderName',
  'tokenMethod',
  'tokenQueryParam',
  'tokenResponsePath',
  'tokenScheme',
  'tokenTypePath',
  'warehouseId',
  'workgroup'
]);

export function encodeDataSourceConfig(config: Record<string, unknown>): string {
  const plaintext = JSON.stringify(config);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataSourceConfigKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CONFIG_SECRET_PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
}

export function decodeDataSourceConfig(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return decodeConfigString(value);
  if (isRecord(value)) {
    const encrypted = typeof value.encrypted === 'string'
      ? value.encrypted
      : typeof value.__encrypted === 'string'
        ? value.__encrypted
        : null;
    return encrypted ? decodeConfigString(encrypted) : { ...value };
  }
  return {};
}

export function maskDataSourceConfig(config: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SAFE_CONFIG_KEYS.has(key)) safe[key] = value;
    if (key === 'tokenRequest' && isRecord(value)) safe[key] = maskTokenRequestConfig(value);
  }
  return safe;
}

function maskTokenRequestConfig(config: Record<string, unknown>): Record<string, unknown> {
  const apply = isRecord(config.apply) ? config.apply : {};
  return {
    ...pickSafe(config, [
      'applyAs',
      'allowBodyOnGet',
      'baseUrl',
      'bodyFormat',
      'cacheSkewSeconds',
      'cacheTtlSeconds',
      'contentType',
      'endpoint',
      'expiresAtPath',
      'expiresInPath',
      'headerName',
      'method',
      'path',
      'queryParam',
      'scheme',
      'tokenPath',
      'tokenTypePath',
      'url',
      'valuePrefix'
    ]),
    ...(Object.keys(apply).length > 0 ? {
      apply: pickSafe(apply, ['as', 'type', 'headerName', 'queryParam', 'scheme', 'valuePrefix'])
    } : {}),
    ...(hasConfiguredValue(config.body ?? config.requestBody ?? config.bodyTemplate) ? { bodyConfigured: true } : {}),
    ...(hasConfiguredValue(config.headers) ? { headerNames: Object.keys(isRecord(config.headers) ? config.headers : {}) } : {}),
    ...(hasConfiguredValue(config.queryParams ?? config.params) ? { queryParamNames: configuredObjectKeys(config.queryParams ?? config.params) } : {})
  };
}

function pickSafe(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.flatMap(key => key in value ? [[key, value[key]]] : []));
}

function hasConfiguredValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function configuredObjectKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function decodeConfigString(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (!trimmed.startsWith(CONFIG_SECRET_PREFIX)) {
    return parseJsonConfigString(trimmed) ?? decodeLegacyEncryptedConfigString(trimmed) ?? {};
  }

  const [, namespace, version, ivText, tagText, encryptedText] = trimmed.split(':');
  if (namespace !== 'ds' || version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw new Error('Data source configuration secret is malformed.');
  }

  const decipher = createDecipheriv('aes-256-gcm', dataSourceConfigKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final()
  ]).toString('utf8');
  const parsed = JSON.parse(decrypted) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function parseJsonConfigString(value: string): Record<string, unknown> | null {
  if (!value.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function decodeLegacyEncryptedConfigString(value: string): Record<string, unknown> | null {
  const [ivText, encryptedText, ...extraParts] = value.split(':');
  if (extraParts.length > 0 || !isHexString(ivText, 32) || !isHexString(encryptedText)) return null;
  const key = legacyDataSourceConfigKey();
  if (!key) return null;

  try {
    const decipher = createDecipheriv('aes-256-cbc', key, Buffer.from(ivText, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'hex')),
      decipher.final()
    ]).toString('utf8');
    const parsed = JSON.parse(decrypted) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function dataSourceConfigKey(): Buffer {
  const secret = process.env.DATA_SOURCE_CONFIG_ENCRYPTION_KEY?.trim()
    || process.env.INTRAQ_SECRET_KEY?.trim()
    || process.env.SESSION_SECRET?.trim()
    || process.env.ENCRYPTION_KEY?.trim()
    || resolveAuthTokenSecret();
  return createHash('sha256').update(secret).digest();
}

function legacyDataSourceConfigKey(): Buffer | null {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) return null;
  return Buffer.from(secret.padEnd(32, '0').slice(0, 32));
}

function isHexString(value: string | undefined, expectedLength?: number): value is string {
  if (!value) return false;
  if (expectedLength !== undefined && value.length !== expectedLength) return false;
  return value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
