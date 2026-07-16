import { expireAuthSession, isStoredAuthTokenExpired } from './session-storage';

const tokenStorageKeys = ['auth_token', 'token', 'accessToken'] as const;
let installedWindow: Window | null = null;

export function installAuthenticatedFetch(): void {
  if (typeof window === 'undefined' || installedWindow === window) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const isApiRequest = isSameOriginApiRequest(input);
    const isPublicApi = isApiRequest && isPublicApiRoute(input, init);
    const token = storedAuthToken();
    const explicitAuthorization = authorizationHeader(input, init);
    if (token && isApiRequest && !isPublicApi && isStoredAuthTokenExpired()) {
      expireAuthSession();
      return expiredSessionResponse();
    }
    if (isPublicApi || !token || !isApiRequest || explicitAuthorization) {
      const response = await originalFetch(input, init);
      if (await shouldExpireSessionAfterUnauthorized(input, init, response, token, explicitAuthorization)) {
        expireAuthSession();
      }
      return response;
    }

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('authorization', `Bearer ${token}`);
    const response = await originalFetch(input, { ...init, headers });
    if (await shouldExpireSessionAfterUnauthorized(input, { ...init, headers }, response, token, `Bearer ${token}`)) {
      expireAuthSession();
    }
    return response;
  };
  installedWindow = window;
}

async function shouldExpireSessionAfterUnauthorized(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  response: Response,
  token: string,
  authorization: string
): Promise<boolean> {
  if (response.status !== 401 || !isSameOriginApiRequest(input)) return false;
  if (isPublicApiRoute(input, init)) return false;
  if (authorization && token && !authorizationMatchesSessionToken(authorization, token)) return false;
  return !(await isBusinessUnauthorizedFailure(response));
}

function authorizationMatchesSessionToken(authorization: string, token: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1] === token;
}

async function isBusinessUnauthorizedFailure(response: Response): Promise<boolean> {
  const payload = await response.clone().json().catch(() => null) as {
    details?: { code?: unknown };
    error?: unknown;
    message?: unknown;
  } | null;
  if (!payload) return false;
  const message = normalizedText(payload.error ?? payload.message);
  return [
    'current password is incorrect'
  ].includes(message);
}

function isPublicApiRoute(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = apiUrl(input);
  const method = requestMethod(input, init);
  if (method === 'GET' && url.pathname === '/api/health') return true;
  if (method === 'GET' && url.pathname === '/api/branding/config') return true;
  if (url.pathname.startsWith('/api/setup/')) return true;
  if (url.pathname.startsWith('/api/widget/')) return true;
  if (isPublicEmbedRoute(method, url.pathname)) return true;
  if (method === 'GET' && url.pathname === '/api/oauth/codex/callback') return true;
  if (method === 'POST' && [
    '/api/auth/login',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/refresh-token',
    '/api/auth/verify-email',
    '/api/auth/resend-verification'
  ].includes(url.pathname)) {
    return true;
  }
  return false;
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

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function expiredSessionResponse(): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'Authentication expired'
  }), {
    headers: { 'content-type': 'application/json' },
    status: 401
  });
}

function apiUrl(input: RequestInfo | URL): URL {
  const rawUrl = input instanceof Request ? input.url : input.toString();
  return new URL(rawUrl, window.location.origin);
}

function storedAuthToken(): string {
  for (const key of tokenStorageKeys) {
    const token = window.localStorage.getItem(key);
    if (token) return token;
  }
  return '';
}

function authorizationHeader(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.headers) {
    const value = new Headers(init.headers).get('authorization');
    if (value) return value;
  }
  if (input instanceof Request) return input.headers.get('authorization') ?? '';
  return '';
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  const url = apiUrl(input);
  return url.origin === window.location.origin && url.pathname.startsWith('/api/');
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/[.!]+$/, '').toLowerCase() : '';
}
