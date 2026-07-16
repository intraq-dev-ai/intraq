import { uuidv7 } from '@intraq/contracts';
import type { IntraQPrismaClient, Prisma } from '@intraq/db';
import {
  canWriteDashboardRecord,
  dashboardVisibilityWhere,
  isViewerRole,
  scopedDashboardWhere
} from './dashboard-access.js';
import type {
  Dashboard,
  DashboardAccessScope,
  DashboardDataCachePolicy,
  DashboardListOptions
} from './foundation-store.js';
import {
  dashboardInclude,
  jsonRecord,
  readDashboardSnapshot,
  toDashboard
} from './prisma-mappers.js';

export type DatabaseClient = IntraQPrismaClient | Prisma.TransactionClient;

export async function listDashboardsFromPrisma(
  client: IntraQPrismaClient,
  scope?: DashboardAccessScope,
  options: DashboardListOptions = {}
): Promise<Dashboard[]> {
  const visibilityWhere = await dashboardVisibilityWhere(client, scope);
  const records = await client.dashboard.findMany({
    ...(visibilityWhere ? { where: visibilityWhere } : {}),
    include: { ...dashboardInclude, publishedVersion: true },
    orderBy: { updatedAt: 'desc' },
    ...(options.limit ? { take: options.limit } : {})
  });
  const usePublishedSnapshots = Boolean(scope && isViewerRole(scope.role));
  return mapWithConcurrency(records, 8, async record => {
    if (usePublishedSnapshots && record.publishedVersion) {
      const snapshot = readDashboardSnapshot(record.publishedVersion.dashboardSnapshot);
      if (snapshot) return dashboardWithLiveSettings(snapshot, jsonRecord(record.settings));
    }
    return toDashboard(record);
  });
}

export async function getDashboardModeFromPrisma(
  client: IntraQPrismaClient,
  id: string,
  mode: string,
  scope?: DashboardAccessScope
): Promise<Dashboard | null> {
  if (mode === 'published') {
    if (!await canReadDashboard(client, id, scope)) return null;
    const dashboard = await client.dashboard.findUnique({
      where: { id },
      include: { ...dashboardInclude, publishedVersion: true }
    });
    if (!dashboard) return null;
    const snapshot = dashboard.publishedVersion ? readDashboardSnapshot(dashboard.publishedVersion.dashboardSnapshot) : null;
    if (!snapshot && dashboard.status !== 'published') return null;
    return snapshot ? dashboardWithLiveSettings(snapshot, jsonRecord(dashboard.settings)) : toDashboard(dashboard);
  }
  if (mode !== 'view' || !scope || !isViewerRole(scope.role)) return findDashboard(client, id, scope);
  if (!await canReadDashboard(client, id, scope)) return null;
  const dashboard = await client.dashboard.findUnique({
    where: { id },
    include: { publishedVersion: true }
  });
  const snapshot = dashboard?.publishedVersion ? readDashboardSnapshot(dashboard.publishedVersion.dashboardSnapshot) : null;
  return snapshot && dashboard
    ? dashboardWithLiveSettings(snapshot, jsonRecord(dashboard.settings))
    : findDashboard(client, id, scope);
}

export async function findDashboard(
  db: DatabaseClient,
  id: string,
  scope?: DashboardAccessScope
): Promise<Dashboard | null> {
  const visibilityWhere = await dashboardVisibilityWhere(db, scope);
  const record = await db.dashboard.findFirst({
    where: scopedDashboardWhere(id, visibilityWhere),
    include: { ...dashboardInclude, publishedVersion: true }
  });
  if (!record) return null;
  if (scope && isViewerRole(scope.role) && record.publishedVersion) {
    const snapshot = readDashboardSnapshot(record.publishedVersion.dashboardSnapshot);
    if (snapshot) return dashboardWithLiveSettings(snapshot, jsonRecord(record.settings));
  }
  return toDashboard(record);
}

export async function findDashboardOrThrow(
  db: DatabaseClient,
  id: string,
  scope?: DashboardAccessScope
): Promise<Dashboard> {
  const dashboard = await findDashboard(db, id, scope);
  if (!dashboard) throw new Error(`Dashboard ${id} was not found after persistence.`);
  return dashboard;
}

export async function canReadDashboard(
  client: IntraQPrismaClient,
  id: string,
  scope?: DashboardAccessScope
): Promise<boolean> {
  if (!scope) return Boolean(await client.dashboard.findUnique({ where: { id }, select: { id: true } }));
  const visibilityWhere = await dashboardVisibilityWhere(client, scope);
  return Boolean(await client.dashboard.findFirst({
    where: scopedDashboardWhere(id, visibilityWhere),
    select: { id: true }
  }));
}

export async function canWriteDashboardWithTx(
  tx: Prisma.TransactionClient,
  id: string,
  scope?: DashboardAccessScope
): Promise<boolean> {
  const record = await tx.dashboard.findUnique({
    where: { id },
    select: { isGlobal: true, isSample: true, tenantId: true }
  });
  return Boolean(record && canWriteDashboardRecord(scope, record));
}

