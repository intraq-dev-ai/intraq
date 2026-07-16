import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { sendForbidden, sendJson, sendUnauthorized } from '../http.js';
import { readAuthCookie } from '../modules/auth-setup/auth-cookies.js';
import { readBearerToken, verifyAccessToken, type AuthTokenPayload } from '../modules/auth-setup/auth-tokens.js';
import type { AuthStore } from '../modules/auth-setup/auth-store.js';
import { setRequestSecurityContext } from './request-context.js';

const PUBLIC_API_CLIENT_ROLE = 'PUBLIC_API_CLIENT';
const PUBLIC_API_ANALYZER_SCOPE = 'ai-data-analyzer';

export async function authorizeApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  authStore: AuthStore | null,
  options: { acceptAuthCookie?: boolean } = {}
): Promise<boolean> {
  if (!requiresAuthenticatedApiRequest(req.method ?? '', url.pathname)) return true;

  const payload = verifyAccessToken(readRequestAccessToken(req, options));
  if (!payload) {
    sendUnauthorized(res);
    return false;
  }
  if (attachPublicApiAnalyzerContext(req, url, payload)) return true;

  if (!authStore) {
    sendJson(res, 503, fail('Authentication database is unavailable'));
    return false;
  }

  const user = await authStore.findUserById(payload.sub);
  if (!user || !user.isActive) {
    sendUnauthorized(res);
    return false;
  }
  if (user.tenant?.status && user.tenant.status !== 'active') {
    sendForbidden(res, 'Tenant is inactive.');
    return false;
  }

  setSecurityContextFromUser(req, user);
  return true;
}

export async function attachOptionalApiRequestContext(
  req: IncomingMessage,
  authStore: AuthStore | null,
  options: { acceptAuthCookie?: boolean } = {}
): Promise<void> {
  const payload = verifyAccessToken(readRequestAccessToken(req, options));
  const url = requestUrl(req);
  if (payload && url && attachPublicApiAnalyzerContext(req, url, payload)) return;
  if (!payload || !authStore) return;
  const user = await authStore.findUserById(payload.sub);
  if (!user || !user.isActive) return;
  if (user.tenant?.status && user.tenant.status !== 'active') return;
  setSecurityContextFromUser(req, user);
}

function attachPublicApiAnalyzerContext(req: IncomingMessage, url: URL, payload: AuthTokenPayload): boolean {
  if (payload.role !== PUBLIC_API_CLIENT_ROLE) return false;
  if (!payload.scopes?.includes(PUBLIC_API_ANALYZER_SCOPE)) return false;
  if (!payload.tenantId || !isPublicApiAnalyzerRoute(req.method ?? '', url.pathname)) return false;
  setRequestSecurityContext(req, {
    authSubjectType: 'public-api-client',
    role: PUBLIC_API_CLIENT_ROLE,
    tenantId: payload.tenantId,
    tokenScopes: payload.scopes,
    userId: payload.contextUserId ?? payload.sub
  });
  return true;
}

function requestUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '/', 'http://localhost');
  } catch {
    return null;
  }
}

function isPublicApiAnalyzerRoute(method: string, pathname: string): boolean {
  const verb = method.toUpperCase();
  if (verb === 'GET' && pathname === '/api/data-sources/analyzer-catalog') return true;
  if (verb === 'POST' && /^\/api\/ai-data-analyzer\/(?:orchestrate|followup-resolve|plan|analyze\/stream)$/.test(pathname)) return true;
  if (verb === 'GET' && (
    pathname === '/api/ai-data-analyzer/conversations' ||
    /^\/api\/ai-data-analyzer\/conversations\/[^/]+\/messages$/.test(pathname)
  )) return true;
  if (verb === 'POST' && (
    pathname === '/api/ai-data-analyzer/conversations' ||
    /^\/api\/ai-data-analyzer\/conversations\/[^/]+\/(?:messages|session\/clear)$/.test(pathname)
  )) return true;
  if ((verb === 'PATCH' || verb === 'DELETE') && /^\/api\/ai-data-analyzer\/conversations\/[^/]+$/.test(pathname)) return true;
  if (verb === 'POST' && (pathname === '/api/analyzer/ask' || pathname === '/api/analyzer/ask/stream')) return true;
  if (verb === 'POST' && pathname === '/api/chart-data') return true;
  return false;
}

