import type { AnalyzerPlan, AnalyzerPlanAction } from './types';

export interface AnalyzerPlanTableDataRequest {
  body: Record<string, unknown>;
  columns: Array<{ field: string; label?: string; summarize?: string; type?: string }>;
  parameterValues: Record<string, unknown>;
}

const ANALYZER_CHART_DATA_ROW_LIMIT = 100;
const ANALYZER_CHART_DATA_EXPORT_ROW_LIMIT = 250_000;
const DATE_PARAMETER_FIELDS = new Set([
  'from',
  'to',
  'fromdate',
  'todate',
  'startdate',
  'enddate',
  'start_date',
  'end_date',
  'datefrom',
  'dateto',
  'as_of_date',
  'asofdate',
  'report_date',
  'reportdate'
]);

export function analyzerPlanTableDataRequest(
  dataSourceId: string,
  tableName: string,
  plan: AnalyzerPlan,
  options: { ignoreTopN?: boolean; limit?: number } = {}
): AnalyzerPlanTableDataRequest {
  const action = findCreateTableAction(plan, tableName);
  const columns = readColumns(action?.params.columns);
  const parameterValues = parameterValuesFromAction(action);
  const calculatedFields = calculatedFieldsFromPlan(plan, tableName);
  const chartFilters = chartFiltersFromAction(action);
  const topN = options.ignoreTopN ? undefined : topNFromAction(action);
  const explicitSort = sortFromAction(action);
  const fallbackSortDirection = topN ? 'desc' : undefined;
  const sort = explicitSort.length > 0
    ? explicitSort
    : fallbackSortDirection
      ? fallbackSortFromColumns(columns, fallbackSortDirection)
      : [];
  const maxLimit = options.ignoreTopN ? ANALYZER_CHART_DATA_EXPORT_ROW_LIMIT : ANALYZER_CHART_DATA_ROW_LIMIT;
  const rowLimit = topN ?? readPositiveInteger(options.limit, maxLimit) ?? ANALYZER_CHART_DATA_ROW_LIMIT;
  const primarySort = sort[0];
  return {
    body: {
      requester: 'ai-data-analyzer',
      dataSourceId,
      tableName,
      editMode: true,
      limit: rowLimit,
      visualization: {
        kind: 'table',
        limit: rowLimit,
        encodings: columns.map(column => ({
          field: column.field,
          label: column.label ?? labelForField(column.field),
          role: column.summarize && column.summarize !== 'none' ? 'measure' : 'dimension',
          aggregation: column.summarize ?? 'none',
          format: column.type === 'date' ? 'date' : 'number'
        })),
        filters: chartFilters,
        sort
      },
      chartConfig: {
        xField: columns[0]?.field ?? '',
        yFields: columns.map(column => column.field),
        chartType: 'table',
        aggregations: Object.fromEntries(columns.map(column => [column.field, column.summarize ?? 'none'])),
        filters: chartFilters,
        limit: rowLimit,
        sort
      },
      ...(Object.keys(parameterValues).length > 0 ? { parameterValues } : {}),
      componentConfig: {
        columns,
        limit: rowLimit,
        ...(topN ? { topN } : {}),
        ...(primarySort ? { sortBy: primarySort.field, sortDirection: primarySort.direction } : {}),
        ...(calculatedFields.length > 0 ? { calculatedFields } : {})
      }
    },
    columns,
    parameterValues
  };
}

function findCreateTableAction(plan: AnalyzerPlan, tableName: string): AnalyzerPlanAction | undefined {
  const normalizedTarget = tableName.trim();
  return plan.actions.find(item =>
    item.action === 'create_table'
    && actionTableName(item) === normalizedTarget
  ) ?? plan.actions.find(item => item.action === 'create_table');
}

function actionTableName(action: AnalyzerPlanAction | undefined): string {
  return readString(action?.params._tableName)
    ?? readString(action?.params.tableName)
    ?? readString(action?.params.dataSource)
    ?? '';
}

