import type { Dashboard } from './types';

export interface DashboardBadge {
  className: string;
  label: string;
}

export interface DashboardSection {
  dashboards: Dashboard[];
  expandedByDefault: boolean;
  id: string;
  label: string;
}

export interface DashboardHomeSelection {
  dashboard: Dashboard;
  label: 'Favorite dashboard' | 'Recently opened' | 'Latest dashboard';
}

export const DEFAULT_DASHBOARD_SECTION_LABEL = 'Default Dashboards';
const FALLBACK_DASHBOARD_SECTION_LABEL = 'Uncategorized';

export function dashboardPath(id: string, canEditDashboard: boolean): string {
  return canEditDashboard ? `/dashboard/${id}/edit` : `/dashboard/${id}`;
}

export function dashboardBadges(dashboard: Dashboard): DashboardBadge[] {
  return [
    ...(dashboard.isSample ? [{ className: 'sample-badge', label: 'Sample' }] : [])
  ];
}

export function isDashboardFavorite(dashboard: Dashboard): boolean {
  return dashboard.settings?.isFavorite === true;
}

export function dashboardWithFavorite(dashboard: Dashboard, isFavorite: boolean): Dashboard {
  return {
    ...dashboard,
    settings: {
      ...(dashboard.settings ?? {}),
      isFavorite
    }
  };
}

export function dashboardTenantLabel(dashboard: Dashboard): string {
  return dashboard.tenant?.name?.trim()
    || dashboard.category?.trim()
    || FALLBACK_DASHBOARD_SECTION_LABEL;
}

export function dashboardSectionLabel(dashboard: Dashboard): string {
  if (isDefaultDashboard(dashboard)) return DEFAULT_DASHBOARD_SECTION_LABEL;
  return dashboard.category?.trim() || dashboardTenantLabel(dashboard);
}

export function defaultDashboardId(dashboards: Dashboard[]): string {
  return dashboards.find(isDefaultDashboard)?.id ?? dashboards[0]?.id ?? '';
}

export function dashboardHomeSelection(dashboards: Dashboard[], recentDashboardId?: string | null): DashboardHomeSelection | null {
  const favorite = latestDashboard(dashboards.filter(isDashboardFavorite));
  if (favorite) return { dashboard: favorite, label: 'Favorite dashboard' };
  const recent = recentDashboardId ? dashboards.find(dashboard => dashboard.id === recentDashboardId) : null;
  if (recent) return { dashboard: recent, label: 'Recently opened' };
  const latest = latestDashboard(dashboards);
  return latest ? { dashboard: latest, label: 'Latest dashboard' } : null;
}

export function favoriteDashboards(dashboards: Dashboard[]): Dashboard[] {
  return [...dashboards].filter(isDashboardFavorite).sort(newestDashboardFirst);
}

export function recentDashboards(dashboards: Dashboard[], recentDashboardIds: string[], limit = 6): Dashboard[] {
  const dashboardsById = new Map(dashboards.map(dashboard => [dashboard.id, dashboard]));
  const visited = recentDashboardIds
    .map(id => dashboardsById.get(id))
    .filter((dashboard): dashboard is Dashboard => Boolean(dashboard));
  const latest = [...dashboards]
    .filter(dashboard => !visited.some(visitedDashboard => visitedDashboard.id === dashboard.id))
    .sort(newestDashboardFirst);
  return [...visited, ...latest].slice(0, limit);
}

export function latestDashboard(dashboards: Dashboard[]): Dashboard | null {
  return dashboards.reduce<Dashboard | null>((latest, dashboard) => {
    if (!latest) return dashboard;
    return dashboardTimestamp(dashboard) > dashboardTimestamp(latest) ? dashboard : latest;
  }, null);
}

export function dashboardTimestamp(dashboard: Dashboard): number {
  const timestamp = Date.parse(dashboard.createdAt ?? dashboard.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newestDashboardFirst(left: Dashboard, right: Dashboard): number {
  return dashboardTimestamp(right) - dashboardTimestamp(left);
}

export function dashboardSectionExpansionDefaults(
  sections: Pick<DashboardSection, 'dashboards' | 'id'>[],
  selectedDashboardId?: string | null
): Record<string, boolean> {
  const selectedSection = sections.find(section =>
    section.dashboards.some(dashboard => dashboard.id === selectedDashboardId)
  );
  return Object.fromEntries(sections.map(section => [
    section.id,
    selectedSection ? section.id === selectedSection.id : sections.length === 1
  ]));
}

export function groupDashboardSections(
  dashboards: Dashboard[],
  selectedDashboardId?: string | null
): DashboardSection[] {
  const sectionsByLabel = new Map<string, Dashboard[]>();
  for (const dashboard of dashboards) {
    const label = dashboardSectionLabel(dashboard);
    sectionsByLabel.set(label, [...(sectionsByLabel.get(label) ?? []), dashboard]);
  }

  const sections = Array.from(sectionsByLabel, ([label, sectionDashboards]) => ({
    dashboards: [...sectionDashboards].sort(dashboardNameFirst),
    expandedByDefault: false,
    id: dashboardSectionId(label),
    label
  })).sort(defaultSectionFirst);
  const expansionDefaults = dashboardSectionExpansionDefaults(sections, selectedDashboardId);
  return sections.map(section => ({
    ...section,
    expandedByDefault: expansionDefaults[section.id] ?? false
  }));
}

export function modelLabel(value: string): string {
  return value.split('_').map(part => {
    if (part.toLowerCase() === 'pos') return 'POS';
    return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
  }).join(' ');
}

function dashboardSectionId(label: string): string {
  return label.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'dashboard-section';
}

function defaultSectionFirst(
  first: DashboardSection,
  second: DashboardSection
): number {
  if (first.label === DEFAULT_DASHBOARD_SECTION_LABEL) return -1;
  if (second.label === DEFAULT_DASHBOARD_SECTION_LABEL) return 1;
  return serialLabelCompare(first.label, second.label);
}

function dashboardNameFirst(left: Dashboard, right: Dashboard): number {
  return serialLabelCompare(left.name, right.name);
}

function serialLabelCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function isDefaultDashboard(dashboard: Dashboard): boolean {
  if (dashboard.isGlobal || dashboard.isGloballyVisible) return false;
  if (dashboard.categoryId === null || dashboard.categoryId === '') return true;
  if (dashboard.categoryId !== undefined) return false;
  return !dashboard.category?.trim();
}
