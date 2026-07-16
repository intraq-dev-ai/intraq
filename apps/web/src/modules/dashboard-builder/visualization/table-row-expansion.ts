import type { DashboardElement } from '../types';
import type { VisualizationDataRequestContext } from './data';
import type { DashboardDisplayMode, DashboardTableColumn, DashboardTableColumnDisplayConfig, DashboardTableRow } from './view-model-types';

export interface DashboardTableRowExpansionConfig {
  controlColumnLabel?: string;
  enabled: boolean;
  levels: DashboardTableRowExpansionLevel[];
  rowKeyField?: string;
  triggerTextColor?: string;
  triggerTextHoverColor?: string;
  triggerMode?: DashboardTableRowExpansionTriggerMode;
  triggerTextDecoration?: string;
  triggerTextHoverDecoration?: string;
}

export type DashboardTableRowExpansionTriggerMode =
  | 'button'
  | 'first-cell'
  | 'first-cell-and-button';

export interface DashboardTableRowExpansionLevel {
  children?: DashboardTableRowExpansionLevel[];
  columns: DashboardTableExpansionColumn[];
  contentIndent?: string;
  controlColumnLabel?: string;
  dataSourceId?: string;
  displayMode?: DashboardDisplayMode;
  emptyMessage?: string;
  fieldFormats?: Record<string, string>;
  fieldLabels?: Record<string, string>;
  fieldRoles?: Record<string, string>;
  groupByFields?: string[];
  hiddenFields?: string[];
  parameterMappings?: Record<string, unknown>;
  parameterValues?: Record<string, unknown>;
  rowKeyField?: string;
  rowLimit?: number;
  showEmptyMessage?: boolean;
  showTotals?: boolean;
  tabActiveColor?: string;
  tabActiveFontWeight?: string;
  tabColor?: string;
  tabFontWeight?: string;
  tabHoverColor?: string;
  tabIndent?: string;
  tabSeparator?: string;
  tabStyle?: DashboardTableRowExpansionTabStyle;
  tableFormat?: string;
  tableName?: string;
  tabs?: DashboardTableRowExpansionLevel[];
  title?: string;
  totalColumns?: string[];
  totalLabel?: string;
  totalLabelColumn?: string;
}

export type DashboardTableExpansionColumn = string | (Partial<DashboardTableColumn> & {
  currencySymbol?: string;
  decimals?: number | string;
  field?: string;
  format?: string;
  key?: string;
  label?: string;
  maximumFractionDigits?: number | string;
  minimumFractionDigits?: number | string;
  precision?: number | string;
});

export type DashboardTableRowExpansionTabStyle = 'buttons' | 'links';

interface ExpansionContext {
  level: DashboardTableRowExpansionLevel;
  ownerElement: DashboardElement;
  parentRow: DashboardTableRow;
  rootRow: DashboardTableRow;
  runtimeParameterValues?: Record<string, unknown>;
}

export function readTableRowExpansionConfig(config: unknown): DashboardTableRowExpansionConfig | null {
  if (!isRecord(config)) return null;
  const raw = firstRecord(config.rowExpansion, config.tableRowExpansion, config.expansion, config.expandRows, config.drillRows);
  if (!raw) return null;
  const levelsValue = raw.levels ?? raw.drilldowns ?? raw.children ?? raw.requests;
  const levels = Array.isArray(levelsValue)
    ? levelsValue.flatMap(readExpansionLevel)
    : [];
  const enabled = readBoolean(raw.enabled) ?? levels.length > 0;
  if (!enabled || levels.length === 0) return null;
  return {
    enabled,
    levels,
    ...(readString(raw.controlColumnLabel ?? raw.label) ? { controlColumnLabel: readString(raw.controlColumnLabel ?? raw.label) } : {}),
    ...(readString(raw.rowKeyField ?? raw.keyField) ? { rowKeyField: readString(raw.rowKeyField ?? raw.keyField) } : {}),
    ...(readString(raw.triggerTextColor ?? raw.linkColor) ? { triggerTextColor: readString(raw.triggerTextColor ?? raw.linkColor) } : {}),
    ...(readString(raw.triggerTextHoverColor ?? raw.linkHoverColor) ? { triggerTextHoverColor: readString(raw.triggerTextHoverColor ?? raw.linkHoverColor) } : {}),
    ...(readString(raw.triggerTextDecoration ?? raw.linkTextDecoration) ? { triggerTextDecoration: readString(raw.triggerTextDecoration ?? raw.linkTextDecoration) } : {}),
    ...(readString(raw.triggerTextHoverDecoration ?? raw.linkHoverTextDecoration) ? { triggerTextHoverDecoration: readString(raw.triggerTextHoverDecoration ?? raw.linkHoverTextDecoration) } : {}),
    ...(readTableRowExpansionTriggerMode(raw.triggerMode ?? raw.trigger ?? raw.expandTrigger) ? { triggerMode: readTableRowExpansionTriggerMode(raw.triggerMode ?? raw.trigger ?? raw.expandTrigger) } : {})
  };
}

