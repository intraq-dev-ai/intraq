import type { RouteLocationNormalized } from 'vue-router';

const availableAdminSections = new Set([
  'dashboard',
  'overview',
  'dashboards',
  'dashboard-categories',
  'data-sources',
  'view-data-sources',
  'data-dictionary',
  'custom-data-sources',
  'sql-query-editor',
  'smtp-configuration',
  'mcp-access'
]);

const ownerSections = new Set(['smtp-configuration', 'mcp-access']);

const adminRoles = new Set(['SINGLE_TENANT_OWNER', 'SINGLE_TENANT_ADMIN']);
const dataRoles = new Set([...adminRoles, 'SINGLE_TENANT_DEVELOPER']);

export function adminRouteGuard(to: RouteLocationNormalized): true | { path: string; query?: Record<string, string> } {
  const segments = routeSegments(to.params.section, to.path);
  const section = adminSectionKey(segments);
  if (!availableAdminSections.has(section)) {
    return { path: '/admin/dashboards', query: { unavailable: section } };
  }
  if (!canAccessAdminSection(segments)) {
    return { path: '/home', query: { adminDenied: section } };
  }
  return true;
}

export function canAccessAdminSection(
  segments: string[],
  role = readStoredRole()
): boolean {
  const section = adminSectionKey(segments);
  if (!availableAdminSections.has(section)) return false;
  return ownerSections.has(section) ? adminRoles.has(role) : dataRoles.has(role);
}

function routeSegments(value: unknown, path: string): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value) return [value];
  const segments = path.split('/').filter(Boolean);
  return segments[0] === 'admin' ? segments.slice(1) : segments;
}

function adminSectionKey(segments: string[]): string {
  return segments.at(-1) || segments[0] || 'dashboard';
}

function readStoredRole(): string {
  if (typeof window === 'undefined') return 'SINGLE_TENANT_OWNER';
  return window.localStorage.getItem('userRole') || window.localStorage.getItem('intraq-role') || 'SINGLE_TENANT_VIEWER';
}