function setSecurityContextFromUser(req: IncomingMessage, user: NonNullable<Awaited<ReturnType<AuthStore['findUserById']>>>): void {
  setRequestSecurityContext(req, {
    role: user.role,
    userId: user.id,
    ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    ...(user.tenant?.tenantType ? { tenantType: user.tenant.tenantType } : {})
  });
}

function readRequestAccessToken(req: IncomingMessage, options: { acceptAuthCookie?: boolean }): string | undefined {
  return readBearerToken(req.headers.authorization)
    ?? (options.acceptAuthCookie === true ? readAuthCookie(req) : undefined);
}

export function requiresAuthenticatedApiRequest(method: string, pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  return !isPublicApiRoute(method.toUpperCase(), pathname);
}

function isPublicApiRoute(method: string, pathname: string): boolean {
  if (method === 'GET' && pathname === '/api/health') return true;
  if (method === 'GET' && pathname === '/api/branding/config') return true;
  if ((method === 'OPTIONS' || method === 'POST') && pathname === '/api/contact/contact-sales') return true;
  if (pathname.startsWith('/api/setup/')) return true;

  if (isPublicAuthEntryRoute(method, pathname)) return true;
  if (method === 'GET' && pathname === '/api/oauth/codex/callback') return true;
  if (isPublicWidgetRoute(pathname)) return true;
  if (isPublicEmbedRoute(method, pathname)) return true;
  if (isPublicApiWorkflowRoute(method, pathname)) return true;

  return false;
}

function isPublicAuthEntryRoute(method: string, pathname: string): boolean {
  if (method === 'POST' && [
    '/api/auth/login',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/refresh-token',
    '/api/auth/verify-email',
    '/api/auth/resend-verification'
  ].includes(pathname)) {
    return true;
  }
  return false;
}

function isPublicWidgetRoute(pathname: string): boolean {
  return pathname.startsWith('/api/widget/');
}

function isPublicEmbedRoute(method: string, pathname: string): boolean {
  if (method === 'POST' && pathname === '/api/embed/chart-data') return true;
  if (method === 'POST' && pathname === '/api/embed/filter-options') return true;
  if (method === 'POST' && pathname === '/api/embed/chart-data/export') return true;
  if (method === 'POST' && pathname === '/api/embed/render-events') return true;
  if (method === 'POST' && pathname === '/api/embed/data-sources/download') return true;
  if (method === 'GET' && pathname === '/api/embed/validate-token') return true;
  if (method === 'GET' && /^\/api\/embed\/dashboard\/[^/]+$/.test(pathname)) return true;
  if (method === 'GET' && pathname === '/api/embed/data-sources') return true;
  return method === 'GET' && /^\/api\/embed\/data-sources\/[^/]+\/(fields|data|fields-and-data)$/.test(pathname);
}

function isPublicApiWorkflowRoute(method: string, pathname: string): boolean {
  if (method === 'POST' && pathname === '/api/public/api-workflows/token') return true;
  if (method === 'GET' && /^\/api\/public\/api-groups\/[^/]+\/openapi\.json$/.test(pathname)) return true;
  if ((method === 'GET' || method === 'POST') && /^\/api\/v1\/[^/]+\/[^/]+$/.test(pathname)) return true;
  if (method === 'GET' && /^\/api\/public\/data-sources\/[^/]+\/openapi\.json$/.test(pathname)) return true;
  return (method === 'GET' || method === 'POST')
    && /^\/api\/public\/data-sources\/[^/]+\/tables\/[^/]+\/data$/.test(pathname);
}
