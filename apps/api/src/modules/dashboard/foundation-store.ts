import { uuidv7 } from '@intraq/contracts';
import {
  clone,
  cloneOrNull,
  isRecord,
  nowIso,
  optionalString,
  readArray,
  readNumber,
  readRecord,
  requestedOrUniqueId,
  uniqueId
} from './foundation-store-utils.js';
import { isViewerRole } from './dashboard-access.js';
import { normalizeDashboardElementShape } from './dashboard-element-shape.js';
import {
  assignBooleanMetadata,
  canReadDashboardByScope,
  dashboardMenuVisible,
  dashboardWithLiveSettings,
  mergeDashboardSettings
} from './foundation-store-helpers.js';
import type {
  CategoryCreateInput, Dashboard, DashboardAccessScope, DashboardCategory, DashboardCreateInput, DashboardElement,
  DashboardFilter, DashboardListOptions, DashboardMenuItem, DashboardRuntimeStore, DashboardSettings,
  DashboardUpdateInput, DashboardVersion
} from './foundation-store-types.js';

export { dashboardMenuVisible } from './foundation-store-helpers.js';
export type {
  CategoryCreateInput, Dashboard, DashboardAccessScope, DashboardCategory, DashboardCreateInput,
  DashboardDataCachePolicy, DashboardElement, DashboardFilter, DashboardListOptions, DashboardMenuItem,
  DashboardRuntimeStore, DashboardSettings, DashboardUpdateInput, DashboardVersion, ElementCreateInput,
  FilterCreateInput, MaybePromise
} from './foundation-store-types.js';

export class DashboardFoundationStore implements DashboardRuntimeStore {
  private readonly dashboards = new Map<string, Dashboard>();
  private readonly categories = new Map<string, DashboardCategory>();
  private readonly publishedSnapshots = new Map<string, Dashboard>();
  private readonly versions = new Map<string, DashboardVersion[]>();

  constructor() {
    this.createCategory({
      name: 'Operations',
      color: '#2563eb',
      icon: 'LayoutDashboard',
      sortOrder: 0
    });
  }

