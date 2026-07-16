import type { AdminColumn, AdminField, AdminOption, AdminRecord, AdminResourceSurface } from './types';

const statusOptions: AdminOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Draft', value: 'draft' }
];

const statusField: AdminField = { key: 'status', label: 'Status', type: 'select', options: statusOptions, defaultValue: 'active' };
const nameField: AdminField = { key: 'name', label: 'Name', required: true };
const baseColumns: AdminColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status', type: 'status' }
];

export const ADMIN_RESOURCE_SURFACES: Record<string, AdminResourceSurface> = {
  dashboards: resource('dashboards', 'Dashboards', 'Dashboards', '/api/dashboards', [
    ...baseColumns,
    { key: 'category', label: 'Category' },
    { key: 'updatedAt', label: 'Updated', type: 'date' }
  ], [nameField, statusField, { key: 'category', label: 'Category', defaultValue: 'operations' }]),
  'dashboard-categories': resource('dashboard-categories', 'Dashboards', 'Dashboard Categories', '/api/dashboard-categories', [
    { key: 'name', label: 'Name' },
    { key: 'sortOrder', label: 'Sort order', type: 'number' }
  ], [nameField, { key: 'sortOrder', label: 'Sort order', type: 'number', defaultValue: 1 }]),
  'view-data-sources': dataSourceSurface('view-data-sources', 'View Data Sources', {
    canCreate: false,
    canEdit: false,
    canDelete: false,
    actions: []
  }),
  'data-sources': dataSourceSurface('data-sources', 'Data Sources'),
  'custom-data-sources': resource('custom-data-sources', 'Data Tools', 'Custom Data Sources', '/api/data-sources/custom-query', [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'baseDataSourceId', label: 'Base data source' },
    { key: 'query', label: 'SQL query' }
  ], [
    nameField,
    { key: 'baseDataSourceId', label: 'Base data source ID', defaultValue: '' },
    { key: 'query', label: 'SQL query', type: 'textarea', required: true, defaultValue: 'select 1 as sample_value' }
  ], [
    {
      id: 'duplicate',
      label: 'Duplicate query',
      method: 'POST',
      path: '/api/data-sources/custom-query',
      payload: duplicateCustomQueryPayload
    }
  ], {
    listKey: 'dataSources',
    canCreate: false,
    description: 'Manage saved SQL queries as reusable data sources.',
    createLabel: 'Create query',
    createButtonLabel: 'Save query',
    editButtonLabel: 'Update query'
  }),
  'smtp-configuration': resource('smtp-configuration', 'Email', 'SMTP Configuration', '/api/smtp-config', [
    { key: 'name', label: 'Name' },
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port', type: 'number' },
    { key: 'username', label: 'Username' },
    { key: 'testStatus', label: 'Test status', type: 'status' },
    { key: 'isDefault', label: 'Default', type: 'boolean' }
  ], [
    nameField,
    { key: 'host', label: 'Host', defaultValue: 'smtp.example.com' },
    { key: 'port', label: 'Port', type: 'number', defaultValue: 587 },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'fromName', label: 'From name', defaultValue: 'intraQ' },
    { key: 'fromEmail', label: 'From email', defaultValue: 'notifications@example.com' },
    { key: 'replyToEmail', label: 'Reply-to email', defaultValue: 'support@example.com' },
    { key: 'secure', label: 'Use SSL', type: 'checkbox', defaultValue: false },
    { key: 'isDefault', label: 'Default', type: 'checkbox', defaultValue: false }
  ], [
    { id: 'test', label: 'Test SMTP', method: 'POST', path: record => `/api/smtp-config/${id(record)}/test`, payload: {} },
    { id: 'default', label: 'Set default SMTP', method: 'POST', path: record => `/api/smtp-config/${id(record)}/set-default`, payload: {} }
  ])
};

function resource(
  idValue: string,
  eyebrow: string,
  title: string,
  path: string,
  columns: AdminColumn[],
  createFields: AdminField[],
  actions: AdminResourceSurface['actions'] = [],
  extra: Partial<AdminResourceSurface> = {}
): AdminResourceSurface {
  return {
    id: idValue,
    kind: 'resource',
    eyebrow,
    title,
    description: `Manage ${title.toLowerCase()} through the admin endpoint.`,
    path,
    columns,
    createFields,
    editFields: createFields,
    actions,
    ...extra
  };
}

function dataSourceSurface(idValue: string, title: string, extra: Partial<AdminResourceSurface> = {}): AdminResourceSurface {
  return resource(idValue, 'Data Tools', title, '/api/data-sources', [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'sourceType', label: 'Source type' }
  ], [nameField, { key: 'type', label: 'Type', defaultValue: 'sample' }], [
    { id: 'test', label: 'Test connection', method: 'POST', path: '/api/data-sources/test-connection', payload: { type: 'sample' } }
  ], extra);
}

function id(record: AdminRecord): string {
  return encodeURIComponent(String(record.id ?? ''));
}

function duplicateCustomQueryPayload(record: AdminRecord): Record<string, unknown> {
  const baseDataSourceId = String(record.baseDataSourceId ?? readConfigValue(record, 'baseDataSourceId') ?? '').trim();
  return {
    name: `${String(record.name ?? 'Saved Query')} Copy`,
    ...(baseDataSourceId ? { baseDataSourceId } : {}),
    query: String(record.query ?? readConfigValue(record, 'query') ?? 'select 1 as sample_value')
  };
}

function readConfigValue(record: AdminRecord, key: string): unknown {
  const config = record.config;
  return typeof config === 'object' && config !== null && !Array.isArray(config)
    ? (config as Record<string, unknown>)[key]
    : undefined;
}
