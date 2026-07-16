import type {
  AdminDashboard,
  DashboardCreator,
  DashboardFilterState,
  DashboardSortDirection,
  DashboardSortField,
  DashboardStats,
  DashboardType
} from './types';

export function normalizeDashboards(payload: unknown): AdminDashboard[] {
  return extractDashboardArray(payload).map(normalizeDashboard).filter(isPresent);
}

export function normalizeDashboardOrThrow(payload: unknown): AdminDashboard {
  const dashboard = normalizeDashboard(unwrapDashboardPayload(payload));
  if (!dashboard) throw new Error('Dashboard response was missing required fields.');
  return dashboard;
}

export function dashboardTypeLabel(dashboard: AdminDashboard): string {
  if (dashboard.type === 'sample') return 'Sample';
  if (dashboard.type === 'global') return 'Global';
  return 'Tenant';
}

export function creatorName(dashboard: AdminDashboard): string {
  const creator = dashboard.creator;
  const fullName = [creator?.firstName, creator?.lastName].filter(Boolean).join(' ').trim();
  return creator?.name ?? (fullName || dashboard.createdBy || creator?.email || 'Unknown');
}

export function statusLabel(status: string): string {
  const normalized = status.toLowerCase() === 'published' ? 'active' : status.toLowerCase();
  return normalized ? normalized[0]?.toUpperCase() + normalized.slice(1) : 'Active';
}

export function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'draft') return 'draft';
  if (normalized === 'archived') return 'archived';
  return 'active';
}

export function formatDashboardDate(value: string): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffDays = Math.max(1, Math.ceil(Math.abs(Date.now() - date.getTime()) / 86_400_000));
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
  return date.toLocaleDateString();
}

export function buildDashboardStats(dashboards: AdminDashboard[]): DashboardStats {
  const weekAgo = Date.now() - 7 * 86_400_000;
  return {
    activeThisWeek: dashboards.filter(dashboard => new Date(dashboard.updatedAt).getTime() > weekAgo).length,
    categories: new Set(dashboards.map(dashboard => dashboard.category).filter(Boolean)).size,
    sharedDashboards: dashboards.filter(dashboard => dashboard.isShared).length,
    totalDashboards: dashboards.length,
    totalViews: dashboards.reduce((total, dashboard) => total + dashboard.views, 0)
  };
}

export function categorySummary(dashboards: AdminDashboard[]): Array<{ category: string; count: number; visibleCount: number }> {
  const summary = new Map<string, { category: string; count: number; visibleCount: number }>();
  for (const dashboard of dashboards) {
    const current = summary.get(dashboard.category) ?? { category: dashboard.category, count: 0, visibleCount: 0 };
    current.count += 1;
    if (dashboard.isShared || dashboard.isGloballyVisible) current.visibleCount += 1;
    summary.set(dashboard.category, current);
  }
  return [...summary.values()].sort((left, right) => left.category.localeCompare(right.category));
}

export function visibilitySummary(dashboard: AdminDashboard): string {
  const labels: string[] = [];
  if (dashboard.isGloballyVisible) labels.push('Global');
  if (dashboard.isPublic) labels.push('Public');
  return labels.length > 0 ? labels.join(', ') : 'Private';
}

export function canManageDashboardVisibility(dashboard: AdminDashboard): boolean {
  return dashboard.isSample;
}

export function filterDashboards(dashboards: AdminDashboard[], filters: DashboardFilterState): AdminDashboard[] {
  const query = filters.searchQuery.trim().toLowerCase();
  return dashboards.filter(dashboard => {
    if (query && !dashboardSearchText(dashboard).includes(query)) return false;
    if (filters.category && dashboard.category !== filters.category) return false;
    if (filters.type && dashboard.type !== filters.type) return false;
    if (filters.status && dashboard.status !== filters.status) return false;
    return true;
  });
}

