import type { DashboardCategory, DashboardCategoryDashboard, DashboardCategoryForm } from './types';

type CategoryFallback = Partial<DashboardCategory> & Partial<DashboardCategoryForm>;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

export function normalizeDashboardCategories(categoryPayload: unknown, dashboardPayload: unknown): DashboardCategory[] {
  const dashboardsByCategory = groupDashboards(extractDashboardArray(dashboardPayload));
  return extractCategoryArray(categoryPayload)
    .map(value => normalizeDashboardCategory(value))
    .filter(isPresent)
    .map(category => ({
      ...category,
      dashboards: dashboardsByCategory.get(category.name.toLowerCase()) ?? category.dashboards
    }))
    .sort(compareCategories);
}

export function normalizeDashboardCategoryOrThrow(payload: unknown, fallback?: CategoryFallback): DashboardCategory {
  const category = normalizeDashboardCategory(unwrapCategoryPayload(payload), fallback);
  if (!category) throw new Error('Dashboard category response was missing required fields.');
  return category;
}

export function buildDashboardCategoryPayload(form: DashboardCategoryForm): Record<string, unknown> {
  return {
    color: normalizedColor(form.color, '#64748b'),
    description: form.description.trim(),
    icon: form.icon.trim() || 'LayoutDashboard',
    isActive: form.isActive,
    name: form.name.trim(),
    sortOrder: Number.isFinite(form.sortOrder) ? form.sortOrder : 0
  };
}

function normalizeDashboardCategory(value: unknown, fallback?: CategoryFallback): DashboardCategory | null {
  if (!isRecord(value) && !fallback) return null;
  const source = isRecord(value) ? value : {};
  const id = readString(source.id ?? source.categoryId) ?? fallback?.id ?? readString(source.name) ?? '';
  const name = readString(source.name) ?? fallback?.name ?? '';
  if (!id || !name) return null;
  return {
    id,
    name,
    color: readColor(source.color, fallback?.color),
    description: readString(source.description) ?? fallback?.description ?? '',
    icon: readString(source.icon) ?? fallback?.icon ?? 'LayoutDashboard',
    sortOrder: readNumber(source.sortOrder) ?? fallback?.sortOrder ?? 0,
    isActive: readActive(source, fallback),
    dashboards: readDashboards(source.dashboards ?? fallback?.dashboards),
    createdAt: readString(source.createdAt) ?? fallback?.createdAt ?? '',
    updatedAt: readString(source.updatedAt) ?? fallback?.updatedAt ?? ''
  };
}

function extractCategoryArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of ['categories', 'dashboardCategories', 'items', 'records', 'rows', 'data']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
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

function unwrapCategoryPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  return payload.category ?? payload.dashboardCategory ?? payload.data ?? payload;
}

function groupDashboards(payload: unknown[]): Map<string, DashboardCategoryDashboard[]> {
  const groups = new Map<string, DashboardCategoryDashboard[]>();
  for (const item of payload) {
    const dashboard = normalizeDashboard(item);
    if (!dashboard.category) continue;
    const key = dashboard.category.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), dashboard]);
  }
  return groups;
}

function normalizeDashboard(value: unknown): DashboardCategoryDashboard {
  if (!isRecord(value)) return { category: '', id: '', name: 'Untitled Dashboard', status: 'active' };
  const name = readString(value.name) ?? 'Untitled Dashboard';
  return {
    category: readCategoryName(value.category),
    id: readString(value.id ?? value.dashboardId) ?? name,
    name,
    status: readString(value.status) ?? 'active'
  };
}

function readDashboards(value: unknown): DashboardCategoryDashboard[] {
  return Array.isArray(value) ? value.map(normalizeDashboard).filter(dashboard => Boolean(dashboard.id)) : [];
}

function readCategoryName(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (isRecord(value)) return readString(value.name) ?? '';
  return '';
}

function readActive(source: Record<string, unknown>, fallback?: CategoryFallback): boolean {
  const direct = readBoolean(source.isActive ?? source.active);
  if (direct !== null) return direct;
  const status = readString(source.status)?.toLowerCase();
  if (status) return !['archived', 'disabled', 'inactive'].includes(status);
  return fallback?.isActive ?? true;
}

function readColor(value: unknown, fallback?: string): string {
  return normalizedColor(readString(value) ?? fallback ?? '', '#64748b');
}

function normalizedColor(value: string, defaultColor: string): string {
  const color = value.trim();
  return HEX_COLOR_PATTERN.test(color) ? color : defaultColor;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['active', 'enabled', 'true'].includes(normalized)) return true;
  if (['disabled', 'false', 'inactive'].includes(normalized)) return false;
  return null;
}

function compareCategories(left: DashboardCategory, right: DashboardCategory): number {
  const order = left.sortOrder - right.sortOrder;
  return order === 0 ? left.name.localeCompare(right.name) : order;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
