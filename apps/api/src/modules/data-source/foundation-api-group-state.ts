import type { Prisma } from '@intraq/db';
import type { ApiGroupRecord, ApiGroupSnapshotRecord } from './api-group-types.js';
import {
  isInstanceOwnerRole,
  type DataSourceAccessPolicy
} from './source-access.js';

export const apiGroups: ApiGroupRecord[] = [];
export const apiGroupSnapshots: ApiGroupSnapshotRecord[] = [];

export function apiGroupScopeWhere(access?: DataSourceAccessPolicy): Prisma.ApiGroupWhereInput {
  if (!access) return {};
  const scope = access.scope;
  if (!scope) return access.allowUnscopedAccess ? {} : { id: '__unauthorized__' };
  if (isInstanceOwnerRole(scope.role)) return {};
  if (!scope.tenantId) return { id: '__missing_tenant__' };
  return {
    OR: [
      { tenantId: scope.tenantId },
      { tenantId: null }
    ]
  };
}

export function canWriteApiGroup(group: ApiGroupRecord, access: DataSourceAccessPolicy): boolean {
  const scope = access.scope;
  if (!scope) return access.allowUnscopedAccess;
  if (isInstanceOwnerRole(scope.role)) return true;
  return Boolean(scope.tenantId && group.tenantId === scope.tenantId);
}

export function scopedApiGroups(groups: ApiGroupRecord[], access?: DataSourceAccessPolicy): ApiGroupRecord[] {
  if (!access) return groups;
  const scope = access.scope;
  if (!scope) return access.allowUnscopedAccess ? groups : [];
  if (isInstanceOwnerRole(scope.role)) return groups;
  return groups.filter(group => !group.tenantId || group.tenantId === scope.tenantId);
}