export function tableRowExpansionKey(row: DashboardTableRow, fallbackIndex: number, keyField?: string): string {
  const configured = keyField ? lookupPath(row.raw, keyField) : undefined;
  if (configured !== undefined && configured !== null && String(configured).trim()) return String(configured);
  return row.key || String(fallbackIndex);
}

export function canExpandTableRow(row: DashboardTableRow, keyField?: string): boolean {
  if (!row.raw) return false;
  if (!keyField) return true;
  const value = lookupPath(row.raw, keyField);
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

export function buildExpansionElement(
  context: ExpansionContext
): { element: DashboardElement; rowLimit: number } | null {
  const dataSourceId = readString(context.level.dataSourceId) ?? readString(context.ownerElement.dataSourceId) ?? readString(context.ownerElement.config?.dataSourceId);
  const tableName = readString(context.level.tableName) ?? readString(context.ownerElement.config?.tableName);
  if (!dataSourceId || !tableName) return null;
  const columns = normalizedExpansionColumns(context.level.columns);
  if (columns.length === 0) return null;
  const firstColumn = columns[0];
  const valueFields = columns.slice(1).map(column => column.key);
  const groupByFields = normalizedStringArray(context.level.groupByFields);
  const sourceFields = uniqueStrings([
    ...columns.map(column => column.key),
    ...groupByFields,
    ...normalizedStringArray(context.level.hiddenFields),
    ...(context.level.rowKeyField ? [context.level.rowKeyField] : [])
  ]);
  const fieldFormats = {
    ...defaultFieldFormats(columns),
    ...(isRecord(context.level.fieldFormats) ? context.level.fieldFormats : {})
  };
  const fieldLabels = {
    ...Object.fromEntries(columns.map(column => [column.key, column.label])),
    ...(isRecord(context.level.fieldLabels) ? context.level.fieldLabels : {})
  };
  const fieldRoles = {
    [firstColumn.key]: 'dimension',
    ...Object.fromEntries(valueFields.map(field => [field, fieldFormats[field] === 'text' ? 'dimension' : 'measure'])),
    ...(isRecord(context.level.fieldRoles) ? context.level.fieldRoles : {})
  };
  const parameterValues = resolvedExpansionParameters(context);
  const rowLimit = positiveInteger(context.level.rowLimit) ?? 250;
  return {
    rowLimit,
    element: {
      id: `${context.ownerElement.id}:row-expansion:${tableName}`,
      dashboardId: context.ownerElement.dashboardId,
      name: tableName,
      type: 'table',
      dataSourceId,
      order: context.ownerElement.order,
      isVisible: true,
      config: {
        dataSourceId,
        tableName,
        columns,
        currencySymbol: context.ownerElement.config?.currencySymbol ?? '$',
        displayMode: context.level.displayMode ?? context.ownerElement.config?.displayMode,
        enableExport: false,
        enablePagination: false,
        enableSearch: false,
        enableSorting: false,
        fieldFormats,
        fieldLabels,
        fieldRoles,
        fields: sourceFields,
        hideTitle: true,
        limit: rowLimit,
        pageSize: rowLimit,
        parameterValues,
        rowLimit,
        showBorders: true,
        showTotals: context.level.showTotals === true,
        tableDisplayMode: context.level.displayMode ?? 'compact',
        tableFormat: context.level.tableFormat ?? context.ownerElement.config?.tableFormat ?? 'report-grid',
        title: tableName,
        totalColumns: normalizedStringArray(context.level.totalColumns),
        totalLabel: readString(context.level.totalLabel) ?? 'Total:',
        totalLabelColumn: readString(context.level.totalLabelColumn) ?? firstColumn.key,
        valueFields,
        xField: firstColumn.key,
        yFields: valueFields,
        ...(groupByFields.length > 0
          ? {
            groupByFields,
            rowGrouping: {
              fields: groupByFields,
              hideGroupedColumns: false,
              showTotals: context.level.showTotals === true
            }
          }
          : {})
      }
    }
  };
}

export function expansionRequestContext(
  base: VisualizationDataRequestContext | undefined,
  parameterValues: Record<string, unknown> | undefined
): VisualizationDataRequestContext | undefined {
  if (!base && !parameterValues) return undefined;
  return {
    ...(base ?? {}),
    runtimeParameterValues: {
      ...(base?.runtimeParameterValues ?? {}),
      ...(parameterValues ?? {})
    }
  };
}

function readExpansionLevel(value: unknown): DashboardTableRowExpansionLevel[] {
  if (!isRecord(value)) return [];
  const columns = Array.isArray(value.columns) ? value.columns.flatMap(readExpansionColumn) : [];
  const tabs = Array.isArray(value.tabs) ? value.tabs.flatMap(readExpansionLevel) : [];
  if (columns.length === 0 && tabs.length === 0) return [];
  const showEmptyMessage = readBoolean(value.showEmptyMessage ?? value.showEmptyState ?? value.showNoRowsMessage);
  return [{
    columns,
    ...(Array.isArray(value.children) ? { children: value.children.flatMap(readExpansionLevel) } : {}),
    ...(readString(value.contentIndent ?? value.contentOffset ?? value.contentMarginLeft) ? { contentIndent: readString(value.contentIndent ?? value.contentOffset ?? value.contentMarginLeft) } : {}),
    ...(readString(value.controlColumnLabel ?? value.label) ? { controlColumnLabel: readString(value.controlColumnLabel ?? value.label) } : {}),
    ...(readString(value.dataSourceId ?? value.sourceId) ? { dataSourceId: readString(value.dataSourceId ?? value.sourceId) } : {}),
    ...(readString(value.displayMode ?? value.tableDisplayMode) ? { displayMode: readString(value.displayMode ?? value.tableDisplayMode) as DashboardDisplayMode } : {}),
    ...(readString(value.emptyMessage ?? value.emptyText) ? { emptyMessage: readString(value.emptyMessage ?? value.emptyText) } : {}),
    ...(isRecord(value.fieldFormats) ? { fieldFormats: value.fieldFormats } : {}),
    ...(isRecord(value.fieldLabels) ? { fieldLabels: value.fieldLabels } : {}),
    ...(isRecord(value.fieldRoles) ? { fieldRoles: value.fieldRoles } : {}),
    ...(normalizedStringArray(value.groupByFields ?? value.grouping).length > 0 ? { groupByFields: normalizedStringArray(value.groupByFields ?? value.grouping) } : {}),
    ...(normalizedStringArray(value.hiddenFields ?? value.sourceFields).length > 0 ? { hiddenFields: normalizedStringArray(value.hiddenFields ?? value.sourceFields) } : {}),
    ...(isRecord(value.parameterMappings ?? value.parameterMap ?? value.mappings) ? { parameterMappings: value.parameterMappings ?? value.parameterMap ?? value.mappings } : {}),
    ...(isRecord(value.parameterValues ?? value.parameters ?? value.params) ? { parameterValues: value.parameterValues ?? value.parameters ?? value.params } : {}),
    ...(readString(value.rowKeyField ?? value.keyField) ? { rowKeyField: readString(value.rowKeyField ?? value.keyField) } : {}),
    ...(positiveInteger(value.rowLimit ?? value.limit) ? { rowLimit: positiveInteger(value.rowLimit ?? value.limit) } : {}),
    ...(showEmptyMessage !== undefined ? { showEmptyMessage } : {}),
    ...(readBoolean(value.showTotals ?? value.showTotal) === true ? { showTotals: true } : {}),
    ...(readString(value.tabActiveColor) ? { tabActiveColor: readString(value.tabActiveColor) } : {}),
    ...(readString(value.tabActiveFontWeight ?? value.activeTabFontWeight) ? { tabActiveFontWeight: readString(value.tabActiveFontWeight ?? value.activeTabFontWeight) } : {}),
    ...(readString(value.tabColor) ? { tabColor: readString(value.tabColor) } : {}),
    ...(readString(value.tabFontWeight) ? { tabFontWeight: readString(value.tabFontWeight) } : {}),
    ...(readString(value.tabHoverColor) ? { tabHoverColor: readString(value.tabHoverColor) } : {}),
    ...(readString(value.tabIndent ?? value.tabOffset ?? value.tabMarginLeft) ? { tabIndent: readString(value.tabIndent ?? value.tabOffset ?? value.tabMarginLeft) } : {}),
    ...(readString(value.tabSeparator) ? { tabSeparator: readString(value.tabSeparator) } : {}),
    ...(readTableRowExpansionTabStyle(value.tabStyle ?? value.tabDisplay ?? value.tabPresentation) ? { tabStyle: readTableRowExpansionTabStyle(value.tabStyle ?? value.tabDisplay ?? value.tabPresentation) } : {}),
    ...(readString(value.tableFormat ?? value.tableStyle) ? { tableFormat: readString(value.tableFormat ?? value.tableStyle) } : {}),
    ...(readString(value.tableName ?? value.dataModel ?? value.endpoint) ? { tableName: readString(value.tableName ?? value.dataModel ?? value.endpoint) } : {}),
    ...(tabs.length > 0 ? { tabs } : {}),
    ...(readString(value.title ?? value.tabLabel ?? value.name) ? { title: readString(value.title ?? value.tabLabel ?? value.name) } : {}),
    ...(normalizedStringArray(value.totalColumns ?? value.totalFields).length > 0 ? { totalColumns: normalizedStringArray(value.totalColumns ?? value.totalFields) } : {}),
    ...(readString(value.totalLabel) ? { totalLabel: readString(value.totalLabel) } : {}),
    ...(readString(value.totalLabelColumn) ? { totalLabelColumn: readString(value.totalLabelColumn) } : {})
  }];
}

function readExpansionColumn(value: unknown): DashboardTableExpansionColumn[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!isRecord(value)) return [];
  const field = readString(value.field ?? value.key ?? value.name);
  if (!field) return [];
  return [{ ...value, field }];
}

