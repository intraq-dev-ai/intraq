import type {
  AnalyzerColumn,
  AnalyzerPlan,
  AnalyzerPlanAction,
  AnalyzerTableData
} from '../../analyzer/types';
import type {
  Dashboard,
  DashboardElement,
  DashboardFilter,
  VisualizationFilterIntent
} from '../types';

interface DashboardAnalyzerTableDataInput {
  dashboard: Dashboard;
  dataSourceId: string;
  limit?: number;
  plan: AnalyzerPlan;
  signal: AbortSignal;
  tableName: string;
}

interface DashboardAnalyzerTableLoaderInput {
  dataSourceId: string;
  limit: number;
  plan: AnalyzerPlan | null;
  tableName: string;
}

interface ChartDataPayload {
  success?: boolean;
  data?: {
    rawData?: Array<Record<string, unknown>>;
  };
  error?: string;
}

interface FilterTargets {
  component: string[];
  dataSource: string[];
  table: string[];
}

export async function fetchDashboardAnalyzerTableData(
  input: DashboardAnalyzerTableDataInput
): Promise<AnalyzerTableData> {
  const element = findDashboardElementForTable(input.dashboard, input.dataSourceId, input.tableName);
  const columns = analyzerColumnsForPlan(input.plan, input.tableName, element);
  const limit = input.limit ?? 100;
  const knownFields = knownFieldSet(columns, element);
  const filters = input.dashboard.filters
    .filter(filter => filterAppliesToAnalyzerTable(filter, {
      dataSourceId: input.dataSourceId,
      element,
      knownFields,
      tableName: input.tableName
    }))
    .flatMap(filterIntentFromDashboardFilter);

  const response = await fetch('/api/chart-data', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      dataSourceId: input.dataSourceId,
      editMode: true,
      tableName: input.tableName,
      visualization: {
        encodings: columns.map(column => ({
          field: column.field,
          label: column.label,
          role: column.summarize && column.summarize !== 'none' ? 'measure' : 'dimension'
        })),
        filters,
        kind: 'table',
        limit,
        sort: []
      }
    }),
    signal: input.signal
  });
  const payload = await response.json() as ChartDataPayload;
  if (!response.ok || payload.success !== true || !payload.data) {
    throw new Error(payload.error ?? 'Dashboard analyzer data request failed.');
  }
  const rows = payload.data.rawData ?? [];
  return {
    columns: columns.length > 0 ? columns : columnsFromRows(rows),
    rows,
    tableName: input.tableName,
    totalRows: rows.length
  };
}

export function createDashboardAnalyzerTableDataLoader(options: {
  activeController: () => AbortController | null;
  dashboard: () => Dashboard;
  latestPlan: () => AnalyzerPlan | null;
}) {
  return (input: DashboardAnalyzerTableLoaderInput) => {
    const plan = input.plan ?? options.latestPlan();
    if (!plan) throw new Error('Analyzer plan is not available for loading more rows.');
    const controller = options.activeController() ?? new AbortController();
    return fetchDashboardAnalyzerTableData({
      dashboard: options.dashboard(),
      dataSourceId: input.dataSourceId,
      limit: input.limit,
      plan,
      signal: controller.signal,
      tableName: input.tableName
    });
  };
}

function findDashboardElementForTable(
  dashboard: Dashboard,
  dataSourceId: string,
  tableName: string
): DashboardElement | null {
  return dashboard.elements.find(element =>
    element.isVisible !== false
    && (element.dataSourceId === dataSourceId || element.config?.dataSourceId === dataSourceId)
    && element.config?.tableName === tableName
  ) ?? null;
}

function analyzerColumnsForPlan(
  plan: AnalyzerPlan,
  tableName: string,
  element: DashboardElement | null
): AnalyzerColumn[] {
  const action = plan.actions.find(item =>
    actionTableName(item) === tableName && Array.isArray(item.params.columns)
  ) ?? plan.actions.find(item => Array.isArray(item.params.columns));
  const actionColumns = Array.isArray(action?.params.columns)
    ? action.params.columns.flatMap(readAnalyzerColumn)
    : [];
  if (actionColumns.length > 0) return dedupeColumns(actionColumns);
  return dedupeColumns(elementColumns(element));
}

