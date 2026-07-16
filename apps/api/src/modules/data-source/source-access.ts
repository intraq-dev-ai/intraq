import type { IntraQPrismaClient } from '@intraq/db';
import type { RequestSecurityContext } from '../../security/request-context.js';
import type { DataSourceRecord, TableDefinition } from './foundation-store.js';

export interface DataSourceAccessPolicy {
  readonly allowUnscopedAccess: boolean;
  readonly allowedDataSourceIds?: ReadonlySet<string>;
  readonly allowedTableIds?: ReadonlySet<string>;
  readonly scope?: RequestSecurityContext;
  readonly showSampleDataSources: boolean;
}

const policyCache = new Map<string, { policy: DataSourceAccessPolicy; expiresAt: number }>();
const POLICY_CACHE_TTL_MS = 30_000;

export function clearDataSourceAccessPolicyCache(): void {
  policyCache.clear();
}

export function clearDataSourceAccessPolicyCacheForTenant(tenantId: string): void {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) return;
  for (const key of policyCache.keys()) {
    if (key.split(':', 1)[0] === normalizedTenantId) policyCache.delete(key);
  }
}

export async function dataSourceAccessPolicy(
  scope: RequestSecurityContext | undefined,
  client: IntraQPrismaClient | null
): Promise<DataSourceAccessPolicy> {
  const cacheKey = scope
    ? [
      scope.tenantId ?? '',
      scope.userId ?? '',
      scope.role ?? '',
      scope.authSubjectType ?? '',
      ...(scope.tokenScopes ?? [])
    ].join(':')
    : '';
  if (cacheKey) {
    const cached = policyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.policy;
  }
  const policy: DataSourceAccessPolicy = {
    allowUnscopedAccess: client === null,
    ...(scope ? { scope } : {}),
    showSampleDataSources: await shouldShowSampleDataSources(scope, client)
  };
  if (cacheKey) {
    if (policyCache.size > 500) policyCache.clear();
    policyCache.set(cacheKey, { policy, expiresAt: Date.now() + POLICY_CACHE_TTL_MS });
  }
  return policy;
}

export function canReadDataSource(source: DataSourceRecord, policy: DataSourceAccessPolicy): boolean {
  if (policy.allowedDataSourceIds && !policy.allowedDataSourceIds.has(source.id)) return false;
  const scope = policy.scope;
  if (!scope) return policy.allowUnscopedAccess;
  if (isInstanceOwnerRole(scope.role)) return canInstanceOwnerReadDataSource(source, scope, policy);
  if (source.isSample) return canReadSampleDataSource(source, policy);
  if (source.tenantId && source.tenantId === scope.tenantId) return true;
  return false;
}

export function canReadDataSourceTable(
  source: DataSourceRecord,
  table: TableDefinition | undefined,
  policy: DataSourceAccessPolicy
): boolean {
  if (!table || !canReadDataSource(source, policy)) return false;
  if (policy.allowedTableIds && !policy.allowedTableIds.has(table.id) && !policy.allowedTableIds.has(table.name) && !policy.allowedTableIds.has(`${source.id}:${table.id}`) && !policy.allowedTableIds.has(`${source.id}:${table.name}`)) {
    return false;
  }
  return true;
}

export function canWriteDataSource(source: DataSourceRecord, policy: DataSourceAccessPolicy): boolean {
  const scope = policy.scope;
  if (!scope) return policy.allowUnscopedAccess;
  if (isInstanceOwnerRole(scope.role)) return true;
  return Boolean(scope.tenantId && source.tenantId === scope.tenantId && !source.isSample);
}

export function canCreateDataSource(policy: DataSourceAccessPolicy): boolean {
  if (!policy.scope) return policy.allowUnscopedAccess;
  return Boolean(policy.scope.tenantId || isInstanceOwnerRole(policy.scope.role));
}

export function requiresAuthenticatedDataSourceAccess(policy: DataSourceAccessPolicy): boolean {
  return !policy.allowUnscopedAccess && !policy.scope;
}

export function scopedDataSourceForRead(
  source: DataSourceRecord,
  policy: DataSourceAccessPolicy
): DataSourceRecord | null {
  if (!canReadDataSource(source, policy)) return null;
  return source;
}

export function scopedDataSourcesForRead(
  sources: readonly DataSourceRecord[],
  policy: DataSourceAccessPolicy
): DataSourceRecord[] {
  return sources.flatMap(source => scopedDataSourceForRead(source, policy) ?? []);
}

export function applyCreateScope(source: DataSourceRecord, policy: DataSourceAccessPolicy): DataSourceRecord {
  const scope = policy.scope;
  if (!scope) return source;
  return {
    ...source,
    createdBy: scope.userId,
    isGlobal: false,
    isSample: false,
    tenantId: scope.tenantId ?? null
  };
}

export function isInstanceOwnerRole(role: string): boolean {
  return ['SINGLE_TENANT_OWNER', 'SINGLE_TENANT_ADMIN'].includes(role);
}

function canInstanceOwnerReadDataSource(
  source: DataSourceRecord,
  scope: RequestSecurityContext,
  policy: DataSourceAccessPolicy
): boolean {
  if (source.isSample) return canReadSampleDataSource(source, policy);
  if (source.createdBy && source.createdBy === scope.userId) return true;
  if (source.tenantId && source.tenantId === scope.tenantId) return true;
  return false;
}

function canReadSampleDataSource(source: DataSourceRecord, policy: DataSourceAccessPolicy): boolean {
  if (!policy.showSampleDataSources) return false;
  const scope = policy.scope;
  if (!scope) return policy.allowUnscopedAccess;
  if (source.tenantId && source.tenantId === scope.tenantId) return true;
  return source.isGloballyVisible === true;
}

async function shouldShowSampleDataSources(
  scope: RequestSecurityContext | undefined,
  client: IntraQPrismaClient | null
): Promise<boolean> {
  if (!scope?.tenantId || !client) return true;
  const reportVisibility = await readTenantSetting(client, scope.tenantId, 'showSampleReports');
  if (reportVisibility !== undefined && !readBoolean(reportVisibility, true)) return false;
  const dataSourceVisibility = await readTenantSetting(client, scope.tenantId, 'showSampleDataSources');
  return dataSourceVisibility === undefined ? true : readBoolean(dataSourceVisibility, true);
}

async function readTenantSetting(
  client: IntraQPrismaClient,
  tenantId: string,
  key: string
): Promise<unknown> {
  try {
    const setting = await client.setting.findUnique({
      where: { key_tenantId: { key, tenantId } },
      select: { value: true }
    });
    return setting?.value;
  } catch {
    return undefined;
  }
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  if (isRecord(value) && 'value' in value) return readBoolean(value.value, fallback);
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