export async function findCategoryId(tx: Prisma.TransactionClient, name: string): Promise<string | null> {
  return (await tx.dashboardCategory.findFirst({ where: { name }, select: { id: true } }))?.id ?? null;
}

export async function categoryNameById(tx: Prisma.TransactionClient, id: string): Promise<string> {
  return (await tx.dashboardCategory.findUnique({ where: { id }, select: { name: true } }))?.name ?? '';
}

export async function databaseDataSourceId(tx: Prisma.TransactionClient, id: string): Promise<string | null> {
  return (await tx.dataSource.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
}

export async function versionUserId(tx: Prisma.TransactionClient): Promise<string> {
  return (await versionUser(tx)).id;
}

export async function versionUser(tx: Prisma.TransactionClient): Promise<{ id: string; name: string }> {
  const existing = await tx.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  if (existing) return { id: existing.id, name: `${existing.firstName} ${existing.lastName}`.trim() || existing.email };
  const system = await tx.user.findUnique({ where: { email: 'system-dashboard@intraq.local' } });
  if (system) return { id: system.id, name: `${system.firstName} ${system.lastName}`.trim() || system.email };
  const created = await tx.user.create({
    data: {
      id: uuidv7(),
      firstName: 'System',
      lastName: 'Dashboard',
      email: 'system-dashboard@intraq.local',
      password: 'runtime-system-user',
      role: 'SINGLE_TENANT_OWNER',
      isActive: false,
      emailVerified: true
    }
  });
  return { id: created.id, name: `${created.firstName} ${created.lastName}` };
}

export function uniqueDashboardId(tx: Prisma.TransactionClient, requested?: string): Promise<string> {
  return uniqueId(requested, id => tx.dashboard.findUnique({ where: { id }, select: { id: true } }));
}

export function uniqueElementId(tx: Prisma.TransactionClient, requested?: string): Promise<string> {
  return uniqueId(requested, id => tx.dashboardElement.findUnique({ where: { id }, select: { id: true } }));
}

export function uniqueFilterId(tx: Prisma.TransactionClient, requested?: string): Promise<string> {
  return uniqueId(requested, id => tx.dashboardFilter.findUnique({ where: { id }, select: { id: true } }));
}

export function uniqueCategoryId(tx: Prisma.TransactionClient, requested?: string): Promise<string> {
  return uniqueId(requested, id => tx.dashboardCategory.findUnique({ where: { id }, select: { id: true } }));
}

export function mergeDashboardSettings(
  existingSettings: Record<string, unknown>,
  nextSettings: Record<string, unknown>
): Record<string, unknown> {
  return localDashboardSettings({
    ...existingSettings,
    ...nextSettings
  });
}

function localDashboardSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      ...recordSetting(settings, 'dashboard'),
      ...recordSetting(settings, 'menu'),
      ...recordSetting(settings, 'navigation'),
      ...stringSetting(settings, 'currencySymbol'),
      ...cachePolicySetting(settings.dataCachePolicy),
      ...booleanSetting(settings, 'closeDropdownOnSelect'),
      ...booleanSetting(settings, 'hideMultiSelectSummary'),
      ...booleanSetting(settings, 'isFavorite'),
      ...booleanSetting(settings, 'menuVisible')
    }).filter(([, value]) => value !== undefined && value !== null)
  );
}

function recordSetting(settings: Record<string, unknown>, key: string): Record<string, unknown> {
  return isPlainRecord(settings[key]) ? { [key]: settings[key] } : {};
}

function stringSetting(settings: Record<string, unknown>, key: string): Record<string, string> {
  return typeof settings[key] === 'string' ? { [key]: settings[key] } : {};
}

function booleanSetting(settings: Record<string, unknown>, key: string): Record<string, boolean> {
  return typeof settings[key] === 'boolean' ? { [key]: settings[key] } : {};
}

function cachePolicySetting(value: unknown): Record<string, string> {
  return value === 'live' || value === '15m' || value === '1h' || value === '1d'
    ? { dataCachePolicy: value }
    : {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dashboardWithLiveSettings(snapshot: Dashboard, settings: Record<string, unknown>): Dashboard {
  return {
    ...snapshot,
    settings: localDashboardSettings({
      ...(snapshot.settings ?? {}),
      ...(typeof settings.currencySymbol === 'string' ? { currencySymbol: settings.currencySymbol } : {}),
      ...(isDashboardDataCachePolicy(settings.dataCachePolicy) ? { dataCachePolicy: settings.dataCachePolicy } : {}),
      ...(typeof settings.isFavorite === 'boolean' ? { isFavorite: settings.isFavorite } : {})
    })
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  if (values.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, values.length));
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function uniqueId(requested: string | undefined, exists: (id: string) => Promise<{ id: string } | null>): Promise<string> {
  if (requested && !await exists(requested)) return requested;
  let id = uuidv7();
  while (await exists(id)) id = uuidv7();
  return id;
}

function isDashboardDataCachePolicy(value: unknown): value is DashboardDataCachePolicy {
  return value === 'live' || value === '15m' || value === '1h' || value === '1d';
}
