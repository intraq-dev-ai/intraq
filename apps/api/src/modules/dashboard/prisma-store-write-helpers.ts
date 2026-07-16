import { uuidv7 } from '@intraq/contracts';
import type { Prisma } from '@intraq/db';
import { canWriteDashboardRecord, scopedCreateTenantData } from './dashboard-access.js';
import { normalizeDashboardElementShape } from './dashboard-element-shape.js';
import type {
  Dashboard,
  DashboardAccessScope,
  DashboardCreateInput,
  DashboardElement,
  DashboardFilter,
  DashboardUpdateInput,
  DashboardVersion
} from './foundation-store.js';
import { isRecord, optionalString, readArray, readNumber, readRecord } from './foundation-store-utils.js';
import {
  jsonRecord,
  toElement,
  toFilter,
  toInputJson,
  toNullableInputJson,
  toVersion
} from './prisma-mappers.js';
import {
  canWriteDashboardWithTx,
  categoryNameById,
  databaseDataSourceId,
  findCategoryId,
  findDashboard,
  findDashboardOrThrow,
  mergeDashboardSettings,
  uniqueDashboardId,
  uniqueElementId,
  uniqueFilterId,
  versionUser
} from './prisma-store-query-helpers.js';

export async function createDashboardWithTx(
  tx: Prisma.TransactionClient,
  input: DashboardCreateInput,
  scope?: DashboardAccessScope
): Promise<Dashboard> {
  const id = await uniqueDashboardId(tx, optionalString(input.id));
  const category = optionalString(input.category) ?? optionalString(input.section) ?? 'Operations';
  const categoryId = await findCategoryId(tx, category);
  const scopedTenantData = scopedCreateTenantData(input, scope);
  const data: Prisma.DashboardUncheckedCreateInput = {
    id,
    name: input.name.trim(),
    description: optionalString(input.description) ?? null,
    section: category,
    status: input.status === 'published' ? 'published' : 'draft',
    draftLayout: toNullableInputJson(Array.isArray(input.layout) ? input.layout : []),
    draftFilters: toNullableInputJson(readArray(input.filters)),
    config: toNullableInputJson(isRecord(input.config) ? input.config : {}),
    settings: toInputJson(mergeDashboardSettings({}, isRecord(input.settings) ? input.settings : {})),
    isPublic: input.isPublic === true,
    ...scopedTenantData,
    categoryId
  };
  await tx.dashboard.create({ data });
  for (const element of readArray(input.elements)) await createElementWithTx(tx, id, element);
  for (const filter of readArray(input.filters)) await createFilterWithTx(tx, id, filter);
  return findDashboardOrThrow(tx, id);
}

export async function updateDashboardWithTx(
  tx: Prisma.TransactionClient,
  id: string,
  input: DashboardUpdateInput,
  scope?: DashboardAccessScope
): Promise<Dashboard | null> {
  const existingDashboard = await tx.dashboard.findUnique({
    where: { id },
    select: { id: true, isGlobal: true, isSample: true, settings: true, tenantId: true }
  });
  if (!existingDashboard || !canWriteDashboardRecord(scope, existingDashboard)) return null;
  const data: Prisma.DashboardUncheckedUpdateInput = {};
  if (typeof input.name === 'string') data.name = input.name.trim();
  if (typeof input.description === 'string') data.description = input.description.trim();
  if ('categoryId' in input) {
    const requestedCategoryId = optionalString(input.categoryId);
    const category = requestedCategoryId ? await categoryNameById(tx, requestedCategoryId) : '';
    data.section = category;
    data.categoryId = requestedCategoryId ?? null;
  } else if (typeof input.category === 'string') {
    data.section = input.category.trim();
    data.categoryId = await findCategoryId(tx, input.category.trim());
  }
  if (isRecord(input.settings)) {
    data.settings = toInputJson(mergeDashboardSettings(jsonRecord(existingDashboard.settings), input.settings));
  }
  if (input.status === 'draft' || input.status === 'published') data.status = input.status;
  if (Array.isArray(input.layout)) data.draftLayout = toNullableInputJson(input.layout);
  await tx.dashboard.update({ where: { id }, data });
  if (Array.isArray(input.elements)) {
    await tx.dashboardElement.deleteMany({ where: { dashboardId: id } });
    for (const element of input.elements.filter(isRecord)) await createElementWithTx(tx, id, element);
  }
  if (Array.isArray(input.filters)) {
    await tx.dashboardFilter.deleteMany({ where: { dashboardId: id } });
    for (const filter of input.filters.filter(isRecord)) await createFilterWithTx(tx, id, filter);
  }
  await syncDraftState(tx, id);
  return findDashboardOrThrow(tx, id);
}

