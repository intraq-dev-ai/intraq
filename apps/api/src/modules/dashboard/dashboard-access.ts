import type { IntraQPrismaClient, Prisma } from '@intraq/db';
import type { DashboardAccessScope } from './foundation-store.js';

type DatabaseClient = IntraQPrismaClient | Prisma.TransactionClient;

interface DashboardRecordIdentity {
  isGlobal: boolean;
  isSample: boolean;
  tenantId: string | null;
}

interface CategoryRecordIdentity {
  tenantId: string | null;
}

export function canCreateGlobalDashboard(scope?: DashboardAccessScope): boolean {
  if (!scope) return true;
  return isInstanceOwnerRole(scope.role);
}

export function canCreateSampleDashboard(scope?: DashboardAccessScope): boolean {
  return !scope || isInstanceOwnerRole(scope.role);
}

export function canWriteDashboardRecord(scope: DashboardAccessScope | undefined, record: DashboardRecordIdentity): boolean {
  if (!scope) return true;
  if (isInstanceOwnerRole(scope.role)) return true;
  if (isViewerRole(scope.role)) return false;
  if (record.isSample) return false;
  return Boolean(scope.tenantId && record.tenantId === scope.tenantId);
}

export function canWriteCategoryRecord(scope: DashboardAccessScope | undefined, record: CategoryRecordIdentity): boolean {
  if (!scope) return true;
  if (isInstanceOwnerRole(scope.role)) return true;
  if (isViewerRole(scope.role)) return false;
  return Boolean(scope.tenantId && record.tenantId === scope.tenantId);
}

export function isViewerRole(role: string): boolean {
  return normalizeRole(role).includes('VIEWER');
}

export async function dashboardVisibilityWhere(
  db: DatabaseClient,
  scope?: DashboardAccessScope
): Promise<Prisma.DashboardWhereInput | undefined> {
  if (!scope) return undefined;
  if (isInstanceOwnerRole(scope.role)) {
    return await shouldShowSampleReports(db, scope.tenantId) ? undefined : { isSample: false };
  }

  const conditions: Prisma.DashboardWhereInput[] = [];
  if (scope.tenantId) conditions.push({ tenantId: scope.tenantId });
  if (await shouldShowSampleReports(db, scope.tenantId)) conditions.push({ isSample: true });

  const visibilityWhere: Prisma.DashboardWhereInput = conditions.length > 0
    ? { OR: conditions }
    : { id: '__no_dashboard_access__' };
  return isViewerRole(scope.role)
    ? { AND: [visibilityWhere, { OR: [{ status: 'published' }, { publishedVersionId: { not: null } }] }] }
    : visibilityWhere;
}

export async function categoryVisibilityWhere(
  db: DatabaseClient,
  scope?: DashboardAccessScope
): Promise<Prisma.DashboardCategoryWhereInput | undefined> {
  if (!scope) return undefined;
  if (isInstanceOwnerRole(scope.role)) return undefined;

  const conditions: Prisma.DashboardCategoryWhereInput[] = [{ tenantId: null }];
  if (scope.tenantId) conditions.push({ tenantId: scope.tenantId });

  return { OR: conditions };
}

export function scopedDashboardWhere(
  id: string,
  visibilityWhere: Prisma.DashboardWhereInput | undefined
): Prisma.DashboardWhereInput {
  return visibilityWhere ? { AND: [{ id }, visibilityWhere] } : { id };
}

export function scopedCategoryWhere(
  id: string,
  visibilityWhere: Prisma.DashboardCategoryWhereInput | undefined
): Prisma.DashboardCategoryWhereInput {
  return visibilityWhere ? { AND: [{ id }, visibilityWhere] } : { id };
}

export function scopedCreateTenantData(
  input: Record<string, unknown>,
  scope?: DashboardAccessScope
): Pick<Prisma.DashboardUncheckedCreateInput, 'createdBy' | 'isGlobal' | 'isSample' | 'tenantId'> {
  const requestedGlobal = input.isGlobal === true;
  const requestedSample = input.isSample === true;
  const isSample = requestedSample && canCreateSampleDashboard(scope);
  const isGlobal = requestedGlobal && canCreateGlobalDashboard(scope);
  const tenantId = isSample
    ? null
    : scope?.tenantId ?? (typeof input.tenantId === 'string' ? input.tenantId : null);

  return {
    createdBy: scope?.userId ?? optionalString(input.createdBy) ?? null,
    isGlobal,
    isSample,
    tenantId
  };
}

export function scopedCreateCategoryData(
  input: Record<string, unknown>,
  scope?: DashboardAccessScope
): Pick<Prisma.DashboardCategoryUncheckedCreateInput, 'createdBy' | 'tenantId'> {
  return {
    createdBy: scope?.userId ?? optionalString(input.createdBy) ?? null,
    tenantId: scope?.tenantId ?? optionalString(input.tenantId) ?? null
  };
}

async function shouldShowSampleReports(db: DatabaseClient, tenantId?: string): Promise<boolean> {
  if (!tenantId) return true;
  try {
    const setting = await db.setting.findUnique({
      where: { key_tenantId: { key: 'showSampleReports', tenantId } },
      select: { value: true }
    });
    return setting ? readBooleanSetting(setting.value, true) : true;
  } catch {
    return true;
  }
}

function readBooleanSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function isInstanceOwnerRole(role: string): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'SINGLE_TENANT_OWNER' || normalized === 'SINGLE_TENANT_ADMIN';
}

function normalizeRole(role: string): string {
  return role.trim().toUpperCase();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
