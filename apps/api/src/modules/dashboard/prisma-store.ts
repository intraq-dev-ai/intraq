import { uuidv7 } from '@intraq/contracts';
import type { IntraQPrismaClient, Prisma } from '@intraq/db';
import type {
  CategoryCreateInput,
  Dashboard,
  DashboardAccessScope,
  DashboardCategory,
  DashboardCreateInput,
  DashboardElement,
  DashboardFilter,
  DashboardListOptions,
  DashboardMenuItem,
  DashboardRuntimeStore,
  DashboardUpdateInput,
  DashboardVersion
} from './foundation-store.js';
import { DashboardFoundationStore, dashboardMenuVisible } from './foundation-store.js';
import {
  canWriteCategoryRecord,
  categoryVisibilityWhere,
  scopedCategoryWhere,
  scopedCreateCategoryData
} from './dashboard-access.js';
import { normalizeDashboardElementShape } from './dashboard-element-shape.js';
import { isRecord, optionalString, readNumber } from './foundation-store-utils.js';
import {
  readDashboardSnapshot,
  toCategory,
  toElement,
  toFilter,
  toInputJson,
  toNullableInputJson,
  toVersion
} from './prisma-mappers.js';
import {
  canReadDashboard,
  canWriteDashboardWithTx,
  databaseDataSourceId,
  findDashboard,
  findDashboardOrThrow,
  getDashboardModeFromPrisma,
  listDashboardsFromPrisma,
  uniqueCategoryId,
  versionUserId
} from './prisma-store-query-helpers.js';
import {
  createDashboardWithTx,
  createElementWithTx,
  createFilterWithTx,
  createVersionWithTx,
  nextElementConfig,
  replaceDashboardFromSnapshot,
  syncDraftState,
  updateDashboardWithTx
} from './prisma-store-write-helpers.js';

export class DashboardPrismaStore implements DashboardRuntimeStore {
  constructor(private readonly client: IntraQPrismaClient) {}

  async syncFromMemorySeed(seedStore: DashboardFoundationStore): Promise<void> {
    for (const category of seedStore.listCategories()) {
      if (!await this.client.dashboardCategory.findFirst({ where: { name: category.name }, select: { id: true } })) {
        await this.createCategory({
          id: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          sortOrder: category.sortOrder
        });
      }
    }
    for (const dashboard of seedStore.listDashboards()) {
      if (!await this.client.dashboard.findUnique({ where: { id: dashboard.id }, select: { id: true } })) {
        await this.createDashboard({
          id: dashboard.id,
          name: dashboard.name,
          description: dashboard.description,
          category: dashboard.category,
          status: dashboard.status,
          layout: dashboard.layout,
          elements: dashboard.elements,
          filters: dashboard.filters,
          isGlobal: dashboard.isGlobal,
          isPublic: dashboard.isPublic,
          isSample: dashboard.isSample,
          settings: dashboard.settings
        });
        if (dashboard.status === 'published') await this.publishDashboard(dashboard.id);
      }
    }
  }

  async listMenu(scope?: DashboardAccessScope, options: DashboardListOptions = {}): Promise<DashboardMenuItem[]> {
    return (await this.listDashboards(scope))
      .filter(dashboardMenuVisible)
      .slice(0, options.limit ?? Number.POSITIVE_INFINITY)
      .map(({ id, name, category, categoryId, createdAt, isGlobal, isGloballyVisible, isSample, settings, tenant, updatedAt }) => ({
        id,
        name,
        category,
        categoryId: categoryId ?? null,
        createdAt,
        updatedAt,
        ...(typeof isGlobal === 'boolean' ? { isGlobal } : {}),
        ...(typeof isGloballyVisible === 'boolean' ? { isGloballyVisible } : {}),
        ...(typeof isSample === 'boolean' ? { isSample } : {}),
        ...(typeof settings?.isFavorite === 'boolean' ? { settings: { isFavorite: settings.isFavorite } } : {}),
        ...(tenant ? { tenant } : {})
      }));
  }

