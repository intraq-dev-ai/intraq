import type { AdminDataSourceRouteVariant } from './types';

export const ADMIN_DATA_SOURCE_ROUTE_FAMILY = [
  '/admin/data-sources',
  '/admin/view-data-sources'
] as const;

export interface AdminDataSourceRouteConfig {
  canManage: boolean;
  description: string;
  path: typeof ADMIN_DATA_SOURCE_ROUTE_FAMILY[number];
  primaryActionLabel: string;
  tableLabel: string;
  title: string;
}

export const ADMIN_DATA_SOURCE_ROUTE_CONFIGS: Record<AdminDataSourceRouteVariant, AdminDataSourceRouteConfig> = {
  management: {
    canManage: true,
    description: 'Manage and configure your data source connections',
    path: '/admin/data-sources',
    primaryActionLabel: 'Add New',
    tableLabel: 'Data Source Management records',
    title: 'Data Source Management'
  },
  viewer: {
    canManage: false,
    description: 'Browse all data models that power your dashboards and configure the Data Dictionary to make AI smarter',
    path: '/admin/view-data-sources',
    primaryActionLabel: 'Bulk Upload Dictionary',
    tableLabel: 'Data Models Dictionary tables',
    title: 'Data Models Dictionary'
  }
};

export function resolveAdminDataSourceVariantFromPath(path: string): AdminDataSourceRouteVariant {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/admin/view-data-sources') return 'viewer';
  return 'management';
}
