export interface ProductRoute {
  path: string;
  label: string;
  group: 'workspace' | 'dashboard' | 'data-tools' | 'admin' | 'account' | 'public';
}

export const activeProductRoutes: ProductRoute[] = [
  { path: '/home', label: 'Home', group: 'workspace' },
  { path: '/ai-analyzer', label: 'AI Analyzer', group: 'workspace' },
  { path: '/dashboard', label: 'Dashboards', group: 'dashboard' },
  { path: '/dashboard/create', label: 'Create Dashboard', group: 'dashboard' },
  { path: '/templates', label: 'Templates', group: 'workspace' },
  { path: '/data-dictionary', label: 'Data Dictionary', group: 'data-tools' },
  { path: '/sql-editor', label: 'SQL Editor', group: 'data-tools' },
  { path: '/admin/dashboard', label: 'Admin Dashboard', group: 'admin' },
  { path: '/admin/mcp-access', label: 'MCP Access', group: 'admin' },
  { path: '/admin/view-data-sources', label: 'Admin Data Sources', group: 'admin' }
];
