import type { IncomingMessage } from 'node:http';
import type { EmbedToken } from './embed-token-store.js';
import { readHeader } from './embed-common.js';

export function requireEmbedRequestOrigin(
  token: EmbedToken,
  req: IncomingMessage
): { ok: true } | { ok: false; statusCode: number; error: string } {
  const origin = readEmbedOrigin(req);
  if (!origin) {
    return token.requireParentOrigin === true
      ? { ok: false, statusCode: 403, error: 'Parent origin is required for this embed session' }
      : { ok: true };
  }
  return isDomainAllowed(token, origin)
    ? { ok: true }
    : { ok: false, statusCode: 403, error: 'Domain not allowed' };
}

export function isDomainAllowed(token: EmbedToken, domain: string | null): boolean {
  if (token.allowedDomains.length === 0) return true;
  if (!domain) return token.requireParentOrigin !== true;
  return token.allowedDomains.some(allowed => allowedOriginMatches(allowed, domain));
}

export function allowedOriginMatches(allowed: string, candidate: string): boolean {
  if (allowed === '*') return true;
  if (allowed.startsWith('*.')) {
    const candidateParts = parseOriginParts(candidate);
    if (!candidateParts) return false;
    const baseDomain = allowed.slice(2).toLowerCase();
    return candidateParts.hostname === baseDomain || candidateParts.hostname.endsWith(`.${baseDomain}`);
  }
  const candidateParts = parseOriginParts(candidate);
  const allowedParts = parseOriginParts(allowed);
  if (!candidateParts || !allowedParts) return normalizeHost(candidate) === normalizeHost(allowed);
  if (allowed.includes('://')) {
    return candidateParts.origin === allowedParts.origin;
  }
  if (allowedParts.hasExplicitPort) return candidateParts.hostname === allowedParts.hostname && candidateParts.port === allowedParts.port;
  return candidateParts.hostname === allowedParts.hostname;
}

export function cspFrameAncestorSources(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed === '*') return ['*'];
  if (trimmed.includes('://')) {
    try {
      return [new URL(trimmed).origin];
    } catch {
      return [];
    }
  }
  if (trimmed.startsWith('*.')) return [`https://${trimmed}`, `http://${trimmed}`];
  const host = normalizeHostWithPort(trimmed);
  return host ? [`https://${host}`, `http://${host}`] : [];
}

function readEmbedOrigin(req: IncomingMessage): string | null {
  return readHeader(req, 'x-embed-origin') ?? readHeader(req, 'origin') ?? readHeader(req, 'referer');
}

function parseOriginParts(value: string): { hasExplicitPort: boolean; hostname: string; origin: string; port: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const source = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(source);
    const hasExplicitPort = /:\d+(?:\/|$)/.test(trimmed);
    return {
      hasExplicitPort,
      hostname: parsed.hostname.toLowerCase(),
      origin: parsed.origin.toLowerCase(),
      port: parsed.port
    };
  } catch {
    return null;
  }
}

function normalizeHost(value: string): string {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  }
}

function normalizeHostWithPort(value: string): string | null {
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    return `${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch {
    const host = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    return host || null;
  }
}