function sortFromAction(action: AnalyzerPlanAction | undefined): Array<{ field: string; direction: 'asc' | 'desc' }> {
  const raw = action?.params.sort
    ?? action?.params.sorts
    ?? action?.params.sortBy
    ?? action?.params.sort_by
    ?? action?.params.orderBy
    ?? action?.params.order_by;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items.flatMap(item => {
    if (!isRecord(item)) return [];
    const field = readString(item.field) ?? readString(item.column) ?? readString(item.name);
    const direction = sortDirectionFromRecord(item);
    return field && direction ? [{ field, direction }] : [];
  });
}

function topNFromAction(action: AnalyzerPlanAction | undefined): number | undefined {
  return readPositiveInteger(
    action?.params.top_n
    ?? action?.params.topN
    ?? action?.params.limit
    ?? action?.params.rowLimit
  );
}

function fallbackSortFromColumns(
  columns: AnalyzerPlanTableDataRequest['columns'],
  direction: 'asc' | 'desc'
): Array<{ field: string; direction: 'asc' | 'desc' }> {
  const measure = columns.find(column => {
    const aggregation = column.summarize?.trim().toLowerCase();
    return aggregation && aggregation !== 'none';
  });
  return measure ? [{ field: measure.field, direction }] : [];
}

function readColumns(value: unknown): AnalyzerPlanTableDataRequest['columns'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const record = typeof item === 'string' ? { field: item } : isRecord(item) ? item : null;
    const field = readString(record?.field) ?? readString(record?.name);
    if (!field) return [];
    const label = readString(record?.label) ?? readString(record?.title);
    const summarize = readString(record?.summarize) ?? readString(record?.aggregation) ?? readString(record?.aggregationType);
    const type = readString(record?.type);
    return [{
      field,
      ...(label ? { label } : {}),
      ...(summarize ? { summarize } : {}),
      ...(type ? { type } : {})
    }];
  });
}

function calculatedFieldsFromPlan(plan: AnalyzerPlan, tableName: string): Array<{ name: string; type: 'expression'; expression: string }> {
  return plan.actions.flatMap(action => {
    if (action.action !== 'add_calculated_field') return [];
    const actionTarget = actionTableName(action);
    if (actionTarget && actionTarget !== tableName) return [];
    const name = readString(action.params.name) ?? readString(action.params.field) ?? readString(action.params.key);
    const expression = readString(action.params.expression)
      ?? readString(action.params.formula)
      ?? readString(action.params.calculation);
    return name && expression ? [{ name, type: 'expression' as const, expression }] : [];
  });
}

function parameterValuesFromAction(action: AnalyzerPlanAction | undefined): Record<string, unknown> {
  const explicit = explicitParameterValuesFromAction(action);
  const fromFilters = Object.fromEntries([
    ...filterParameterEntries(action?.params.filters),
    ...filterParameterEntries(action?.params.filter)
  ]);
  return { ...fromFilters, ...explicit };
}

function explicitParameterValuesFromAction(action: AnalyzerPlanAction | undefined): Record<string, unknown> {
  if (!isRecord(action?.params.parameterValues)) return {};
  return Object.fromEntries(
    Object.entries(action.params.parameterValues).map(([key, value]) => [key, normalizeDateLiteral(value)])
  );
}

function filterParameterEntries(value: unknown): Array<[string, unknown]> {
  const filters = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  const entries: Array<[string, unknown]> = [];
  for (const item of filters) {
    if (!isRecord(item)) continue;
    const field = readString(item.field) ?? readString(item.name);
    if (!field) continue;
    const values = Array.isArray(item.values) ? item.values : Array.isArray(item.value) ? item.value : [];
    const singleValue = item.value !== undefined && !Array.isArray(item.value) ? item.value : undefined;
    if (values.length >= 2 && isDateLike(values[0]) && isDateLike(values[1])) {
      const rangeNames = dateParameterRangeNames(field);
      entries.push([rangeNames.start, normalizeDateLiteral(values[0])]);
      entries.push([rangeNames.end, normalizeDateLiteral(values[1])]);
      continue;
    }
    if (isDateParameterField(field) && singleValue !== undefined) {
      entries.push([field, normalizeDateLiteral(singleValue)]);
      continue;
    }
    if (singleValue !== undefined) entries.push([field, normalizeDateLiteral(singleValue)]);
  }
  return entries;
}

