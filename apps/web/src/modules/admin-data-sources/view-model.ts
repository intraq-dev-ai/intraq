import type {
  AdminDataSource,
  AdminDataSourceMetric,
  AdminDataSourceRouteVariant,
  AdminDataSourceTable
} from './types';

export type AdminConnectionTypeId = 'sample' | 'database' | 's3' | 'api' | 'flatfile';

export interface AdminConnectionType {
  abbreviation: string;
  color: string;
  id: AdminConnectionTypeId;
  name: string;
}

export interface AdminDictionaryTableRow {
  dataSourceId: string;
  dataSourceName: string;
  dashboardCount: number;
  fields: AdminDataSourceTable['fields'];
  hasDictionary: boolean;
  id: string;
  isDataModel: boolean;
  name: string;
  table: AdminDataSourceTable;
}

const DATABASE_TYPES = new Set([
  'postgres',
  'mysql',
  'oracle',
  'sqlserver',
  'snowflake',
  'databricks',
  'clickhouse',
  'athena',
  'dynamodb',
  'bigquery',
  'mongodb',
  'custom_query'
]);

export const ADMIN_CONNECTION_TYPES: AdminConnectionType[] = [
  { id: 'sample', name: 'Sample Data', abbreviation: 'SMPL', color: '#8b5cf6' },
  { id: 'database', name: 'Database', abbreviation: 'DB', color: '#3b82f6' },
  { id: 's3', name: 'S3', abbreviation: 'S3', color: '#ff9500' },
  { id: 'api', name: 'API', abbreviation: 'API', color: '#10b981' },
  { id: 'flatfile', name: 'Flat File (CSV, Excel)', abbreviation: 'FILE', color: '#7c3aed' }
];

export function filterDataSourcesForVariant(
  sources: AdminDataSource[],
  _variant: AdminDataSourceRouteVariant
): AdminDataSource[] {
  return sources;
}

export function searchDataSources(sources: AdminDataSource[], query: string): AdminDataSource[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return sources;
  return sources.filter(source => sourceSearchText(source).includes(normalized));
}

export function buildDictionaryTableRows(sources: AdminDataSource[]): AdminDictionaryTableRow[] {
  return sources.flatMap(source => source.tables.map(table => ({
    id: `${source.id}:${table.id}`,
    name: tableDisplayName(table),
    dataSourceId: source.id,
    dataSourceName: source.name,
    fields: table.fields,
    table,
    isDataModel: table.isDataModel || table.isSelected,
    dashboardCount: table.dashboardCount ?? (source.dashboardVisible ? 1 : 0),
    hasDictionary: hasTableDictionary(table)
  })));
}

export function filterDictionaryTableRows(
  rows: AdminDictionaryTableRow[],
  query: string,
  dataSourceId: string
): AdminDictionaryTableRow[] {
  const normalized = query.trim().toLowerCase();
  return rows.filter(row => {
    const matchesSource = !dataSourceId || row.dataSourceId === dataSourceId;
    if (!matchesSource) return false;
    if (!normalized) return true;
    return [
      row.name,
      row.table.name,
      row.dataSourceName,
      row.table.description,
      ...row.fields.map(field => `${field.name} ${field.type} ${field.description} ${field.dictionaryDescription}`)
    ].join(' ').toLowerCase().includes(normalized);
  });
}

export function countSourcesByConnectionType(
  sources: AdminDataSource[],
  typeId: AdminConnectionTypeId
): number {
  return sources.filter(source => sourceConnectionTypeId(source) === typeId).length;
}

export function filterSourcesByConnectionType(
  sources: AdminDataSource[],
  typeId: AdminConnectionTypeId,
  query: string
): AdminDataSource[] {
  const normalized = query.trim().toLowerCase();
  return sources.filter(source => {
    if (sourceConnectionTypeId(source) !== typeId) return false;
    return !normalized || sourceSearchText(source).includes(normalized);
  });
}

export function sourceConnectionTypeId(source: AdminDataSource): AdminConnectionTypeId {
  const normalized = source.type.toLowerCase();
  if (source.isSample || normalized === 'sample') return 'sample';
  if (normalized === 's3') return 's3';
  if (normalized === 'api') return 'api';
  if (normalized === 'flatfile' || normalized === 'file') return 'flatfile';
  if (DATABASE_TYPES.has(normalized)) return 'database';
  return 'database';
}

export function sourceTypeForConnectionType(typeId: AdminConnectionTypeId): string {
  if (typeId === 'database') return 'postgres';
  if (typeId === 'flatfile') return 'file';
  return typeId;
}

export function buildDataSourceMetrics(sources: AdminDataSource[]): AdminDataSourceMetric[] {
  const connected = sources.filter(source => source.status.toLowerCase() === 'connected').length;
  const tables = sources.flatMap(source => source.tables);
  const fieldCounts = countDictionaryFields(tables);
  const coverage = fieldCounts.total === 0 ? 0 : Math.round((fieldCounts.documented / fieldCounts.total) * 100);
  return [
    { label: 'Data Sources', value: String(sources.length), detail: `${connected} connected` },
    { label: 'Selected Models', value: String(tables.length), detail: `${dataModelCount(tables)} AI-ready models` },
    { label: 'Dictionary Coverage', value: `${coverage}%`, detail: `${fieldCounts.documented} of ${fieldCounts.total} fields` },
    { label: 'Dashboard Visible', value: String(sources.filter(source => source.dashboardVisible).length), detail: 'Available to Analyzer and dashboards' }
  ];
}

export function sourceDisplayType(source: AdminDataSource): string {
  return source.type.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function tableDisplayName(table: AdminDataSourceTable): string {
  return table.businessName || toDisplayLabel(table.name);
}

export function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (['active', 'connected', 'ready', 'published'].includes(normalized)) return 'admin-badge admin-badge-success';
  if (['draft', 'pending', 'running', 'queued', 'unknown'].includes(normalized)) return 'admin-badge admin-badge-warning';
  if (['inactive', 'suspended', 'failed', 'error', 'rejected'].includes(normalized)) return 'admin-badge admin-badge-danger';
  return 'admin-badge';
}

function sourceSearchText(source: AdminDataSource): string {
  return [
    source.name,
    source.type,
    source.status,
    source.sourceType,
    source.description,
    ...source.tables.map(table => table.name)
  ].join(' ').toLowerCase();
}

function hasTableDictionary(table: AdminDataSourceTable): boolean {
  return Boolean(
    table.businessName ||
    table.dictionaryDescription ||
    table.description ||
    table.fields.some(field => field.dictionaryDescription || field.description)
  );
}

function countDictionaryFields(tables: AdminDataSourceTable[]): { documented: number; total: number } {
  const fields = tables.flatMap(table => table.fields);
  return {
    documented: fields.filter(field => field.dictionaryDescription || field.description).length,
    total: fields.length
  };
}

function dataModelCount(tables: AdminDataSourceTable[]): number {
  return tables.filter(table => table.isDataModel || table.isSelected).length;
}

function toDisplayLabel(value: string): string {
  const cleaned = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return cleaned
    ? cleaned.replace(/\b\w/g, letter => letter.toUpperCase())
    : value;
}