  listMenu(scope?: DashboardAccessScope, options: DashboardListOptions = {}): DashboardMenuItem[] {
    return this.listDashboards(scope)
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

  listDashboards(scope?: DashboardAccessScope, options: DashboardListOptions = {}): Dashboard[] {
    const usePublishedSnapshots = Boolean(scope && isViewerRole(scope.role));
    return Array.from(this.dashboards.values())
      .filter(dashboard => canReadDashboardByScope(dashboard, scope, this.publishedSnapshots.has(dashboard.id)))
      .map(dashboard => {
        const snapshot = usePublishedSnapshots ? this.publishedSnapshots.get(dashboard.id) : undefined;
        return clone(snapshot ? dashboardWithLiveSettings(snapshot, dashboard) : dashboard);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  }

  getDashboard(id: string, scope?: DashboardAccessScope): Dashboard | null {
    const dashboard = this.dashboards.get(id);
    if (!canReadDashboardByScope(dashboard, scope, this.publishedSnapshots.has(id))) return null;
    const snapshot = scope && isViewerRole(scope.role) ? this.publishedSnapshots.get(id) : undefined;
    return clone(snapshot && dashboard ? dashboardWithLiveSettings(snapshot, dashboard) : dashboard);
  }

  getDashboardMode(id: string, mode: string, scope?: DashboardAccessScope): Dashboard | null {
    const dashboard = this.dashboards.get(id);
    if (!dashboard) return null;
    if (mode === 'published') {
      const snapshot = this.publishedSnapshots.get(id);
      if (!snapshot && dashboard.status !== 'published') return null;
      if (!canReadDashboardByScope(dashboard, scope, Boolean(snapshot))) return null;
      return clone(snapshot ? dashboardWithLiveSettings(snapshot, dashboard) : dashboard);
    }
    if (mode === 'view' && scope && isViewerRole(scope.role)) {
      const snapshot = this.publishedSnapshots.get(id);
      if (!canReadDashboardByScope(dashboard, scope, Boolean(snapshot))) return null;
      return clone(snapshot ? dashboardWithLiveSettings(snapshot, dashboard) : dashboard);
    }
    if (!canReadDashboardByScope(dashboard, scope, this.publishedSnapshots.has(id))) return null;
    return clone(dashboard);
  }

  createDashboard(input: DashboardCreateInput): Dashboard {
    const now = nowIso();
    const dashboard: Dashboard = {
      id: requestedOrUniqueId(input.id, this.dashboards),
      name: input.name.trim(),
      category: optionalString(input.category) ?? 'Operations',
      status: input.status === 'published' ? 'published' : 'draft',
      layout: Array.isArray(input.layout) ? clone(input.layout) : [],
      elements: [],
      filters: [],
      createdAt: optionalString(input.createdAt) ?? now,
      updatedAt: optionalString(input.updatedAt) ?? now
    };
    const description = optionalString(input.description);
    const createdBy = optionalString(input.createdBy);
    if (description) dashboard.description = description;
    if (createdBy) dashboard.createdBy = createdBy;
    assignBooleanMetadata(dashboard, input);
    if (isRecord(input.tenant)) dashboard.tenant = clone(input.tenant);
    if (isRecord(input.settings)) {
      const mergedSettings = mergeDashboardSettings(
        (dashboard.settings ?? {}) as Record<string, unknown>,
        clone(input.settings) as Record<string, unknown>
      ) as DashboardSettings;
      if (Object.keys(mergedSettings).length > 0) dashboard.settings = mergedSettings;
      else delete dashboard.settings;
    }
    this.dashboards.set(dashboard.id, dashboard);
    for (const element of readArray(input.elements)) this.createElement(dashboard.id, element);
    for (const filter of readArray(input.filters)) this.createFilter(dashboard.id, filter);
    return this.getDashboard(dashboard.id) as Dashboard;
  }

  updateDashboard(id: string, input: DashboardUpdateInput): Dashboard | null {
    const dashboard = this.dashboards.get(id);
    if (!dashboard) return null;
    if (typeof input.name === 'string') dashboard.name = input.name.trim();
    if (typeof input.description === 'string') dashboard.description = input.description.trim();
    if ('categoryId' in input) {
      const requestedCategoryId = optionalString(input.categoryId);
      dashboard.categoryId = requestedCategoryId ?? null;
      dashboard.category = requestedCategoryId ? (this.categories.get(requestedCategoryId)?.name ?? '') : '';
    } else if (typeof input.category === 'string') {
      dashboard.category = input.category.trim();
    }
    if (input.status === 'draft' || input.status === 'published') dashboard.status = input.status;
    if (Array.isArray(input.layout)) dashboard.layout = clone(input.layout);
    if (Array.isArray(input.elements)) {
      dashboard.elements = [];
      for (const element of input.elements) this.createElement(id, element);
    }
    if (Array.isArray(input.filters)) {
      dashboard.filters = [];
      for (const filter of input.filters) this.createFilter(id, filter);
    }
    if (isRecord(input.settings)) {
      const mergedSettings = mergeDashboardSettings(
        (dashboard.settings ?? {}) as Record<string, unknown>,
        clone(input.settings) as Record<string, unknown>
      ) as DashboardSettings;
      if (Object.keys(mergedSettings).length > 0) dashboard.settings = mergedSettings;
      else delete dashboard.settings;
    }
    dashboard.updatedAt = nowIso();
    return this.getDashboard(id);
  }

  publishDashboard(id: string): Dashboard | null {
    const dashboard = this.dashboards.get(id);
    if (!dashboard) return null;
    dashboard.status = 'published';
    dashboard.updatedAt = nowIso();
    const snapshot = clone(dashboard);
    this.publishedSnapshots.set(id, snapshot);
    const version = this.createVersionSnapshot(dashboard, 'Published version', { isPublished: true, snapshot });
    this.versions.set(id, [version, ...this.listRawVersions(id)]);
    return this.getDashboard(id);
  }

  draftDashboard(id: string): Dashboard | null {
    const dashboard = this.dashboards.get(id);
    if (!dashboard) return null;
    dashboard.status = 'draft';
    dashboard.updatedAt = nowIso();
    return this.getDashboard(id);
  }

  deleteDashboard(id: string): boolean {
    this.publishedSnapshots.delete(id);
    return this.dashboards.delete(id);
  }

  duplicateDashboard(id: string, name?: string, createdBy?: string): Dashboard | null {
    const dashboard = this.dashboards.get(id);
    if (!dashboard) return null;
    return this.createDashboard({
      ...clone(dashboard),
      name: name?.trim() || `${dashboard.name} Copy`,
      createdBy
    });
  }

  listVersions(dashboardId: string, scope?: DashboardAccessScope): DashboardVersion[] | null {
    const dashboard = this.dashboards.get(dashboardId);
    if (!canReadDashboardByScope(dashboard, scope, this.publishedSnapshots.has(dashboardId))) return null;
    return this.listRawVersions(dashboardId)
      .filter(version => version.isPublished === true)
      .map(clone);
  }

  createVersion(dashboardId: string, name: string, options: { isAutoSave?: boolean } = {}): DashboardVersion | null {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;
    const version = this.createVersionSnapshot(dashboard, name, { isAutoSave: options.isAutoSave === true });
    this.versions.set(dashboardId, [version, ...this.listRawVersions(dashboardId)]);
    return clone(version);
  }

  getVersion(versionId: string, scope?: DashboardAccessScope): DashboardVersion | null {
    const version = Array.from(this.versions.values()).flat().find(item => item.id === versionId);
    if (!version) return null;
    const dashboard = this.dashboards.get(version.dashboardId);
    if (!canReadDashboardByScope(dashboard, scope, this.publishedSnapshots.has(version.dashboardId))) return null;
    return clone(version);
  }

  deleteVersion(versionId: string, scope?: DashboardAccessScope): boolean {
    const version = this.getVersion(versionId, scope);
    if (!version) return false;
    this.versions.set(version.dashboardId, this.listRawVersions(version.dashboardId).filter(item => item.id !== versionId));
    return true;
  }

  restoreVersion(dashboardId: string, versionId: string, scope?: DashboardAccessScope): { dashboard: Dashboard; restoredFromVersionId: string } | null {
    const version = this.getVersion(versionId, scope);
    if (!version?.snapshot || version.dashboardId !== dashboardId) return null;
    const dashboard = this.updateDashboard(dashboardId, { ...version.snapshot });
    if (dashboard && version.isPublished === true) this.publishedSnapshots.set(dashboardId, clone(dashboard));
    return dashboard ? { dashboard, restoredFromVersionId: versionId } : null;
  }

  compareVersions(leftVersionId: string, rightVersionId: string, scope?: DashboardAccessScope): { leftVersionId: string; rightVersionId: string; differences: Array<Record<string, unknown>> } | null {
    const left = this.getVersion(leftVersionId, scope);
    const right = this.getVersion(rightVersionId, scope);
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

  private createVersionSnapshot(
    dashboard: Dashboard,
    name: string,
    options: { isAutoSave?: boolean; isPublished?: boolean; snapshot?: Dashboard } = {}
  ): DashboardVersion {
    const createdAt = nowIso();
    const snapshot = clone(options.snapshot ?? dashboard);
    return {
      id: uuidv7(),
      dashboardId: dashboard.id,
      comment: name,
      isAutoSave: options.isAutoSave === true,
      isPublished: options.isPublished === true,
      name,
      publishedAt: options.isPublished === true ? createdAt : null,
      status: snapshot.status,
      snapshot,
      userName: 'intraQ',
      versionNumber: this.nextVersionNumber(dashboard.id),
      createdAt
    };
  }

  private nextVersionNumber(dashboardId: string): number {
    return Math.max(0, ...this.listRawVersions(dashboardId).map(version => version.versionNumber ?? 0)) + 1;
  }

  private listRawVersions(dashboardId: string): DashboardVersion[] {
    return this.versions.get(dashboardId) ?? [];
  }

  listElements(dashboardId: string, scope?: DashboardAccessScope): DashboardElement[] | null {
    const dashboard = this.dashboards.get(dashboardId);
    return canReadDashboardByScope(dashboard, scope) ? clone(dashboard.elements) : null;
  }

  createElement(dashboardId: string, input: Record<string, unknown>): DashboardElement | null {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;
    const now = nowIso();
    const shape = normalizeDashboardElementShape({
      type: optionalString(input.type) ?? 'chart',
      chartType: optionalString(input.chartType),
      config: readRecord(input.config)
    });
    const element: DashboardElement = {
      id: optionalString(input.dbId) ?? optionalString(input.id) ?? uniqueId(new Map(dashboard.elements.map(item => [item.id, item]))),
      dashboardId,
      name: optionalString(input.name) ?? `Element ${dashboard.elements.length + 1}`,
      type: shape.type,
      layout: readRecord(input.layout),
      config: shape.config,
      order: readNumber(input.order) ?? dashboard.elements.length,
      isVisible: typeof input.isVisible === 'boolean' ? input.isVisible : true,
      createdAt: now,
      updatedAt: now
    };
    const dataSourceId = optionalString(input.dataSourceId) ?? optionalString(shape.config.dataSourceId);
    if (shape.chartType) element.chartType = shape.chartType;
    if (dataSourceId) element.dataSourceId = dataSourceId;
    dashboard.elements.push(element);
    dashboard.updatedAt = now;
    return clone(element);
  }

  updateElement(elementId: string, input: Record<string, unknown>): DashboardElement | null {
    const located = this.findElement(elementId);
    if (!located) return null;
    const { dashboard, element } = located;
    if (typeof input.name === 'string') element.name = input.name.trim();
    if (isRecord(input.layout)) element.layout = clone(input.layout);
    if (typeof input.type === 'string' || typeof input.chartType === 'string' || isRecord(input.config)) {
      const shape = normalizeDashboardElementShape({
        type: optionalString(input.type) ?? element.type,
        chartType: optionalString(input.chartType) ?? element.chartType,
        config: isRecord(input.config) ? clone(input.config) : element.config
      });
      element.type = shape.type;
      if (shape.chartType) element.chartType = shape.chartType;
      else delete element.chartType;
      element.config = shape.config;
    }
    if (typeof input.dataSourceId === 'string' || input.dataSourceId === null) {
      element.dataSourceId = input.dataSourceId;
      if (typeof input.dataSourceId === 'string') element.config.dataSourceId = input.dataSourceId;
      if (input.dataSourceId === null) delete element.config.dataSourceId;
    }
    if (typeof input.order === 'number') element.order = input.order;
    if (typeof input.isVisible === 'boolean') element.isVisible = input.isVisible;
    element.updatedAt = nowIso();
    dashboard.updatedAt = element.updatedAt;
    return clone(element);
  }

  deleteElement(elementId: string): boolean {
    const located = this.findElement(elementId);
    if (!located) return false;
    located.dashboard.elements = located.dashboard.elements.filter(element => element.id !== elementId);
    located.dashboard.updatedAt = nowIso();
    return true;
  }

  listFilters(dashboardId: string, type?: string, scope?: DashboardAccessScope): DashboardFilter[] | null {
    const dashboard = this.dashboards.get(dashboardId);
    if (!canReadDashboardByScope(dashboard, scope)) return null;
    const filters = type ? dashboard.filters.filter(filter => filter.type === type) : dashboard.filters;
    return clone(filters);
  }

  createFilter(dashboardId: string, input: Record<string, unknown>): DashboardFilter | null {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;
    const now = nowIso();
    const filter: DashboardFilter = {
      id: optionalString(input.id) ?? uniqueId(new Map(dashboard.filters.map(item => [item.id, item]))),
      dashboardId,
      name: optionalString(input.name) ?? `Filter ${dashboard.filters.length + 1}`,
      field: optionalString(input.field) ?? '',
      operator: optionalString(input.operator) ?? 'equals',
      value: input.value,
      type: optionalString(input.type) ?? 'interactive',
      createdAt: now,
      updatedAt: now
    };
    const config = readRecord(input.config);
    if (Object.keys(config).length > 0) filter.config = config;
    if (typeof input.isActive === 'boolean') filter.isActive = input.isActive;
    if (typeof input.order === 'number') filter.order = input.order;
    dashboard.filters.push(filter);
    dashboard.updatedAt = now;
    return clone(filter);
  }

  updateFilter(dashboardId: string, filterId: string, input: Record<string, unknown>): DashboardFilter | null {
    const dashboard = this.dashboards.get(dashboardId);
    const filter = dashboard?.filters.find(item => item.id === filterId);
    if (!dashboard || !filter) return null;
    if (typeof input.name === 'string') filter.name = input.name.trim();
    if (typeof input.field === 'string') filter.field = input.field.trim();
    if (typeof input.operator === 'string') filter.operator = input.operator.trim();
    if ('value' in input) filter.value = input.value;
    if (typeof input.type === 'string') filter.type = input.type.trim();
    if (isRecord(input.config)) filter.config = readRecord(input.config);
    if (typeof input.isActive === 'boolean') filter.isActive = input.isActive;
    if (typeof input.order === 'number') filter.order = input.order;
    filter.updatedAt = nowIso();
    dashboard.updatedAt = filter.updatedAt;
    return clone(filter);
  }

  replaceFilters(dashboardId: string, inputs: Record<string, unknown>[]): DashboardFilter[] | null {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;
    dashboard.filters = [];
    for (const input of inputs) this.createFilter(dashboardId, input);
    dashboard.updatedAt = nowIso();
    return clone(dashboard.filters);
  }

  deleteFilter(dashboardId: string, filterId: string): boolean {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard?.filters.some(filter => filter.id === filterId)) return false;
    dashboard.filters = dashboard.filters.filter(filter => filter.id !== filterId);
    dashboard.updatedAt = nowIso();
    return true;
  }

  deleteFilters(dashboardId: string): boolean {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return false;
    dashboard.filters = [];
    dashboard.updatedAt = nowIso();
    return true;
  }

  listCategories(): DashboardCategory[] {
    return Array.from(this.categories.values()).map(clone).sort((left, right) => left.sortOrder - right.sortOrder);
  }

  getCategory(id: string): DashboardCategory | null {
    return cloneOrNull(this.categories.get(id));
  }

  createCategory(input: CategoryCreateInput): DashboardCategory {
    const now = nowIso();
    const category: DashboardCategory = {
      id: requestedOrUniqueId(input.id, this.categories),
      name: input.name.trim(),
      color: optionalString(input.color) ?? '#64748b',
      icon: optionalString(input.icon) ?? 'LayoutDashboard',
      sortOrder: readNumber(input.sortOrder) ?? this.categories.size,
      createdAt: now,
      updatedAt: now
    };
    this.categories.set(category.id, category);
    return clone(category);
  }

  updateCategory(id: string, input: Record<string, unknown>): DashboardCategory | null {
    const category = this.categories.get(id);
    if (!category) return null;
    if (typeof input.name === 'string') category.name = input.name.trim();
    if (typeof input.color === 'string') category.color = input.color.trim();
    if (typeof input.icon === 'string') category.icon = input.icon.trim();
    if (typeof input.sortOrder === 'number') category.sortOrder = input.sortOrder;
    category.updatedAt = nowIso();
    return clone(category);
  }

  deleteCategory(id: string): boolean {
    return this.categories.delete(id);
  }

  reorderCategories(ids: string[]): DashboardCategory[] | null {
    if (ids.some(id => !this.categories.has(id))) return null;
    ids.forEach((id, index) => {
      const category = this.categories.get(id);
      if (category) {
        category.sortOrder = index;
        category.updatedAt = nowIso();
      }
    });
    return this.listCategories();
  }

  private findElement(elementId: string): { dashboard: Dashboard; element: DashboardElement } | null {
    for (const dashboard of this.dashboards.values()) {
      const element = dashboard.elements.find(item => item.id === elementId);
      if (element) return { dashboard, element };
    }
    return null;
  }
}