function normalizedExpansionColumns(columns: DashboardTableExpansionColumn[]): DashboardTableColumn[] {
  return columns.flatMap(column => {
    if (typeof column === 'string') {
      return [{ key: column, label: labelFor(column), cellType: 'text' as const }];
    }
    const key = readString(column.field ?? column.key ?? column.name);
    if (!key) return [];
    const format = readString(column.format);
    const displayConfig = expansionColumnDisplayConfig(column);
    return [{
      key,
      label: readString(column.label) ?? labelFor(key),
      cellType: column.cellType ?? 'text',
      ...(column.align ? { align: column.align } : {}),
      ...(displayConfig ? { displayConfig } : {}),
      ...(format ? { format: format as DashboardTableColumn['format'] } : {}),
      ...(column.totalAggregation ? { totalAggregation: column.totalAggregation } : {}),
      ...(column.width ? { width: column.width } : {})
    }];
  });
}

function expansionColumnDisplayConfig(column: Exclude<DashboardTableExpansionColumn, string>): DashboardTableColumnDisplayConfig | null {
  const displayConfig = isRecord(column.displayConfig)
    ? { ...(column.displayConfig as DashboardTableColumnDisplayConfig) }
    : {};
  const precision = nonNegativeInteger(column.precision ?? column.decimals);
  const maximumFractionDigits = nonNegativeInteger(column.maximumFractionDigits ?? column.decimals);
  const minimumFractionDigits = nonNegativeInteger(column.minimumFractionDigits ?? column.decimals);
  const currencySymbol = readString(column.currencySymbol);
  const next: DashboardTableColumnDisplayConfig = {
    ...displayConfig,
    ...(currencySymbol ? { currencySymbol } : {}),
    ...(precision !== undefined ? { precision } : {}),
    ...(maximumFractionDigits !== undefined ? { maximumFractionDigits } : {}),
    ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {})
  };
  return Object.keys(next).length > 0 ? next : null;
}

