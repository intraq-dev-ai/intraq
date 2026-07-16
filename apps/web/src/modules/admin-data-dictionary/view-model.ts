import type {
  AdminDictionaryMetric,
  AdminDictionaryReadinessFilter,
  AdminDictionarySource,
  AdminDictionaryTable
} from './types';

export interface AdminDictionaryTableRow {
  category: string;
  dataSourceDescription: string;
  dataSourceId: string;
  dataSourceName: string;
  fieldCount: number;
  fields: AdminDictionaryTable['fields'];
  hasDictionary: boolean;
  id: string;
  isDataModel: boolean;
  issues: string[];
  lastUpdated?: string;
  name: string;
  physicalName: string;
  recordCount?: number;
  sourceStatus: string;
  sourceType: string;
  table: AdminDictionaryTable;
  tableDescription: string;
  tableId: string;
}

export interface AdminDictionaryDialogTable {
  category: string;
  columnCount: number;
  description: string;
  displayName: string;
  hasIssues: boolean;
  id: string;
  issues: string[];
  lastUpdated?: string;
  physicalName: string;
  recordCount?: number;
  rowId: string;
}

export function buildAdminDictionaryTableRows(sources: AdminDictionarySource[]): AdminDictionaryTableRow[] {
  return sources
    .flatMap(source => source.tables.map(table => buildRow(source, table)))
    .sort((left, right) => `${left.dataSourceName}:${left.name}`.localeCompare(`${right.dataSourceName}:${right.name}`));
}

export function filterAdminDictionaryRows(
  rows: AdminDictionaryTableRow[],
  query: string,
  sourceId: string,
  readiness: AdminDictionaryReadinessFilter
): AdminDictionaryTableRow[] {
  const normalized = query.trim().toLowerCase();
  return rows.filter(row => {
    if (sourceId && row.dataSourceId !== sourceId) return false;
    if (readiness === 'configured' && !row.hasDictionary) return false;
    if (readiness === 'missing' && row.hasDictionary) return false;
    if (!normalized) return true;
    return rowSearchText(row).includes(normalized);
  });
}

export function buildAdminDictionaryMetrics(
  sources: AdminDictionarySource[],
  rows: AdminDictionaryTableRow[]
): AdminDictionaryMetric[] {
  const totalFields = rows.reduce((total, row) => total + row.fieldCount, 0);
  const documentedFields = rows.reduce((total, row) => total + documentedFieldCount(row.table), 0);
  const coverage = totalFields === 0 ? 0 : Math.round((documentedFields / totalFields) * 100);
  return [
    { label: 'Data Sources', value: String(sources.length), detail: `${connectedSourceCount(sources)} connected` },
    { label: 'Dictionary Tables', value: String(rows.length), detail: `${dataModelCount(rows)} AI-ready models` },
    { label: 'Fields', value: String(totalFields), detail: `${documentedFields} documented` },
    { label: 'Coverage', value: `${coverage}%`, detail: 'documented fields' }
  ];
}

export function buildAdminDictionaryDialogTables(rows: AdminDictionaryTableRow[]): AdminDictionaryDialogTable[] {
  return rows.map(row => {
    const issues = buildTableIssues(row);
    const table: AdminDictionaryDialogTable = {
      id: row.tableId,
      rowId: row.id,
      displayName: row.name,
      physicalName: row.physicalName,
      category: row.category,
      description: row.tableDescription || row.dataSourceDescription || 'No table description available.',
      columnCount: row.fieldCount,
      hasIssues: issues.length > 0,
      issues
    };
    if (row.recordCount !== undefined) table.recordCount = row.recordCount;
    if (row.lastUpdated) table.lastUpdated = row.lastUpdated;
    return table;
  }).sort((left, right) => {
    if (left.hasIssues !== right.hasIssues) return left.hasIssues ? 1 : -1;
    return left.displayName.localeCompare(right.displayName);
  });
}

export function filterAdminDictionaryDialogTables(
  tables: AdminDictionaryDialogTable[],
  query: string,
  categories: string[]
): AdminDictionaryDialogTable[] {
  const normalized = query.trim().toLowerCase();
  return tables.filter(table => {
    if (categories.length > 0 && !categories.includes(table.category)) return false;
    if (!normalized) return true;
    return [
      table.displayName,
      table.physicalName,
      table.description,
      table.category,
      ...table.issues
    ].join(' ').toLowerCase().includes(normalized);
  });
}

export function tableDisplayName(table: AdminDictionaryTable): string {
  return table.businessName ?? table.name;
}

export function sourceDisplayType(type: string): string {
  return type.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function buildRow(source: AdminDictionarySource, table: AdminDictionaryTable): AdminDictionaryTableRow {
  const row: AdminDictionaryTableRow = {
    id: `${source.id}:${table.id}`,
    tableId: table.id,
    name: tableDisplayName(table),
    physicalName: table.name,
    tableDescription: table.dictionaryDescription ?? table.description,
    dataSourceId: source.id,
    dataSourceName: source.name,
    dataSourceDescription: source.description,
    category: table.category ?? source.name,
    sourceType: sourceDisplayType(source.type),
    sourceStatus: source.status,
    fields: table.fields,
    fieldCount: table.fields.length,
    table,
    isDataModel: table.isDataModel || table.isSelected,
    hasDictionary: hasTableDictionary(table),
    issues: table.issues ?? []
  };
  if (table.recordCount !== undefined) row.recordCount = table.recordCount;
  if (table.lastUpdated) row.lastUpdated = table.lastUpdated;
  return row;
}

function rowSearchText(row: AdminDictionaryTableRow): string {
  return [
    row.name,
    row.physicalName,
    row.tableDescription,
    row.dataSourceName,
    row.dataSourceDescription,
    row.sourceType,
    row.sourceStatus,
    ...row.fields.map(field => `${field.name} ${field.type} ${field.description} ${field.dictionaryDescription}`)
  ].join(' ').toLowerCase();
}

function hasTableDictionary(table: AdminDictionaryTable): boolean {
  return Boolean(
    table.businessName ||
    table.dictionaryDescription ||
    table.description ||
    table.fields.some(field => field.dictionaryDescription || field.description)
  );
}

function documentedFieldCount(table: AdminDictionaryTable): number {
  return table.fields.filter(field => field.dictionaryDescription || field.description).length;
}

function buildTableIssues(row: AdminDictionaryTableRow): string[] {
  const issues = [...row.issues];
  if (!row.hasDictionary) issues.push('Dictionary definition missing');
  if (row.fieldCount === 0) issues.push('No fields available');
  return issues;
}

function connectedSourceCount(sources: AdminDictionarySource[]): number {
  return sources.filter(source => ['active', 'connected', 'ready', 'published'].includes(source.status.toLowerCase())).length;
}

function dataModelCount(rows: AdminDictionaryTableRow[]): number {
  return rows.filter(row => row.isDataModel).length;
}
