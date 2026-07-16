import { createFilterDraft } from '../agent-context/planner-filters';
import type {
  BuilderDataField,
  BuilderDataSource,
  BuilderDataTable,
  DashboardElement
} from '../types';
import {
  readString,
  type FilterFormState,
  type TargetDataSource
} from './dashboard-filter-editor-model';

export function visualizationDataRef(element: DashboardElement): Record<string, unknown> {
  const visualization = element.config?.visualization;
  if (!visualization || typeof visualization !== 'object' || Array.isArray(visualization)) return {};
  const dataRef = (visualization as Record<string, unknown>).dataRef;
  return dataRef && typeof dataRef === 'object' && !Array.isArray(dataRef)
    ? dataRef as Record<string, unknown>
    : {};
}

export function fieldsForTable(table: BuilderDataTable | undefined): BuilderDataField[] {
  return table?.fields ?? [];
}

export function toTargetDataModels(source: BuilderDataSource): TargetDataSource[] {
  return source.tables.map(table => ({
    dataSourceId: source.id,
    id: table.id || table.name,
    name: table.dictionary?.businessName || table.description || table.name,
    sourceName: source.name,
    tableId: table.id,
    tableName: table.name,
    type: table.settings?.isDataModel === false ? source.status || 'Table' : 'Data Model'
  }));
}

export function filterFieldLabel(field: BuilderDataField): string {
  return `${field.label || field.description || field.name} (${field.type || field.columnType || 'text'})`;
}

export function firstFieldName(fields: BuilderDataField[]): string {
  return fields[0]?.name ?? '';
}

export function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.flatMap(value => {
    const normalized = readString(value);
    return normalized ? [normalized] : [];
  })));
}

export function defaultFieldForFilterType(
  table: BuilderDataTable | undefined,
  filterType: FilterFormState['type']
): string {
  if (!table) return '';
  const recommended = createFilterDraft(table);
  const tableFields = fieldsForTable(table);
  if (filterType === 'dateRange' || filterType === 'datePicker' || filterType === 'periodFilter') {
    const dateField = tableFields.find(field => {
      const type = `${field.type ?? ''} ${field.dataType ?? ''}`.toLowerCase();
      return type.includes('date') || type.includes('time') || field.columnType === 'time';
    });
    return dateField?.name ?? recommended.field ?? firstFieldName(tableFields);
  }
  return recommended.field ?? firstFieldName(tableFields);
}

export function parsePeriodOptionsText(value: string): Array<Record<string, unknown>> {
  return value.split('\n').flatMap(line => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const [id = '', label = '', unit = '', rangeType = '', rangeFrequency = '', icon = ''] = trimmed.split('|').map(part => part.trim());
    if (!id || !label || !unit) return [];
    return [{
      id,
      ...(icon ? { icon } : {}),
      label,
      unit,
      ...(rangeType ? { rangeType: coercePeriodOptionValue(rangeType), rangeTypeText: String(rangeType) } : {}),
      ...(rangeFrequency ? { rangeFrequency } : {})
    }];
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coercePeriodOptionValue(value: string): string | number {
  const parsed = Number(value);
  return value !== '' && Number.isFinite(parsed) ? parsed : value;
}