function chartFiltersFromAction(action: AnalyzerPlanAction | undefined): Array<{ field: string; operator: string; value?: unknown }> {
  const explicitParameterValues = explicitParameterValuesFromAction(action);
  const hasDateParameters = Object.keys(explicitParameterValues).some(isDateParameterField);
  return [
    ...chartFiltersFromValue(action?.params.filters, hasDateParameters),
    ...chartFiltersFromValue(action?.params.filter, hasDateParameters)
  ];
}

function chartFiltersFromValue(
  value: unknown,
  omitDateRangeFiltersForParameterModels: boolean
): Array<{ field: string; operator: string; value?: unknown }> {
  const filters = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  return filters.flatMap(item => {
    if (!isRecord(item)) return [];
    const field = readString(item.field) ?? readString(item.name);
    if (!field || isDateParameterField(field)) return [];
    const operator = readString(item.operator) ?? defaultFilterOperator(item);
    const filterValue = chartFilterValue(item);
    if (omitDateRangeFiltersForParameterModels && operator === 'between' && Array.isArray(filterValue) && filterValue.every(isDateLike)) {
      return [];
    }
    return [{ field, operator, ...(filterValue === undefined ? {} : { value: filterValue }) }];
  });
}

function isDateParameterField(field: string): boolean {
  return DATE_PARAMETER_FIELDS.has(normalizeParameterField(field));
}

function dateParameterRangeNames(field: string): { end: string; start: string } {
  const normalized = normalizeParameterField(field);
  if (normalized === 'fromdate' || normalized === 'todate') return { start: 'fromDate', end: 'toDate' };
  if (normalized === 'startdate' || normalized === 'enddate') return { start: 'startDate', end: 'endDate' };
  if (normalized === 'start_date' || normalized === 'end_date') return { start: 'start_date', end: 'end_date' };
  if (normalized === 'datefrom' || normalized === 'dateto') return { start: 'dateFrom', end: 'dateTo' };
  return { start: 'from', end: 'to' };
}

function normalizeParameterField(field: string): string {
  return field.trim().replace(/[\s-]+/g, '_').toLowerCase();
}

function defaultFilterOperator(item: Record<string, unknown>): string {
  const values = Array.isArray(item.values) ? item.values : Array.isArray(item.value) ? item.value : [];
  return values.length >= 2 ? 'between' : 'equals';
}

function chartFilterValue(item: Record<string, unknown>): unknown {
  if (item.value !== undefined) return normalizeFilterValue(item.value);
  if (item.values !== undefined) return normalizeFilterValue(item.values);
  return undefined;
}

function normalizeFilterValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDateLiteral);
  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) normalized[key] = normalizeDateLiteral(item);
    return normalized;
  }
  return normalizeDateLiteral(value);
}

function normalizeDateLiteral(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (!match) return trimmed;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return trimmed;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(Number.isInteger(day) ? day : 1, 1), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function isDateLike(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(value.trim());
}

function labelForField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readSortDirection(value: unknown): 'asc' | 'desc' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'asc' || normalized === 'ascending') return 'asc';
  if (normalized === 'desc' || normalized === 'descending') return 'desc';
  return undefined;
}

function sortDirectionFromRecord(record: Record<string, unknown>): 'asc' | 'desc' | undefined {
  const explicit = readSortDirection(record.direction ?? record.dir ?? record.order);
  if (explicit) return explicit;
  if (record.desc === true) return 'desc';
  if (record.desc === false) return 'asc';
  if (record.ascending === true) return 'asc';
  if (record.ascending === false) return 'desc';
  return undefined;
}

function readPositiveInteger(value: unknown, max = ANALYZER_CHART_DATA_ROW_LIMIT): number | undefined {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number.parseInt(value.trim(), 10)
      : Number.NaN;
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  return Math.min(numeric, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
