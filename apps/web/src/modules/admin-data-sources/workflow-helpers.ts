import type {
  AdminDataSource,
  AdminDataSourceFilterCondition,
  AdminDataSourceTable
} from './types';

export const ADMIN_DATA_SOURCE_FILTER_OPERATORS = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'NOT LIKE',
  'IN',
  'NOT IN',
  'IS NULL',
  'IS NOT NULL'
] as const;

export interface AdminDataSourceWorkflowPatch {
  defaultFilters?: AdminDataSourceFilterCondition[];
  sourceId: string;
  status: string;
  tables?: AdminDataSourceTable[];
}

export function mergeAdminDataSourceTables(
  sourceTables: AdminDataSourceTable[],
  fetchedTables: AdminDataSourceTable[]
): AdminDataSourceTable[] {
  const tables = new Map<string, AdminDataSourceTable>();
  for (const table of sourceTables) tables.set(tableKey(table), table);
  for (const table of fetchedTables) {
    const existing = tables.get(tableKey(table));
    tables.set(tableKey(table), existing ? { ...existing, ...table, fields: table.fields.length ? table.fields : existing.fields } : table);
  }
  return sortAdminDataSourceTables([...tables.values()]);
}

export function patchAdminDataSources(
  sources: AdminDataSource[],
  patch: AdminDataSourceWorkflowPatch
): AdminDataSource[] {
  return sources.map(source => {
    if (source.id !== patch.sourceId) return source;
    const nextTables = patch.tables ?? source.tables;
    const selectedCount = nextTables.filter(table => table.isSelected).length;
    return {
      ...source,
      defaultFilters: patch.defaultFilters ?? source.defaultFilters,
      settings: patch.defaultFilters ? { ...source.settings, defaultFilters: patch.defaultFilters } : source.settings,
      tables: nextTables,
      tableCount: Math.max(source.tableCount, nextTables.length, selectedCount)
    };
  });
}

export function selectedTableNames(source: AdminDataSource): string[] {
  return source.tables.filter(table => table.isSelected).map(table => table.name);
}

export function dataModelTableNames(source: AdminDataSource): string[] {
  return source.tables.filter(table => table.isSelected && table.isDataModel).map(table => table.name);
}

export function selectedTableSummary(source: AdminDataSource): string {
  if (source.sourceType === 'target') return 'Target destination';
  const total = source.tables.length || source.tableCount;
  const selected = source.tables.filter(table => table.isSelected).length;
  return total > 0 ? `${selected} of ${total} selected` : 'No tables selected';
}

export function filterWorkflowTables(tables: AdminDataSourceTable[], query: string): AdminDataSourceTable[] {
  const normalized = query.trim().toLowerCase();
  const candidates = normalized
    ? tables.filter(table => [table.name, table.businessName, table.description].join(' ').toLowerCase().includes(normalized))
    : tables;
  return sortAdminDataSourceTables(candidates);
}

export function tableFieldNames(tables: AdminDataSourceTable[]): string[] {
  const names = new Set<string>();
  for (const table of tables) {
    for (const field of table.fields) {
      if (field.name.trim()) names.add(field.name.trim());
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function patchTablesWithSelection(
  tables: AdminDataSourceTable[],
  selectedNames: string[]
): AdminDataSourceTable[] {
  const selected = new Set(selectedNames);
  return tables.map(table => ({
    ...table,
    isDataModel: selected.has(table.name) ? table.isDataModel : false,
    isSelected: selected.has(table.name)
  }));
}

export function patchTablesWithDataModels(
  tables: AdminDataSourceTable[],
  dataModelNames: string[]
): AdminDataSourceTable[] {
  const selected = new Set(dataModelNames);
  return tables.map(table => ({
    ...table,
    isDataModel: table.isSelected && selected.has(table.name)
  }));
}

export function patchTableFilters(
  tables: AdminDataSourceTable[],
  tableName: string,
  filters: AdminDataSourceFilterCondition[]
): AdminDataSourceTable[] {
  return tables.map(table => table.name === tableName ? { ...table, defaultFilters: filters } : table);
}

function sortAdminDataSourceTables(tables: AdminDataSourceTable[]): AdminDataSourceTable[] {
  return [...tables].sort((a, b) => a.name.localeCompare(b.name));
}

function tableKey(table: AdminDataSourceTable): string {
  return table.id || table.name;
}