  async listDashboards(scope?: DashboardAccessScope, options: DashboardListOptions = {}): Promise<Dashboard[]> {
    return listDashboardsFromPrisma(this.client, scope, options);
  }

  async getDashboard(id: string, scope?: DashboardAccessScope): Promise<Dashboard | null> {
    return findDashboard(this.client, id, scope);
  }

  async getDashboardMode(id: string, mode: string, scope?: DashboardAccessScope): Promise<Dashboard | null> {
    return getDashboardModeFromPrisma(this.client, id, mode, scope);
  }

  async createDashboard(input: DashboardCreateInput, scope?: DashboardAccessScope): Promise<Dashboard> {
    return this.client.$transaction(tx => createDashboardWithTx(tx, input, scope));
  }

  async updateDashboard(id: string, input: DashboardUpdateInput, scope?: DashboardAccessScope): Promise<Dashboard | null> {
    return this.client.$transaction(tx => updateDashboardWithTx(tx, id, input, scope));
  }

  async publishDashboard(id: string, scope?: DashboardAccessScope): Promise<Dashboard | null> {
    return this.client.$transaction(async tx => {
      if (!await canWriteDashboardWithTx(tx, id, scope)) return null;
      const version = await createVersionWithTx(tx, id, 'Published version', { isPublished: true });
      if (!version) return null;
      await tx.dashboard.update({
        where: { id },
        data: {
          status: 'published',
          publishedAt: new Date(),
          publishedBy: await versionUserId(tx),
          publishedVersionId: version.id
        }
      });
      await syncDraftState(tx, id);
      return findDashboardOrThrow(tx, id);
    });
  }

  async draftDashboard(id: string, scope?: DashboardAccessScope): Promise<Dashboard | null> {
    const dashboard = await this.updateDashboard(id, { status: 'draft' }, scope);
    return dashboard;
  }

  async deleteDashboard(id: string, scope?: DashboardAccessScope): Promise<boolean> {
    try {
      await this.client.$transaction(async tx => {
        if (!await canWriteDashboardWithTx(tx, id, scope)) throw new Error('Dashboard not found');
        await tx.dashboard.update({ where: { id }, data: { publishedVersionId: null } });
        await tx.dashboard.delete({ where: { id } });
      });
      return true;
    } catch {
      return false;
    }
  }

