import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { uuidv7 } from '@intraq/contracts';
import { resolveAuthTokenSecret } from '../../security/runtime-secrets.js';

const TOKEN_VERSION = 'v2';
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 8;

export interface AuthTokenPayload {
  contextUserId?: string;
  exp: number;
  role: string;
  scopes?: string[];
  sub: string;
  tenantId?: string;
  tenantType?: string;
}

export function createAccessToken(input: {
  contextUserId?: string;
  role: string;
  scopes?: string[];
  tenantId?: string;
  tenantType?: string;
  ttlMs?: number;
  userId: string;
}): string {
  const payload: AuthTokenPayload = {
    ...(input.contextUserId ? { contextUserId: input.contextUserId } : {}),
    exp: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
    role: input.role,
    ...(input.scopes?.length ? { scopes: input.scopes } : {}),
    sub: input.userId,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.tenantType ? { tenantType: input.tenantType } : {})
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return [TOKEN_VERSION, encodedPayload, sign(encodedPayload)].join('.');
}

export function createRefreshToken(): string {
  return `refresh.${uuidv7()}.${base64UrlEncode(randomBytes(24))}`;
}

export function verifyAccessToken(token: string | undefined): AuthTokenPayload | null {
  if (!token) return null;
  const [version, encodedPayload, signature] = token.split('.');
  if (version !== TOKEN_VERSION || !encodedPayload || !signature) return null;
  const expected = sign(encodedPayload);
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as Partial<AuthTokenPayload>;
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return {
      ...(typeof payload.contextUserId === 'string' ? { contextUserId: payload.contextUserId } : {}),
      exp: payload.exp,
      role: payload.role,
      ...(Array.isArray(payload.scopes) && payload.scopes.every(item => typeof item === 'string') ? { scopes: payload.scopes } : {}),
      sub: payload.sub,
      ...(typeof payload.tenantId === 'string' ? { tenantId: payload.tenantId } : {}),
      ...(typeof payload.tenantType === 'string' ? { tenantType: payload.tenantType } : {})
    };
  } catch {
    return null;
  }
}

export function readBearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', tokenSecret()).update(encodedPayload).digest('base64url');
}

function tokenSecret(): string {
  return resolveAuthTokenSecret();
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
