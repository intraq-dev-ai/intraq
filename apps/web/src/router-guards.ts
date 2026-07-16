import type { Router, RouteLocationNormalized } from 'vue-router';
import { clearAuthSession, isStoredAuthTokenExpired } from './modules/auth/session-storage';

export const FEATURES = {
  DATA_SOURCES: 'dataSources',
  DASHBOARD_VIEW: 'dashboard_view',
  DASHBOARD_BUILDER: 'dashboard_builder',
  DATA_ENGINEERING: 'dataEngineering',
  ADMIN_PANEL: 'adminPanel',
  ADMIN_DATA_SOURCES: 'admin_data_sources',
  ADMIN_SYSTEM_SETTINGS: 'admin_system_settings',
  ADMIN_TENANT_MANAGEMENT: 'admin_tenant_management',
  ADMIN_USER_MANAGEMENT: 'admin_user_management'
} as const;

type FeatureName = typeof FEATURES[keyof typeof FEATURES];

declare module 'vue-router' {
  interface RouteMeta {
    embedded?: boolean;
    requiresAdmin?: boolean;
    requiresAuth?: boolean;
    requiresFeature?: FeatureName;
    requiresOwnerOrAdmin?: boolean;
    requiresSuperAdmin?: boolean;
    skipAuth?: boolean;
  }
}

const ADMIN_ROLES = new Set([
  'SINGLE_TENANT_OWNER',
  'SINGLE_TENANT_ADMIN'
]);

export function installBaseProductRouteGuards(router: Router): void {
  router.beforeEach(async to => {
    if (shouldBlockAuthenticatedAppRouteInEmbed(to)) {
      return { path: '/embed/error', query: { reason: 'authenticated-route', attempted: to.fullPath } };
    }
    if (to.meta.skipAuth || to.meta.embedded || to.query.pdf === 'true') return true;
    if (to.path.startsWith('/setup') || to.path.startsWith('/backend-error')) return true;

    if (!shouldBypassLocalAuth() && isStoredAuthTokenExpired()) clearAuth();
    if (to.path === '/login' && hasAuthToken()) return { path: roleRedirectPath() };
    if (to.meta.requiresAuth && !isAuthenticated()) {
      clearAuth();
      return { path: '/login', query: { redirect: to.fullPath } };
    }
    if (to.meta.requiresAdmin && !ADMIN_ROLES.has(currentRole())) return { path: '/dashboard' };
    return true;
  });
}

export function adminDefaultPath(_role = currentRole()): string {
  return '/admin/dashboard';
}

export function roleRedirectPath(): string {
  return storedRole() ? '/home' : '/login';
}

export function clearStoredSetupRequiredFlag(): void {
  localStorage.removeItem('intraq-setup-required');
  localStorage.removeItem('setupRequired');
}

function shouldBlockAuthenticatedAppRouteInEmbed(to: RouteLocationNormalized): boolean {
  if (to.path.startsWith('/embed/')) return false;
  if (!isEmbeddedWindow()) return false;
  return to.path === '/login' || to.meta.requiresAuth === true;
}

function isEmbeddedWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isAuthenticated(): boolean {
  if (shouldBypassLocalAuth()) return true;
  return hasAuthToken();
}

function hasAuthToken(): boolean {
  return Boolean(localStorage.getItem('auth_token') || localStorage.getItem('token')) && !isStoredAuthTokenExpired();
}

function shouldBypassLocalAuth(): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && localStorage.getItem('intraq-local-auth-bypass') === 'true'
    && localStorage.getItem('intraq-enforce-auth') !== 'true';
}

function currentRole(): string {
  return storedRole() || 'SINGLE_TENANT_VIEWER';
}

function storedRole(): string {
  return localStorage.getItem('userRole') || localStorage.getItem('intraq-role') || '';
}

function clearAuth(): void {
  clearAuthSession();
}
