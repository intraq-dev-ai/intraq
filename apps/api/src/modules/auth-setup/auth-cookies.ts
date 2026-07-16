import type { IncomingMessage, ServerResponse } from 'node:http';

export const AUTH_ACCESS_COOKIE_NAME = 'intraq_auth_token';

const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 8;

export function setAuthCookie(res: ServerResponse, token: string): void {
  appendSetCookieHeader(res, serializeAuthCookie(token, ACCESS_TOKEN_MAX_AGE_SECONDS));
}

export function clearAuthCookie(res: ServerResponse): void {
  appendSetCookieHeader(res, serializeAuthCookie('', 0));
}

export function readAuthCookie(req: IncomingMessage): string | undefined {
  return readCookie(req.headers.cookie, AUTH_ACCESS_COOKIE_NAME);
}

function appendSetCookieHeader(res: ServerResponse, cookie: string): void {
  const existing = res.getHeader('set-cookie');
  if (Array.isArray(existing)) {
    res.setHeader('set-cookie', [...existing.map(String), cookie]);
    return;
  }
  if (existing !== undefined) {
    res.setHeader('set-cookie', [String(existing), cookie]);
    return;
  }
  res.setHeader('set-cookie', cookie);
}

function serializeAuthCookie(value: string, maxAgeSeconds: number): string {
  const attributes = [
    `${AUTH_ACCESS_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
}

function readCookie(header: string | string[] | undefined, name: string): string | undefined {
  const value = Array.isArray(header) ? header.join(';') : header;
  if (!value) return undefined;
  for (const pair of value.split(';')) {
    const [rawKey, ...rawValue] = pair.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('='));
  }
  return undefined;
}
