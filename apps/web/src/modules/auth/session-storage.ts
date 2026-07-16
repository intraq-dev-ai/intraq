import type { AuthSession } from './types';

const authTokenKeys = ['auth_token', 'token', 'accessToken'] as const;

export function persistAuthSession(session: AuthSession, fallbackEmail?: string): void {
  if (typeof window === 'undefined') return;
  const token = session.token ?? session.accessToken ?? session.tokens?.accessToken ?? session.tokens?.token;
  const refreshToken = session.refreshToken ?? session.tokens?.refreshToken;
  const user = session.user;

  if (token) {
    window.localStorage.setItem('accessToken', token);
    window.localStorage.setItem('auth_token', token);
    window.localStorage.setItem('token', token);
  }
  if (refreshToken) {
    window.localStorage.setItem('refreshToken', refreshToken);
    window.localStorage.setItem('refresh_token', refreshToken);
  }
  if (user?.role) {
    window.localStorage.setItem('userRole', user.role);
    window.localStorage.setItem('intraq-role', user.role);
  }
  if (user?.id) window.localStorage.setItem('userId', user.id);
  const email = user?.email ?? fallbackEmail;
  if (email) window.localStorage.setItem('userEmail', email);
  const userName = user?.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  if (userName) window.localStorage.setItem('userName', userName);
  const tenantId = user?.tenantId ?? user?.tenant?.id;
  if (tenantId) window.localStorage.setItem('tenantId', tenantId);
  const tenantName = user?.tenant?.name ?? user?.tenant?.companyName;
  if (tenantName) window.localStorage.setItem('userTenant', tenantName);
  if (user) {
    window.localStorage.setItem('user', JSON.stringify({
      id: user.id,
      email: user.email ?? fallbackEmail,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId,
      tenant: user.tenant
    }));
  }
  window.dispatchEvent(new Event('intraq-session-updated'));
}

export function clearAuthSession(options: { preserveLoginRedirectUrl?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  void options;
  [
    'accessToken',
    'auth_token',
    'token',
    'refreshToken',
    'refresh_token',
    'userRole',
    'intraq-role',
    'role',
    'userId',
    'userName',
    'userEmail',
    'userTenant',
    'tenantId',
    'user'
  ].forEach(key => window.localStorage.removeItem(key));
  window.dispatchEvent(new Event('intraq-session-updated'));
}

export function expireAuthSession(options: { redirectToLogin?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  clearAuthSession();
  try {
    window.sessionStorage?.setItem('intraq-auth-expired', 'true');
  } catch {
    // Session storage can be unavailable in locked-down browser contexts.
  }
  window.dispatchEvent(new Event('intraq-session-expired'));
  if (options.redirectToLogin !== false) redirectToLogin();
}

export function isStoredAuthTokenExpired(now = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  const token = storedAuthToken();
  if (!token) return false;
  const expiryMs = authTokenExpiryMs(token);
  return expiryMs !== null && expiryMs <= now;
}

function storedAuthToken(): string {
  for (const key of authTokenKeys) {
    const token = window.localStorage.getItem(key);
    if (token) return token;
  }
  return '';
}

function authTokenExpiryMs(token: string): number | null {
  const [version, encodedPayload] = token.split('.');
  if (version !== 'v2' || !encodedPayload) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return globalThis.atob(padded);
}

function redirectToLogin(): void {
  if (isPublicAuthSurface(window.location.pathname)) return;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const target = currentPath && currentPath !== '/'
    ? `/login?redirect=${encodeURIComponent(currentPath)}`
    : '/login';
  window.location.assign(target);
}

function isPublicAuthSurface(pathname: string): boolean {
  return [
    '/login',
    '/forgot-password',
    '/reset-password',
    '/setup',
    '/backend-error',
    '/embed/',
    '/chatbot-preview/'
  ].some(path => pathname === path || pathname.startsWith(path));
}
