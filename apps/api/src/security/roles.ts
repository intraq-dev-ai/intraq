export function isManagementRole(role: string): boolean {
  const normalizedRole = role.trim().toUpperCase();
  return normalizedRole === 'SINGLE_TENANT_OWNER' || normalizedRole === 'SINGLE_TENANT_ADMIN';
}