function readAnalyzerColumn(value: unknown): AnalyzerColumn[] {
  if (typeof value === 'string' && value.trim()) {
    return [{ field: value.trim(), label: labelFor(value.trim()) }];
  }
  if (!isRecord(value)) return [];
  const field = readString(value.field ?? value.name ?? value.key);
  if (!field) return [];
  const column: AnalyzerColumn = {
    field,
    label: readString(value.label ?? value.title) ?? labelFor(field)
  };
  const summarize = readString(value.summarize ?? value.aggregation);
  const type = readString(value.type);
  if (summarize) column.summarize = summarize;
  if (type) column.type = type;
  return [column];
}

function elementColumns(element: DashboardElement | null): AnalyzerColumn[] {
  if (!element) return [];
  const config = element.config ?? {};
  return [
    ...readStringArray(config.columns),
    ...readStringArray(config.rowFields),
    ...readStringArray(config.columnFields),
    ...readStringArray(config.valueFields),
    readString(config.xField),
    ...readStringArray(config.ySeries),
    readString(config.valueField)
  ].flatMap(field => field ? [{ field, label: labelFor(field) }] : []);
}

function knownFieldSet(columns: AnalyzerColumn[], element: DashboardElement | null): Set<string> {
  const config = element?.config ?? {};
  return new Set([
    ...columns.map(column => column.field),
    ...Object.keys(isRecord(config.fieldRoles) ? config.fieldRoles : {}),
    ...Object.keys(isRecord(config.fieldFormats) ? config.fieldFormats : {}),
    ...elementColumns(element).map(column => column.field)
  ].filter(Boolean));
}

function filterAppliesToAnalyzerTable(
  filter: DashboardFilter,
  context: {
    dataSourceId: string;
    element: DashboardElement | null;
    knownFields: Set<string>;
    tableName: string;
  }
): boolean {
  if (!isFilterActive(filter)) return false;
  const field = readFilterField(filter);
  if (!field) return false;
  const targets = collectTargets(filter);
  const hasComponentTarget = targets.component.length > 0;
  const hasTableTarget = targets.table.length > 0;
  const hasDataSourceTarget = targets.dataSource.length > 0;
  if (hasTableTarget) return targetMatches(targets.table, context.tableName);
  if (hasComponentTarget) {
    const targetElement = context.element;
    return targetElement !== null && targetMatches(targets.component, [
      targetElement.id,
      targetElement.name,
      targetElement.config?.title
    ]);
  }
  if (hasDataSourceTarget) {
    return targetMatches(targets.dataSource, context.dataSourceId) && context.knownFields.has(field);
  }
  return context.knownFields.has(field);
}

function filterIntentFromDashboardFilter(filter: DashboardFilter): VisualizationFilterIntent[] {
  const field = readFilterField(filter);
  const operator = normalizeOperator(readString(filter.operator ?? filter.config?.operator));
  const value = normalizeFilterValue(filter, operator);
  if (!field || isEmptyFilterValue(value)) return [];
  return [{ field, operator, value }];
}

function collectTargets(filter: DashboardFilter): FilterTargets {
  const config = filter.config ?? {};
  const result: FilterTargets = { component: [], dataSource: [], table: [] };
  addTargets(result, targetEntries(config.targets ?? config.targeting));
  addTargets(result, targetEntries(filter.target ?? config.target));
  addTargetValues(result, 'component', filter.targetComponents ?? config.targetComponents);
  addTargetValues(result, 'component', filter.targetElementIds ?? config.targetElementIds ?? config.targetElements);
  addTargetValues(result, 'dataSource', filter.targetDataSources ?? config.targetDataSources);
  addTargetValues(result, 'dataSource', filter.targetDataSourceId ?? config.targetDataSourceId);
  addTargetValues(result, 'table', config.targetTable ?? config.targetTableId ?? config.targetTableName);
  addTargetValues(result, 'table', config.targetTables ?? config.targetTableIds ?? config.targetTableNames ?? config.targetDataModels);
  return {
    component: unique(result.component),
    dataSource: unique(result.dataSource),
    table: unique(result.table)
  };
}

function addTargets(targets: FilterTargets, entries: Array<{ type: keyof FilterTargets; values: string[] }>): void {
  for (const entry of entries) targets[entry.type].push(...entry.values);
}