  async duplicateDashboard(id: string, name?: string, _createdBy?: string, scope?: DashboardAccessScope): Promise<Dashboard | null> {
    const dashboard = await this.getDashboard(id, scope);
    if (!dashboard) return null;
    return this.createDashboard({
      ...dashboard,
      id: uuidv7(),
      name: name?.trim() || `${dashboard.name} Copy`,
      status: 'draft',
      elements: dashboard.elements.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...element }) => element),
      filters: dashboard.filters.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...filter }) => filter)
    }, scope);
  }

  async listElements(dashboardId: string, scope?: DashboardAccessScope): Promise<DashboardElement[] | null> {
    if (!await canReadDashboard(this.client, dashboardId, scope)) return null;
    const records = await this.client.dashboardElement.findMany({ where: { dashboardId }, orderBy: { order: 'asc' } });
    return records.map(toElement);
  }

  async createElement(dashboardId: string, input: Record<string, unknown>, scope?: DashboardAccessScope): Promise<DashboardElement | null> {
    return this.client.$transaction(async tx => {
      if (!await canWriteDashboardWithTx(tx, dashboardId, scope)) return null;
      const element = await createElementWithTx(tx, dashboardId, input);
      await syncDraftState(tx, dashboardId);
      return element;
    });
  }

  async updateElement(elementId: string, input: Record<string, unknown>, scope?: DashboardAccessScope): Promise<DashboardElement | null> {
    return this.client.$transaction(async tx => {
      const existing = await tx.dashboardElement.findUnique({ where: { id: elementId } });
      if (!existing) return null;
      if (!await canWriteDashboardWithTx(tx, existing.dashboardId, scope)) return null;
      const data: Prisma.DashboardElementUncheckedUpdateInput = {};
      if (typeof input.name === 'string') data.name = input.name.trim();
      if (isRecord(input.layout)) data.layout = toInputJson(input.layout);
      if (typeof input.order === 'number') data.order = input.order;
      if (typeof input.isVisible === 'boolean') data.isVisible = input.isVisible;
      if (typeof input.type === 'string' || typeof input.chartType === 'string' || isRecord(input.config) || 'dataSourceId' in input) {
        const shape = normalizeDashboardElementShape({
          type: optionalString(input.type) ?? existing.type,
          chartType: optionalString(input.chartType) ?? existing.chartType,
          config: nextElementConfig(existing.config, input)
        });
        data.type = shape.type;
        data.chartType = shape.chartType ?? null;
        data.config = toNullableInputJson(shape.config);
      }
      if (typeof input.dataSourceId === 'string' || input.dataSourceId === null) {
        data.dataSourceId = input.dataSourceId ? await databaseDataSourceId(tx, input.dataSourceId) : null;
      }
      const updated = await tx.dashboardElement.update({ where: { id: elementId }, data });
      await syncDraftState(tx, existing.dashboardId);
      return toElement(updated);
    });
  }

  async deleteElement(elementId: string, scope?: DashboardAccessScope): Promise<boolean> {
    return this.client.$transaction(async tx => {
      const existing = await tx.dashboardElement.findUnique({ where: { id: elementId }, select: { dashboardId: true } });
      if (!existing) return false;
      if (!await canWriteDashboardWithTx(tx, existing.dashboardId, scope)) return false;
      await tx.dashboardElement.delete({ where: { id: elementId } });
      await syncDraftState(tx, existing.dashboardId);
      return true;
    });
  }

  async listFilters(dashboardId: string, type?: string, scope?: DashboardAccessScope): Promise<DashboardFilter[] | null> {
    if (!await canReadDashboard(this.client, dashboardId, scope)) return null;
    const records = await this.client.dashboardFilter.findMany({
      where: { dashboardId, ...(type ? { type } : {}) },
      orderBy: { order: 'asc' }
    });
    return records.map(toFilter);
  }

  async createFilter(dashboardId: string, input: Record<string, unknown>, scope?: DashboardAccessScope): Promise<DashboardFilter | null> {
    return this.client.$transaction(async tx => {
      if (!await canWriteDashboardWithTx(tx, dashboardId, scope)) return null;
      const filter = await createFilterWithTx(tx, dashboardId, input);
      await syncDraftState(tx, dashboardId);
      return filter;
    });
  }

  async updateFilter(dashboardId: string, filterId: string, input: Record<string, unknown>, scope?: DashboardAccessScope): Promise<DashboardFilter | null> {
    return this.client.$transaction(async tx => {
      const existing = await tx.dashboardFilter.findUnique({ where: { id: filterId } });
      if (!existing || existing.dashboardId !== dashboardId) return null;
      if (!await canWriteDashboardWithTx(tx, dashboardId, scope)) return null;
      const data: Prisma.DashboardFilterUncheckedUpdateInput = {};
      if (typeof input.name === 'string') data.name = input.name.trim();
      if (typeof input.field === 'string') data.field = input.field.trim();
      if (typeof input.operator === 'string') data.operator = input.operator.trim();
      if ('value' in input) data.value = toInputJson(input.value ?? null);
      if (typeof input.type === 'string') data.type = input.type.trim();
      if (isRecord(input.config)) data.config = toNullableInputJson(input.config);
      if (typeof input.isActive === 'boolean') data.isActive = input.isActive;
      if (typeof input.order === 'number') data.order = input.order;
      const updated = await tx.dashboardFilter.update({ where: { id: filterId }, data });
      await syncDraftState(tx, dashboardId);
      return toFilter(updated);
    });
  }

  async replaceFilters(dashboardId: string, inputs: Record<string, unknown>[], scope?: DashboardAccessScope): Promise<DashboardFilter[] | null> {
    return this.client.$transaction(async tx => {
      if (!await canWriteDashboardWithTx(tx, dashboardId, scope)) return null;
      await tx.dashboardFilter.deleteMany({ where: { dashboardId } });
      const filters: DashboardFilter[] = [];
      for (const input of inputs) filters.push(await createFilterWithTx(tx, dashboardId, input));
      await syncDraftState(tx, dashboardId);
      return filters;
    });
  }

  async deleteFilter(dashboardId: string, filterId: string, scope?: DashboardAccessScope): Promise<boolean> {
    return this.client.$transaction(async tx => {
      const existing = await tx.dashboardFilter.findUnique({ where: { id: filterId }, select: { dashboardId: true } });
      if (!existing || existing.dashboardId !== dashboardId) return false;
      if (!await canWriteDashboardWithTx(tx, dashboardId, scope)) return false;
      await tx.dashboardFilter.delete({ where: { id: filterId } });
      await syncDraftState(tx, dashboardId);
      return true;
    });
  }

  async deleteFilters(dashboardId: string, scope?: DashboardAccessScope): Promise<boolean> {
    return (await this.replaceFilters(dashboardId, [], scope)) !== null;
  }

  async listCategories(scope?: DashboardAccessScope): Promise<DashboardCategory[]> {
    const visibilityWhere = await categoryVisibilityWhere(this.client, scope);
    const records = await this.client.dashboardCategory.findMany({
      ...(visibilityWhere ? { where: visibilityWhere } : {}),
      orderBy: { sortOrder: 'asc' }
    });
    return records.map(toCategory);
  }

  async getCategory(id: string, scope?: DashboardAccessScope): Promise<DashboardCategory | null> {
    const visibilityWhere = await categoryVisibilityWhere(this.client, scope);
    const record = await this.client.dashboardCategory.findFirst({
      where: scopedCategoryWhere(id, visibilityWhere)
    });
    return record ? toCategory(record) : null;
  }

  async createCategory(input: CategoryCreateInput, scope?: DashboardAccessScope): Promise<DashboardCategory> {
    return this.client.$transaction(async tx => {
      const id = await uniqueCategoryId(tx, optionalString(input.id));
      const scopedTenantData = scopedCreateCategoryData(input, scope);
      const record = await tx.dashboardCategory.create({
        data: {
          id,
          name: input.name.trim(),
          description: optionalString(input.description) ?? null,
          color: optionalString(input.color) ?? '#64748b',
          icon: optionalString(input.icon) ?? 'LayoutDashboard',
          sortOrder: readNumber(input.sortOrder) ?? await tx.dashboardCategory.count(),
          ...scopedTenantData
        }
      });
      return toCategory(record);
    });
  }

  async updateCategory(id: string, input: Record<string, unknown>, scope?: DashboardAccessScope): Promise<DashboardCategory | null> {
    try {
      const existing = await this.client.dashboardCategory.findUnique({ where: { id }, select: { tenantId: true } });
      if (!existing || !canWriteCategoryRecord(scope, existing)) return null;
      const data: Prisma.DashboardCategoryUncheckedUpdateInput = {};
      if (typeof input.name === 'string') data.name = input.name.trim();
      if (typeof input.color === 'string') data.color = input.color.trim();
      if (typeof input.icon === 'string') data.icon = input.icon.trim();
      if (typeof input.sortOrder === 'number') data.sortOrder = input.sortOrder;
      return toCategory(await this.client.dashboardCategory.update({ where: { id }, data }));
    } catch {
      return null;
    }
  }

  async deleteCategory(id: string, scope?: DashboardAccessScope): Promise<boolean> {
    try {
      const existing = await this.client.dashboardCategory.findUnique({ where: { id }, select: { tenantId: true } });
      if (!existing || !canWriteCategoryRecord(scope, existing)) return false;
      await this.client.dashboardCategory.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async reorderCategories(ids: string[], scope?: DashboardAccessScope): Promise<DashboardCategory[] | null> {
    return this.client.$transaction(async tx => {
      const records = await tx.dashboardCategory.findMany({ where: { id: { in: ids } }, select: { id: true, tenantId: true } });
      if (records.length !== ids.length || records.some(record => !canWriteCategoryRecord(scope, record))) return null;
      for (const [index, id] of ids.entries()) await tx.dashboardCategory.update({ where: { id }, data: { sortOrder: index } });
      const visibilityWhere = await categoryVisibilityWhere(tx, scope);
      return (await tx.dashboardCategory.findMany({
        ...(visibilityWhere ? { where: visibilityWhere } : {}),
        orderBy: { sortOrder: 'asc' }
      })).map(toCategory);
    });
  }

  async listVersions(dashboardId: string, scope?: DashboardAccessScope): Promise<DashboardVersion[] | null> {
    if (!await canReadDashboard(this.client, dashboardId, scope)) return null;
    const records = await this.client.dashboardVersion.findMany({
      where: { dashboardId, isPublished: true },
      orderBy: { createdAt: 'desc' }
    });
    return records.map(toVersion);
  }

  async createVersion(dashboardId: string, name: string, options: { isAutoSave?: boolean } = {}, scope?: DashboardAccessScope): Promise<DashboardVersion | null> {
    return this.client.$transaction(async tx => {
      if (!await canWriteDashboardWithTx(tx, dashboardId, scope)) return null;
      return createVersionWithTx(tx, dashboardId, name, options);
    });
  }

  async getVersion(versionId: string, scope?: DashboardAccessScope): Promise<DashboardVersion | null> {
    const record = await this.client.dashboardVersion.findUnique({ where: { id: versionId } });
    if (record && !await canReadDashboard(this.client, record.dashboardId, scope)) return null;
    return record ? toVersion(record) : null;
  }

  async deleteVersion(versionId: string, scope?: DashboardAccessScope): Promise<boolean> {
    try {
      await this.client.$transaction(async tx => {
        const record = await tx.dashboardVersion.findUnique({ where: { id: versionId }, select: { dashboardId: true } });
        if (!record || !await canWriteDashboardWithTx(tx, record.dashboardId, scope)) throw new Error('Dashboard version not found');
        await tx.dashboardVersion.delete({ where: { id: versionId } });
      });
      return true;
    } catch {
      return false;
    }
  }

  async restoreVersion(dashboardId: string, versionId: string, scope?: DashboardAccessScope): Promise<{ dashboard: Dashboard; restoredFromVersionId: string } | null> {
    return this.client.$transaction(async tx => {
      if (!await canWriteDashboardWithTx(tx, dashboardId, scope)) return null;
      const version = await tx.dashboardVersion.findUnique({ where: { id: versionId } });
      if (!version || version.dashboardId !== dashboardId) return null;
      const snapshot = readDashboardSnapshot(version.dashboardSnapshot);
      if (!snapshot) return null;
      const dashboard = await replaceDashboardFromSnapshot(tx, dashboardId, snapshot, scope);
      if (dashboard && version.isPublished) {
        await tx.dashboard.update({
          where: { id: dashboardId },
          data: {
            status: 'published',
            publishedAt: version.publishedAt ?? new Date(),
            publishedBy: await versionUserId(tx),
            publishedVersionId: version.id
          }
        });
        return { dashboard: await findDashboardOrThrow(tx, dashboardId, scope), restoredFromVersionId: versionId };
      }
      return dashboard ? { dashboard, restoredFromVersionId: versionId } : null;
    });
  }

  async compareVersions(leftVersionId: string, rightVersionId: string, scope?: DashboardAccessScope): Promise<{ leftVersionId: string; rightVersionId: string; differences: Array<Record<string, unknown>> } | null> {
    const [left, right] = await Promise.all([this.getVersion(leftVersionId, scope), this.getVersion(rightVersionId, scope)]);
    if (!left?.snapshot || !right?.snapshot) return null;
    return {
      leftVersionId,
      rightVersionId,
      differences: [
        { field: 'name', left: left.snapshot.name, right: right.snapshot.name },
        { field: 'status', left: left.snapshot.status, right: right.snapshot.status },
        { field: 'elements', left: left.snapshot.elements.length, right: right.snapshot.elements.length }
      ]
    };
  }
}