export function sortDashboards(
  dashboards: AdminDashboard[],
  field: DashboardSortField,
  direction: DashboardSortDirection
): AdminDashboard[] {
  const sorted = [...dashboards].sort((left, right) => compareDashboardValues(sortValue(left, field), sortValue(right, field)));
  return direction === 'desc' ? sorted.reverse() : sorted;
}

function normalizeDashboard(value: unknown): AdminDashboard | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id) ?? readString(value.dashboardId);
  if (!id) return null;
  const elements = Array.isArray(value.elements) ? value.elements : [];
  const isSample = readBoolean(value.isSample) || readString(value.type)?.toLowerCase() === 'sample';
  const isGlobal = readBoolean(value.isGlobal) || readString(value.type)?.toLowerCase() === 'global';
  const isPublic = readBoolean(value.isPublic) || readBoolean(value.public);
  const isGloballyVisible = readBoolean(value.isGloballyVisible) || isGlobal;
  const status = normalizeStatus(readString(value.status));
  const creator = readCreator(value.creator ?? value.createdByUser);
  const dashboard: AdminDashboard = {
    id,
    name: readString(value.name) ?? 'Untitled Dashboard',
    description: readString(value.description) ?? '',
    category: readCategory(value.category),
    status,
    type: readDashboardType(isSample, isGlobal),
    createdAt: readString(value.createdAt) ?? '',
    updatedAt: readString(value.updatedAt) ?? readString(value.createdAt) ?? '',
    createdBy: readString(value.createdBy) ?? readString(value.owner) ?? '',
    tenantName: readTenantName(value.tenant),
    views: readNumber(value.views ?? value.viewCount ?? value.usageCount ?? value.totalViews),
    charts: readNumber(value.charts ?? value.chartCount) || elements.length,
    elements,
    isGlobal,
    isGloballyVisible,
    isPublic,
    isSample,
    isShared: readBoolean(value.isShared) || isPublic || isGloballyVisible,
    settings: readRecord(value.settings)
  };
  if (creator) dashboard.creator = creator;
  return dashboard;
}

function extractDashboardArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of ['dashboards', 'items', 'records', 'rows', 'data']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function unwrapDashboardPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  return payload.dashboard ?? payload.data ?? payload;
}

function dashboardSearchText(dashboard: AdminDashboard): string {
  return [
    dashboard.name,
    dashboard.description,
    dashboard.category,
    dashboardTypeLabel(dashboard),
    creatorName(dashboard),
    dashboard.status,
    visibilitySummary(dashboard)
  ].join(' ').toLowerCase();
}

function sortValue(dashboard: AdminDashboard, field: DashboardSortField): string | number {
  if (field === 'charts') return dashboard.charts;
  if (field === 'createdBy') return creatorName(dashboard);
  if (field === 'views') return dashboard.views;
  return dashboard[field];
}

function compareDashboardValues(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function normalizeStatus(value: string | null): string {
  if (!value) return 'active';
  const normalized = value.toLowerCase();
  return normalized === 'published' ? 'active' : normalized;
}

function readDashboardType(isSample: boolean, isGlobal: boolean): DashboardType {
  if (isSample) return 'sample';
  if (isGlobal) return 'global';
  return 'tenant';
}

function readCategory(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isRecord(value)) return readString(value.name) ?? 'Uncategorized';
  return 'Uncategorized';
}

function readCreator(value: unknown): DashboardCreator | null {
  if (!isRecord(value)) return null;
  const creator: DashboardCreator = {};
  const email = readString(value.email);
  const firstName = readString(value.firstName);
  const lastName = readString(value.lastName);
  const name = readString(value.name);
  if (email) creator.email = email;
  if (firstName) creator.firstName = firstName;
  if (lastName) creator.lastName = lastName;
  if (name) creator.name = name;
  return Object.keys(creator).length ? creator : null;
}

function readTenantName(value: unknown): string {
  if (!isRecord(value)) return '';
  return readString(value.name) ?? '';
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