function resolvedExpansionParameters(context: ExpansionContext): Record<string, unknown> {
  const staticValues = isRecord(context.level.parameterValues) ? context.level.parameterValues : {};
  const mappings = isRecord(context.level.parameterMappings) ? context.level.parameterMappings : {};
  const mapped = Object.fromEntries(
    Object.entries(mappings).flatMap(([key, value]) => {
      if (!key.trim()) return [];
      const resolved = resolveMappedValue(value, context);
      return isSerializableParameterValue(resolved) ? [[key, resolved]] : [];
    })
  );
  const staticResolved = Object.fromEntries(
    Object.entries(staticValues).flatMap(([key, value]) => {
      const resolved = resolveMappedValue(value, context);
      return key.trim() && isSerializableParameterValue(resolved) ? [[key, resolved]] : [];
    })
  );
  return {
    ...(context.runtimeParameterValues ?? {}),
    ...staticResolved,
    ...mapped
  };
}

function resolveMappedValue(value: unknown, context: ExpansionContext): unknown {
  if (typeof value === 'string') return resolveMappedString(value, context);
  if (Array.isArray(value)) return value.map(item => resolveMappedValue(item, context));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveMappedValue(item, context)]));
  return value;
}

function resolveMappedString(value: string, context: ExpansionContext): unknown {
  const trimmed = value.trim();
  const direct = directTokenValue(trimmed, context);
  if (direct.matched) return direct.value;
  const exactTemplate = trimmed.match(/^\{\{\s*([^}]+)\s*\}\}$/);
  if (exactTemplate) {
    const resolved = directTokenValue(exactTemplate[1].trim(), context);
    if (resolved.matched) return resolved.value;
  }
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, token: string) => {
    const resolved = directTokenValue(token.trim(), context);
    return resolved.matched && resolved.value !== undefined && resolved.value !== null ? String(resolved.value) : '';
  });
}

