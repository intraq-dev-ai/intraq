export const LOCAL_DEMO_ADMIN_ROLE = 'SINGLE_TENANT_OWNER';

const BASE_AUTH_SESSION_KEYS = [
  'accessToken',
  'access_token',
  'authToken',
  'auth_token',
  'token',
  'refreshToken',
  'refresh_token',
  'userRole',
  'intraq-role',
  'role',
  'userRoleDisplay',
  'roleDisplayName',
  'roleLabel',
  'userType',
  'user_type',
  'userName',
  'name',
  'displayName',
  'userEmail',
  'email',
  'username',
  'user',
  'userData',
  'currentUser',
  'intraq-user',
  'tenantId',
  'tenant_id',
  'intraq-tenant-id',
  'currentTenantId',
  'tenantName',
  'companyName'
];

const adminRoles = new Set([
  'SINGLE_TENANT_OWNER',
  'SINGLE_TENANT_ADMIN'
]);

const roleDisplayNames: Record<string, string> = {
  SINGLE_TENANT_OWNER: 'Owner',
  SINGLE_TENANT_ADMIN: 'Admin',
  SINGLE_TENANT_DEVELOPER: 'Developer',
  SINGLE_TENANT_VIEWER: 'Viewer'
};

export function adminPanelRouteForRole(_role: string): string {
  return '/admin/dashboard';
}

export function isAdminRole(role: string): boolean {
  return adminRoles.has(role);
}

export function readEffectiveRole(defaultRole = 'SINGLE_TENANT_VIEWER'): string {
  const storedRole = storedValue(['userRole', 'intraq-role', 'role']) ?? storedSessionValue(['role', 'userRole']);
  if (storedRole) return storedRole;
  return isLocalAuthBypass() ? LOCAL_DEMO_ADMIN_ROLE : defaultRole;
}

export function roleLabel(role: string): string {
  const storedDisplayName = storedValue(['userType', 'user_type', 'userRoleDisplay', 'roleDisplayName', 'roleLabel'])
    ?? storedSessionValue(['userType', 'user_type', 'roleDisplayName', 'roleLabel', 'role', 'userRole']);
  return displayRole(storedDisplayName ?? role);
}

export function clearBaseAuthSessionCaches(): void {
  if (typeof window === 'undefined') return;
  clearStorage(window.localStorage);
  clearStorage(window.sessionStorage);
  window.dispatchEvent(new Event('intraq-session-updated'));
}

export function isLocalAuthBypass(): boolean {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.localStorage.getItem('intraq-local-auth-bypass') === 'true'
    && window.localStorage.getItem('intraq-enforce-auth') !== 'true';
}

function storedValue(keys: string[]): string | undefined {
  if (typeof window === 'undefined') return undefined;
  for (const key of keys) {
    const value = window.localStorage.getItem(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

function storedSessionValue(keys: string[]): string | undefined {
  if (typeof window === 'undefined') return undefined;
  for (const storageKey of ['userData', 'user', 'currentUser', 'intraq-user']) {
    const parsed = parseStoredRecord(window.localStorage.getItem(storageKey))
      ?? parseStoredRecord(window.sessionStorage.getItem(storageKey));
    const value = nestedValue(parsed, keys);
    if (value) return value;
  }
  return undefined;
}

function parseStoredRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function nestedValue(record: Record<string, unknown> | null, keys: string[]): string | undefined {
  let current: unknown = record;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim() ? current.trim() : undefined;
}

function displayRole(role: string): string {
  return roleDisplayNames[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function clearStorage(storage: Storage): void {
  for (const key of BASE_AUTH_SESSION_KEYS) storage.removeItem(key);
}