function targetEntries(value: unknown): Array<{ type: keyof FilterTargets; values: string[] }> {
  if (Array.isArray(value)) return value.flatMap(targetEntries);
  if (!isRecord(value)) return [];
  const type = normalizeTargetType(readString(value.type ?? value.targetType ?? value.kind ?? value.scope));
  const values = targetValues(value.values ?? value.ids ?? value.id ?? value.value ?? value.key ?? value.name);
  return values.length > 0 ? [{ type, values }] : [];
}

function addTargetValues(targets: FilterTargets, type: keyof FilterTargets, value: unknown): void {
  targets[type].push(...targetValues(value));
}

function normalizeTargetType(value: string | undefined): keyof FilterTargets {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (['component', 'componentid', 'element', 'elements', 'visualization', 'widget', 'tile', 'chart'].includes(normalized)) {
    return 'component';
  }
  if (['datasource', 'datasourceid', 'data-source', 'data source', 'source', 'sourceid'].includes(normalized)) {
    return 'dataSource';
  }
  return 'table';
}

function targetMatches(targets: string[], value: unknown): boolean {
  const candidates = targetValues(value);
  return targets.some(target => candidates.includes(target));
}

function targetValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return unique(values.flatMap(item => {
    if (item === undefined || item === null || item === '') return [];
    if (isRecord(item)) return targetValues(item.id ?? item.value ?? item.key ?? item.name);
    return [String(item).trim().toLowerCase()];
  }).filter(Boolean));
}

function normalizeFilterValue(filter: DashboardFilter, operator: VisualizationFilterIntent['operator']): unknown {
  const config = filter.config ?? {};
  const value = filter.value ?? config.value;
  if (operator === 'between') {
    if (Array.isArray(value)) return value;
    if (isRecord(value)) return [value.start ?? value.from, value.end ?? value.to];
    return [config.startDate ?? config.fromDate, config.endDate ?? config.toDate];
  }
  if (operator === 'last' && typeof value === 'string') return normalizeLastDateToken(value);
  return value;
}

function normalizeOperator(value: string | undefined): VisualizationFilterIntent['operator'] {
  const raw = value?.trim().toLowerCase() ?? '';
  if (raw === 'between' || raw === 'last') return raw;
  if (raw === '!=' || raw === '<>' || raw === 'not_equals') return 'notEquals';
  if (raw === '>') return 'greaterThan';
  if (raw === '>=') return 'greaterThanOrEqual';
  if (raw === '<') return 'lessThan';
  if (raw === '<=') return 'lessThanOrEqual';
  if (raw === 'in') return 'in';
  if (raw === 'contains') return 'contains';
  return 'equals';
}

function normalizeLastDateToken(value: string): string {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^last[_\s-]*(\d+)(?:[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y))?$/)
    ?? normalized.match(/^(\d+)[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y)$/);
  if (!match) return value.trim();
  const amount = Number(match[1] ?? '0');
  const unit = match[2] ?? 'days';
  if (unit.startsWith('w')) return `${amount * 7} days`;
  if (unit.startsWith('m')) return `${amount * 30} days`;
  if (unit.startsWith('y')) return `${amount * 365} days`;
  return `${amount} days`;
}

function isFilterActive(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return filter.isActive !== false
    && filter.disabled !== true
    && filter.isDisabled !== true
    && filter.enabled !== false
    && config.isActive !== false
    && config.disabled !== true
    && config.isDisabled !== true
    && config.enabled !== false;
}

function readFilterField(filter: DashboardFilter): string {
  return readString(filter.field ?? filter.config?.field) ?? '';
}

function columnsFromRows(rows: Array<Record<string, unknown>>): AnalyzerColumn[] {
  return Object.keys(rows[0] ?? {}).map(field => ({ field, label: labelFor(field) }));
}

function dedupeColumns(columns: AnalyzerColumn[]): AnalyzerColumn[] {
  const seen = new Set<string>();
  return columns.filter(column => {
    if (!column.field || seen.has(column.field)) return false;
    seen.add(column.field);
    return true;
  });
}

function actionTableName(action: AnalyzerPlanAction): string | null {
  return readString(action.params.tableName ?? action.params._tableName) ?? null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [item.trim()];
    if (!isRecord(item)) return [];
    return readString(item.field ?? item.name ?? item.key) ?? [];
  });
}

function isEmptyFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyFilterValue);
  return typeof value === 'string' && ['', 'all', 'any', '__all__'].includes(value.trim().toLowerCase());
}

function labelFor(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