export async function createElementWithTx(
  tx: Prisma.TransactionClient,
  dashboardId: string,
  input: Record<string, unknown>
): Promise<DashboardElement> {
  const shape = normalizeDashboardElementShape({
    type: optionalString(input.type) ?? 'chart',
    chartType: optionalString(input.chartType),
    config: nextElementConfig(undefined, input)
  });
  const requestedDataSourceId = optionalString(input.dataSourceId) ?? optionalString(shape.config.dataSourceId);
  const id = await uniqueElementId(tx, optionalString(input.dbId) ?? optionalString(input.id));
  const record = await tx.dashboardElement.create({
    data: {
      id,
      dashboardId,
      name: optionalString(input.name) ?? 'Dashboard Element',
      type: shape.type,
      chartType: shape.chartType ?? null,
      dataSourceId: requestedDataSourceId ? await databaseDataSourceId(tx, requestedDataSourceId) : null,
      layout: toInputJson(readRecord(input.layout)),
      config: toNullableInputJson(shape.config),
      order: readNumber(input.order) ?? await tx.dashboardElement.count({ where: { dashboardId } }),
      isVisible: typeof input.isVisible === 'boolean' ? input.isVisible : true
    }
  });
  return toElement(record);
}

export async function createFilterWithTx(
  tx: Prisma.TransactionClient,
  dashboardId: string,
  input: Record<string, unknown>
): Promise<DashboardFilter> {
  const id = await uniqueFilterId(tx, optionalString(input.id));
  const record = await tx.dashboardFilter.create({
    data: {
      id,
      dashboardId,
      name: optionalString(input.name) ?? 'Dashboard Filter',
      field: optionalString(input.field) ?? '',
      operator: optionalString(input.operator) ?? 'equals',
      value: toInputJson(input.value ?? null),
      config: toNullableInputJson(readRecord(input.config)),
      type: optionalString(input.type) ?? 'interactive',
      isActive: typeof input.isActive === 'boolean' ? input.isActive : true,
      order: readNumber(input.order) ?? await tx.dashboardFilter.count({ where: { dashboardId } })
    }
  });
  return toFilter(record);
}

export async function createVersionWithTx(
  tx: Prisma.TransactionClient,
  dashboardId: string,
  name: string,
  options: { isAutoSave?: boolean; isPublished?: boolean } = {}
): Promise<DashboardVersion | null> {
  const dashboard = await findDashboard(tx, dashboardId);
  if (!dashboard) return null;
  const user = await versionUser(tx);
  const last = await tx.dashboardVersion.findFirst({ where: { dashboardId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
  const snapshot = options.isPublished ? { ...dashboard, status: 'published' as const } : dashboard;
  const record = await tx.dashboardVersion.create({
    data: {
      id: uuidv7(),
      dashboardId,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      userId: user.id,
      userName: user.name,
      changes: toInputJson([]),
      comment: name,
      isAutoSave: options.isAutoSave === true,
      isPublished: options.isPublished === true,
      publishedAt: options.isPublished === true ? new Date() : null,
      dashboardSnapshot: toInputJson(snapshot)
    }
  });
  return toVersion(record);
}

export async function replaceDashboardFromSnapshot(
  tx: Prisma.TransactionClient,
  dashboardId: string,
  snapshot: Dashboard,
  scope?: DashboardAccessScope
): Promise<Dashboard | null> {
  if (!await canWriteDashboardWithTx(tx, dashboardId, scope)) return null;
  const categoryId = snapshot.categoryId === undefined
    ? await findCategoryId(tx, snapshot.category)
    : snapshot.categoryId;
  await tx.dashboard.update({
    where: { id: dashboardId },
    data: {
      name: snapshot.name,
      description: snapshot.description ?? null,
      section: snapshot.category,
      categoryId: categoryId ?? null,
      status: snapshot.status,
      draftLayout: toNullableInputJson(snapshot.layout),
      draftFilters: toNullableInputJson(snapshot.filters),
      settings: toInputJson(mergeDashboardSettings({}, isRecord(snapshot.settings) ? snapshot.settings : {})),
    }
  });
  await tx.dashboardElement.deleteMany({ where: { dashboardId } });
  await tx.dashboardFilter.deleteMany({ where: { dashboardId } });
  for (const element of snapshot.elements) await createElementWithTx(tx, dashboardId, { ...element, dashboardId });
  for (const filter of snapshot.filters) await createFilterWithTx(tx, dashboardId, { ...filter, dashboardId });
  await syncDraftState(tx, dashboardId);
  return findDashboardOrThrow(tx, dashboardId, scope);
}

export async function syncDraftState(tx: Prisma.TransactionClient, dashboardId: string): Promise<void> {
  const [elements, filters] = await Promise.all([
    tx.dashboardElement.findMany({ where: { dashboardId }, orderBy: { order: 'asc' } }),
    tx.dashboardFilter.findMany({ where: { dashboardId }, orderBy: { order: 'asc' } })
  ]);
  await tx.dashboard.update({
    where: { id: dashboardId },
    data: {
      draftLayout: toNullableInputJson(elements.map(element => ({ id: element.id, ...jsonRecord(element.layout) }))),
      draftFilters: toNullableInputJson(filters.map(toFilter))
    }
  });
}

export function nextElementConfig(existing: unknown, input: Record<string, unknown>): Record<string, unknown> {
  const config = isRecord(input.config) ? readRecord(input.config) : jsonRecord(existing);
  if (typeof input.dataSourceId === 'string') config.dataSourceId = input.dataSourceId;
  if (input.dataSourceId === null) delete config.dataSourceId;
  return config;
}