function directTokenValue(token: string, context: ExpansionContext): { matched: boolean; value?: unknown } {
  const normalized = token.startsWith('$') ? token.slice(1) : token;
  const [scope, ...pathParts] = normalized.split('.');
  if (!scope || pathParts.length === 0) return { matched: false };
  const path = pathParts.join('.');
  if (scope === 'row' || scope === 'parent') return { matched: true, value: lookupPath(context.parentRow.raw, path) };
  if (scope === 'root') return { matched: true, value: lookupPath(context.rootRow.raw, path) };
  if (scope === 'runtime' || scope === 'param' || scope === 'params' || scope === 'parameter') {
    return { matched: true, value: lookupPath(context.runtimeParameterValues, path) };
  }
  return { matched: false };
}

function defaultFieldFormats(columns: DashboardTableColumn[]): Record<string, string> {
  return Object.fromEntries(columns.map(column => [column.key, column.format ?? 'text']));
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (isRecord(value)) return value;
  }
  return null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readTableRowExpansionTriggerMode(value: unknown): DashboardTableRowExpansionTriggerMode | undefined {
  const normalized = readString(value)?.toLowerCase().replace(/[_\s]+/g, '-');
  if (normalized === 'button' || normalized === 'icon') return 'button';
  if (normalized === 'cell' || normalized === 'first-cell' || normalized === 'label') return 'first-cell';
  if (
    normalized === 'cell-and-button'
    || normalized === 'button-and-cell'
    || normalized === 'first-cell-and-button'
    || normalized === 'button-and-first-cell'
    || normalized === 'label-and-button'
  ) return 'first-cell-and-button';
  return undefined;
}

function readTableRowExpansionTabStyle(value: unknown): DashboardTableRowExpansionTabStyle | undefined {
  const normalized = readString(value)?.toLowerCase().replace(/[_\s]+/g, '-');
  if (normalized === 'link' || normalized === 'links' || normalized === 'text') return 'links';
  if (normalized === 'button' || normalized === 'buttons' || normalized === 'tabs') return 'buttons';
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function normalizedStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(item => readString(item) ?? []);
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function lookupPath(source: unknown, path: string): unknown {
  if (!isRecord(source)) return undefined;
  const parts = path.split('.').filter(Boolean);
  let current: unknown = source;
  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    if (part in current) {
      current = current[part];
      continue;
    }
    const match = Object.keys(current).find(key => key.toLowerCase() === part.toLowerCase());
    if (!match) return undefined;
    current = current[match];
  }
  return current;
}

function isSerializableParameterValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  return Array.isArray(value) && value.every(item =>
    item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function labelFor(field: string): string {
  return field
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, character => character.toUpperCase());
}
