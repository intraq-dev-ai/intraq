export interface DashboardElement {
  id: string;
  dashboardId: string;
  name: string;
  type: string;
  chartType?: string;
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
  dataSourceId?: string | null;
  order: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardFilter {
  id: string;
  dashboardId: string;
  name: string;
  field: string;
  operator: string;
  value?: unknown;
  config?: Record<string, unknown>;
  isActive?: boolean;
  order?: number;
  placement?: 'bar' | 'canvas';
  type: string;
  createdAt: string;
  updatedAt: string;
}

export type DashboardDataCachePolicy = 'live' | '15m' | '1h' | '1d';

export interface DashboardSettings {
  currencySymbol?: string;
  dataCachePolicy?: DashboardDataCachePolicy;
  dashboard?: Record<string, unknown>;
  closeDropdownOnSelect?: boolean;
  hideMultiSelectSummary?: boolean;
  isFavorite?: boolean;
  menu?: Record<string, unknown>;
  navigation?: Record<string, unknown>;
  menuVisible?: boolean;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  category: string;
  categoryId?: string | null;
  status: 'draft' | 'published';
  layout: unknown[];
  elements: DashboardElement[];
  filters: DashboardFilter[];
  settings?: DashboardSettings;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  isGlobal?: boolean;
  isGloballyVisible?: boolean;
  isPublic?: boolean;
  isSample?: boolean;
  tenant?: Record<string, unknown>;
}

export interface DashboardCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardVersion {
  changes?: Array<Record<string, unknown>>;
  id: string;
  dashboardId: string;
  comment?: string | null;
  isAutoSave?: boolean;
  isPublished?: boolean;
  name: string;
  publishedAt?: string | null;
  status: Dashboard['status'];
  snapshot?: Dashboard;
  userName?: string;
  versionNumber?: number;
  createdAt: string;
}

export type DashboardCreateInput = Record<string, unknown> & { name: string };
export type DashboardUpdateInput = Record<string, unknown>;
export type ElementCreateInput = Record<string, unknown> & { name: string };
export type FilterCreateInput = Record<string, unknown> & { name: string; field: string };
export type CategoryCreateInput = Record<string, unknown> & { name: string };
export type MaybePromise<T> = T | Promise<T>;

export interface DashboardAccessScope {
  role: string;
  tenantId?: string;
  tenantType?: string;
  userId: string;
}

export type DashboardMenuItem = Pick<Dashboard, 'id' | 'name' | 'category' | 'categoryId' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<Dashboard, 'isGlobal' | 'isGloballyVisible' | 'isSample' | 'settings' | 'tenant'>>;

export interface DashboardListOptions {
  limit?: number;
}

export interface DashboardRuntimeStore {
  listMenu(scope?: DashboardAccessScope, options?: DashboardListOptions): MaybePromise<DashboardMenuItem[]>;
  listDashboards(scope?: DashboardAccessScope, options?: DashboardListOptions): MaybePromise<Dashboard[]>;
  getDashboard(id: string, scope?: DashboardAccessScope): MaybePromise<Dashboard | null>;
  getDashboardMode(id: string, mode: string, scope?: DashboardAccessScope): MaybePromise<Dashboard | null>;
  createDashboard(input: DashboardCreateInput, scope?: DashboardAccessScope): MaybePromise<Dashboard>;
  updateDashboard(id: string, input: DashboardUpdateInput, scope?: DashboardAccessScope): MaybePromise<Dashboard | null>;
  publishDashboard(id: string, scope?: DashboardAccessScope): MaybePromise<Dashboard | null>;
  draftDashboard(id: string, scope?: DashboardAccessScope): MaybePromise<Dashboard | null>;
  deleteDashboard(id: string, scope?: DashboardAccessScope): MaybePromise<boolean>;
  duplicateDashboard(id: string, name?: string, createdBy?: string, scope?: DashboardAccessScope): MaybePromise<Dashboard | null>;
  listElements(dashboardId: string, scope?: DashboardAccessScope): MaybePromise<DashboardElement[] | null>;
  createElement(dashboardId: string, input: Record<string, unknown>, scope?: DashboardAccessScope): MaybePromise<DashboardElement | null>;
  updateElement(elementId: string, input: Record<string, unknown>, scope?: DashboardAccessScope): MaybePromise<DashboardElement | null>;
  deleteElement(elementId: string, scope?: DashboardAccessScope): MaybePromise<boolean>;
  listFilters(dashboardId: string, type?: string, scope?: DashboardAccessScope): MaybePromise<DashboardFilter[] | null>;
  createFilter(dashboardId: string, input: Record<string, unknown>, scope?: DashboardAccessScope): MaybePromise<DashboardFilter | null>;
  updateFilter(dashboardId: string, filterId: string, input: Record<string, unknown>, scope?: DashboardAccessScope): MaybePromise<DashboardFilter | null>;
  replaceFilters(dashboardId: string, inputs: Record<string, unknown>[], scope?: DashboardAccessScope): MaybePromise<DashboardFilter[] | null>;
  deleteFilter(dashboardId: string, filterId: string, scope?: DashboardAccessScope): MaybePromise<boolean>;
  deleteFilters(dashboardId: string, scope?: DashboardAccessScope): MaybePromise<boolean>;
  listCategories(scope?: DashboardAccessScope): MaybePromise<DashboardCategory[]>;
  getCategory(id: string, scope?: DashboardAccessScope): MaybePromise<DashboardCategory | null>;
  createCategory(input: CategoryCreateInput, scope?: DashboardAccessScope): MaybePromise<DashboardCategory>;
  updateCategory(id: string, input: Record<string, unknown>, scope?: DashboardAccessScope): MaybePromise<DashboardCategory | null>;
  deleteCategory(id: string, scope?: DashboardAccessScope): MaybePromise<boolean>;
  reorderCategories(ids: string[], scope?: DashboardAccessScope): MaybePromise<DashboardCategory[] | null>;
  listVersions?(dashboardId: string, scope?: DashboardAccessScope): MaybePromise<DashboardVersion[] | null>;
  createVersion?(dashboardId: string, name: string, options?: { isAutoSave?: boolean }, scope?: DashboardAccessScope): MaybePromise<DashboardVersion | null>;
  getVersion?(versionId: string, scope?: DashboardAccessScope): MaybePromise<DashboardVersion | null>;
  deleteVersion?(versionId: string, scope?: DashboardAccessScope): MaybePromise<boolean>;
  restoreVersion?(dashboardId: string, versionId: string, scope?: DashboardAccessScope): MaybePromise<{ dashboard: Dashboard; restoredFromVersionId: string } | null>;
  compareVersions?(leftVersionId: string, rightVersionId: string, scope?: DashboardAccessScope): MaybePromise<{ leftVersionId: string; rightVersionId: string; differences: Array<Record<string, unknown>> } | null>;
}
