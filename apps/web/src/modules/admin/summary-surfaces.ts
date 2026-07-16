import type { AdminSummarySurface } from './types';

export const ADMIN_SUMMARY_SURFACES: Record<string, AdminSummarySurface> = {
  dashboard: overviewSurface('dashboard', 'Admin Dashboard'),
  overview: overviewSurface('overview', 'Admin Overview'),
  'sql-query-editor': {
    id: 'sql-query-editor',
    kind: 'summary',
    eyebrow: 'Data Tools',
    title: 'SQL Query Editor',
    description: 'Inspect available data sources before executing SQL through the dedicated SQL module.',
    requests: [{ id: 'sources', title: 'Queryable Sources', path: '/api/data-sources' }]
  },
  settings: {
    id: 'settings',
    kind: 'summary',
    eyebrow: 'Administration',
    title: 'Settings',
    description: 'Review local instance settings and service health.',
    requests: [
      { id: 'health', title: 'API Health', path: '/api/health' },
      { id: 'routes', title: 'Product Routes', path: '/api/product/routes' }
    ]
  }
};

function overviewSurface(id: string, title: string): AdminSummarySurface {
  return {
    id,
    kind: 'summary',
    eyebrow: 'Administration',
    title,
    description: 'Overview of dashboards, data sources, Analyzer, MCP, and local service health.',
    requests: [
      { id: 'health', title: 'API Health', path: '/api/health' },
      { id: 'dashboards', title: 'Dashboards', path: '/api/dashboards' },
      { id: 'data-sources', title: 'Data Sources', path: '/api/data-sources' },
      { id: 'routes', title: 'Product Routes', path: '/api/product/routes' }
    ]
  };
}
