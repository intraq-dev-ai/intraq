import type { DataSourceAccessPolicy } from '../data-source/source-access.js';

export function analyzerAccessPolicyCacheKey(policy: DataSourceAccessPolicy | undefined): Record<string, unknown> | null {
  if (!policy) return null;
  const scope = policy.scope;
  return {
    allowUnscopedAccess: policy.allowUnscopedAccess,
    allowedDataSourceIds: sortedSetValues(policy.allowedDataSourceIds),
    allowedTableIds: sortedSetValues(policy.allowedTableIds),
    scope: scope
      ? {
          authSubjectType: scope.authSubjectType ?? null,
          role: scope.role,
          tenantId: scope.tenantId ?? null,
          tenantType: scope.tenantType ?? null,
          tokenScopes: [...(scope.tokenScopes ?? [])].sort((left, right) => left.localeCompare(right)),
          userId: scope.userId
        }
      : null,
    showSampleDataSources: policy.showSampleDataSources
  };
}

function sortedSetValues(values: ReadonlySet<string> | undefined): string[] {
  return values ? [...values].sort((left, right) => left.localeCompare(right)) : [];
}
