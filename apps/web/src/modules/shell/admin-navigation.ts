import type { ShellNavSection } from './shell-navigation';

const ownerRoles = [
  'SINGLE_TENANT_OWNER',
  'SINGLE_TENANT_ADMIN'
];
const dataRoles = [...ownerRoles, 'SINGLE_TENANT_DEVELOPER'];

export const adminSections: ShellNavSection[] = [
  {
    title: 'Overview',
    links: [
      { path: '/admin/dashboard', label: 'Overview', roles: dataRoles }
    ]
  },
  {
    title: 'Dashboards',
    links: [
      { path: '/admin/dashboards', label: 'Dashboard Management', roles: dataRoles },
      { path: '/admin/dashboard-categories', label: 'Dashboard Categories', roles: dataRoles }
    ]
  },
  {
    title: 'Data',
    links: [
      { path: '/admin/view-data-sources', label: 'Data Sources', roles: dataRoles },
      { path: '/admin/data-sources', label: 'Data Source Management', roles: dataRoles },
      { path: '/admin/data-dictionary', label: 'Data Dictionary', roles: dataRoles },
      { path: '/admin/sql-query-editor', label: 'SQL Query Editor', roles: dataRoles },
      { path: '/admin/custom-data-sources', label: 'Custom Data Sources', roles: dataRoles }
    ]
  },
  {
    title: 'AI & MCP',
    links: [
      { path: '/admin/ai-api-key-management', label: 'AI API Key Management', roles: ownerRoles },
      { path: '/admin/mcp-access', label: 'MCP Access', roles: ownerRoles }
    ]
  },
  {
    title: 'Email',
    links: [
      { path: '/admin/smtp-configuration', label: 'SMTP Configuration', roles: ownerRoles }
    ]
  }
];
