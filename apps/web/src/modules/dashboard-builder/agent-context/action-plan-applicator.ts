import type { BuilderActionPlan, BuilderDataSource, BuilderDataTable, DataModelRecommendation, VisualizationSpec } from '../types';
import type { ElementDraft, FilterDraft } from './element-planner';
import { applyFilterActionConfig, filterDraftsFromActions } from './action-plan-filter-config';
import { defaultActionPlanLayout, defaultCardActionPlanLayout } from './action-plan-layout';
import { cardPresentationDefaults } from './card-planning-defaults';
import { applyCardSupportingPlanConfig } from './card-supporting-plan-config';
import { componentTypeFromPlan, textConfigFromAction } from './action-plan-component-config';
import { createElementDraft, titleFromPrompt } from './element-planner';
import { slugFromText } from './text-normalization';
import { normalizeChartType } from '../dashboard-element-normalization';
interface ApplyActionPlanInput {
  elementCount: number;
  plan: BuilderActionPlan | null;
  prompt: string;
  recommendation: DataModelRecommendation | null;
  source: BuilderDataSource | null;
  table: BuilderDataTable | null;
}
interface AppliedActionPlan {
  element: ElementDraft;
  filters: FilterDraft[];
}
interface PlannedColumn { field: string; summarize: string; }
export class BuilderActionPlanNoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuilderActionPlanNoopError';
  }
}
const CREATE_ACTIONS = ['create_table', 'create_chart', 'create_card', 'create_matrix', 'create_filter', 'create_text'];
export function applyBuilderActionPlan(input: ApplyActionPlanInput): AppliedActionPlan {
  const plan = input.plan;
  if (!plan) {
    return applyFallbackElementDraft(input);
  }
  if (!plan.actions?.length) throwNoopActionPlan(plan);
  const createAction = findAction(plan, CREATE_ACTIONS);
  if (!createAction) throwNoopActionPlan(plan);
  const componentType = componentTypeFromPlan(plan, createAction?.action);
  const title = readString(createAction?.params.title)
    ?? readString(findAction(plan, ['set_title'])?.params.title)
    ?? titleFromPrompt(input.prompt);
  const columns = readColumns(createAction?.params.columns);
  const dataSourceId = componentType === 'text' ? undefined : readString(createAction?.params.dataSourceId)
    ?? readString(createAction?.params._dataSourceId)
    ?? readString(asRecord(plan.params)?.dataSourceId)
    ?? input.source?.id;
  const tableName = componentType === 'text' ? undefined : readString(createAction?.params.tableName)
    ?? readString(createAction?.params._tableName)
    ?? readString(asRecord(plan.params)?.tableName)
    ?? input.table?.name;
  const dataSourceTableId = componentType === 'text' ? undefined : readString(createAction?.params.dataSourceTableId)
    ?? readString(createAction?.params._dataSourceTableId)
    ?? readString(asRecord(plan.params)?.dataSourceTableId)
    ?? input.table?.id;
  const chartType = chartTypeFromActions(plan) ?? (componentType === 'pie' ? 'pie' : undefined);
  const fieldConfig = componentType === 'text'
    ? textConfigFromAction(createAction?.params ?? {})
    : fieldConfigFromActions(plan, columns, input.table);
  const presentationConfig = componentType === 'card'
    ? cardPresentationDefaults({ config: fieldConfig, plan, prompt: input.prompt })
    : {};
  const visualization = visualizationSpecFromPlan(plan, title, chartType ?? componentType, dataSourceId, dataSourceTableId, tableName, fieldConfig, input.table);
  const layout = componentType === 'card'
    ? defaultCardActionPlanLayout(input.elementCount, presentationConfig)
    : defaultActionPlanLayout(componentType, input.elementCount);
  const bindingConfig = componentType === 'text' ? {} : {
    dataSourceId, dataSourceTableId, tableName,
    dataSourceName: input.source?.name,
    dataModelName: input.table?.dictionary?.businessName ?? tableName
  };
  const config = {
    title,
    ...bindingConfig,
    ...fieldConfig,
    ...presentationConfig,
    visualization,
    aiPlan: {
      title: plan.title,
      summary: plan.summary,
      actions: plan.actions
    }
  };
  return {
    element: {
      name: title,
      type: componentType === 'card' ? 'card' : componentType === 'matrix' ? 'matrix' : componentType === 'table' ? 'table' : componentType === 'filter' ? 'filter' : componentType === 'text' ? 'text' : 'chart',
      ...(chartType ? { chartType } : {}),
      ...(dataSourceId ? { dataSourceId } : {}),
      config,
      layout
    },
    filters: filterDraftsFromActions(plan)
  };
}
function applyFallbackElementDraft(input: ApplyActionPlanInput): AppliedActionPlan {
  return {
    element: createElementDraft(input),
    filters: []
  };
}
function throwNoopActionPlan(plan: BuilderActionPlan): never {
  throw new BuilderActionPlanNoopError(readString(findAction(plan, ['request_clarification'])?.params.message)
    ?? readString(findAction(plan, ['request_clarification'])?.params.question)
    ?? plan.message
    ?? 'Dashboard Builder action plan did not include an element create action.');
}
function visualizationSpecFromPlan(
  plan: BuilderActionPlan,
  title: string,
  kind: string,
  dataSourceId: string | undefined,
  tableId: string | undefined,
  tableName: string | undefined,
  fieldConfig: Record<string, unknown>,
  table: BuilderDataTable | null
): VisualizationSpec {
  const planned = plan.visualizations?.find(visualization => visualization.id === readString(asRecord(plan.params)?.visualizationId))
    ?? plan.visualizations?.[0];
  const xField = readString(fieldConfig.xField);
  const yFields = readStringArray(fieldConfig.ySeries);
  return {
    ...(planned ?? {
      id: `viz-${slugFromText(title, 'dashboard-element')}`,
      kind: kind === 'pie' || kind === 'line' || kind === 'bar' || kind === 'table' || kind === 'card' || kind === 'matrix' || kind === 'filter' || kind === 'text' ? kind : 'bar',
      title,
      description: `${title} generated by the Dashboard Builder agent.`,
      encodings: [
        ...(xField ? [{
          field: xField,
          label: labelForField(xField, table),
          role: dimensionRoleForField(xField, table)
        }] : []),
        ...yFields.map(field => ({
          field,
          label: labelForField(field, table),
          role: 'measure' as const,
          aggregation: 'sum' as const,
          format: formatForField(field, table)
        }))
      ],
      interactions: { tooltip: true, legend: yFields.length > 1, crossFilter: kind !== 'card', drilldown: false },
      accessibility: { label: `${title} visualization`, summary: `${title} generated from dashboard builder intent.` }
    }),
    schemaVersion: 1,
    title,
    dataRef: {
      ...(planned?.dataRef ?? {}),
      ...(dataSourceId ? { sourceId: dataSourceId } : {}),
      ...(tableId ? { tableId } : {}),
      ...(tableName ? { tableName } : {})
    },
    rendererHints: {
      requiredCapabilities: kind === 'text' ? [] : kind === 'filter' ? ['cross-filter'] : kind === 'card' ? ['single-value'] : kind === 'table' || kind === 'matrix' ? ['tabular'] : ['cartesian', 'tooltip'],
      fallback: kind === 'text' || kind === 'filter' ? 'text' : kind === 'card' ? 'card' : 'table'
    }
  };
}
function fieldConfigFromActions(
  plan: BuilderActionPlan,
  columns: PlannedColumn[],
  table: BuilderDataTable | null
): Record<string, unknown> {
  const xField = readFieldAction(plan, ['set_x_axis', 'set_dimension']);
  const ySeries = readFieldsAction(plan, ['set_y_axis', 'set_measure', 'set_metrics']);
  const valueField = readFieldAction(plan, ['set_value_field']);
  const groupByField = readFieldAction(plan, ['set_group_by_field']);
  const dimensions = columns.filter(column => column.summarize === 'none').map(column => column.field);
  const measures = columns.filter(column => column.summarize !== 'none').map(column => column.field);
  const fields = table?.fields.map(field => field.name) ?? columns.map(column => column.field);
  const resolvedValueField = valueField ?? measures[0] ?? table?.fields.find(field => field.type === 'number')?.name;
  const fieldFormats = table ? Object.fromEntries(table.fields.flatMap(field => {
    const format = formatForField(field.name, table);
    return format ? [[field.name, format]] : [];
  })) : {};
  const aggregations = Object.fromEntries(columns.flatMap(column =>
    column.summarize !== 'none' ? [[column.field, column.summarize]] : []
  ));
  const baseColumns = columns.length > 0 ? columns.map(column => column.field) : fields.slice(0, 8);
  const actionConfig = genericConfigFromActions(plan, resolvedValueField, fieldFormats, aggregations, baseColumns);
  return {
    fields,
    columns: baseColumns,
    columnSummaries: columns.length > 0 ? Object.fromEntries(columns.map(column => [column.field, column.summarize])) : {},
    xField: xField ?? groupByField ?? dimensions[0] ?? table?.fields.find(field => field.type !== 'number')?.name,
    ySeries: ySeries.length > 0 ? ySeries : measures.length > 0 ? measures : table?.fields.filter(field => field.type === 'number').map(field => field.name).slice(0, 3) ?? [],
    valueField: resolvedValueField,
    fieldRoles: table ? Object.fromEntries(table.fields.map(field => [field.name, fieldRole(field.name, table)])) : {},
    fieldFormats,
    aggregations,
    ...actionConfig
  };
}
function genericConfigFromActions(
  plan: BuilderActionPlan,
  fallbackValueField: string | undefined,
  fieldFormats: Record<string, string>,
  aggregations: Record<string, string>,
  baseColumns: string[]
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const action of plan.actions ?? []) {
    const params = action.params;
    const field = readFieldParam(params, ['field', 'valueField', 'yField']);
    if (action.action === 'set_value_field') {
      setStringValue(config, 'valueField', field);
      setStringValue(config, 'field', field);
      setStringValue(config, 'yField', field);
      const aggregation = readAggregationParam(params);
      if (aggregation) {
        config.aggregationType = aggregation;
        if (field) aggregations[field] = aggregation;
      }
    } else if (action.action === 'create_card' || action.action === 'set_supporting_metric') {
      applyCardSupportingPlanConfig(config, params, fieldFormats, aggregations);
    } else if (action.action === 'format_as_currency') {
      config.formatType = 'currency';
      const formattedField = field ?? fallbackValueField;
      if (formattedField) fieldFormats[formattedField] = 'currency';
      setStringValue(config, 'currencySymbol', readString(params.currencySymbol) ?? readString(params.symbol));
      setNumberValue(config, 'precision', params.precision ?? params.decimals ?? params.maximumFractionDigits);
    } else if (action.action === 'enable_sparkline') {
      config.showSparkline = readBoolean(params.enabled) ?? readBoolean(params.showSparkline) ?? true;
      setStringValue(config, 'sparklineField', field ?? readString(params.sparklineField) ?? fallbackValueField);
      setStringValue(config, 'sparklineColor', readString(params.color) ?? readString(params.sparklineColor));
      const showMinMaxAvg = readBoolean(params.showMinMaxAvg);
      if (showMinMaxAvg !== undefined) config.showMinMaxAvg = showMinMaxAvg;
    } else if (action.action === 'set_group_by_field') {
      setStringValue(config, 'xField', readFieldParam(params, ['field', 'groupByField', 'groupBy', 'xField']));
    } else if (action.action === 'configure_two_row_layout') {
      config.layout = readString(params.layout) ?? 'compact';
      config.layoutDesign = readString(params.layoutDesign) ?? readString(params.designLayout) ?? readString(params.mode) ?? 'value-trend-stacked';
      config.showTrend = readBoolean(params.showTrend) ?? true;
      const includeSparkline = readBoolean(params.showSparkline) ?? readBoolean(params.includeSparkline);
      if (includeSparkline !== undefined) config.showSparkline = includeSparkline;
    } else if (action.action === 'set_table_pagination') {
      config.enablePagination = readBoolean(params.enabled) ?? readBoolean(params.enablePagination) ?? true;
      setNumberValue(config, 'rowsPerPage', params.rowsPerPage ?? params.pageSize ?? params.limit);
    } else if (action.action === 'add_table_action') {
      applyTableActionConfig(config, params, baseColumns);
    } else if (action.action === 'set_matrix_fields') {
      setListValue(config, 'rowFields', params.rowFields ?? params.rows);
      setListValue(config, 'columnFields', params.columnFields ?? params.columns);
      setListValue(config, 'valueFields', params.valueFields ?? params.values ?? params.fields);
    } else if (action.action === 'set_matrix_aggregation') {
      const aggregation = readAggregationParam(params);
      const matrixField = readFieldParam(params, ['field', 'valueField', 'measure']);
      if (aggregation && matrixField) {
        const current = Array.isArray(config.valueFields) ? config.valueFields : [];
        config.valueFields = current.length > 0
          ? current.map(item => columnKey(item) === matrixField ? { ...(asRecord(item) ?? { field: matrixField }), aggregation } : item)
          : [{ field: matrixField, aggregation }];
        config.aggregations = { ...aggregations, ...(asRecord(config.aggregations) ?? {}), [matrixField]: aggregation };
      }
    } else if (action.action === 'create_filter' || action.action === 'add_filter') {
      applyFilterActionConfig(config, params);
    }
  }
  return config;
}
function applyTableActionConfig(config: Record<string, unknown>, params: Record<string, unknown>, baseColumns: string[]): void {
  const actionId = readString(params.actionId) ?? readString(params.id) ?? readString(params.name) ?? readString(params.action) ?? readString(params.key);
  if (!actionId) return;
  const action = { actionId, label: readString(params.label) ?? readString(params.title) ?? labelForField(actionId, null) };
  const columns = Array.isArray(config.columns) ? [...config.columns] : [...baseColumns];
  const field = readFieldParam(params, ['field', 'column', 'columnField', 'columnKey']);
  const index = field ? columns.findIndex(column => columnKey(column) === field) : -1;
  if (index >= 0 && field) {
    const column: Record<string, unknown> = asRecord(columns[index]) ? { ...asRecord(columns[index]) } : { field, label: labelForField(field, null) };
    column.actions = [...readObjectArray(column.actions), action];
    columns[index] = column;
  } else {
    columns.push({ field: field ?? 'actions', label: readString(params.columnLabel) ?? 'Actions', cellType: 'actions', actions: [action] });
  }
  config.columns = columns;
}
function chartTypeFromActions(plan: BuilderActionPlan): string | undefined {
  const planned = readString(findAction(plan, ['set_chart_type'])?.params.chartType)
    ?? readString(findAction(plan, ['create_chart'])?.params.chartType)
    ?? readString(findAction(plan, ['create_chart'])?.params.visualizationKind);
  return normalizeChartType(planned)
    ?? normalizeChartType(plan.componentType)
    ?? normalizeChartType(plan.params?.visualizationKind);
}
function readFieldAction(plan: BuilderActionPlan, names: string[]): string | undefined {
  const params = findAction(plan, names)?.params;
  return readString(params?.field) ?? readString(params?.xField) ?? readString(params?.valueField);
}
function readFieldsAction(plan: BuilderActionPlan, names: string[]): string[] {
  const params = findAction(plan, names)?.params;
  return readStringArray(params?.fields ?? params?.yFields ?? params?.series ?? params?.field);
}
function readColumns(value: unknown): PlannedColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [{ field: item.trim(), summarize: 'none' }];
    const record = asRecord(item);
    const field = readString(record?.field) ?? readString(record?.name);
    if (!field) return [];
    return [{ field, summarize: readString(record?.summarize) ?? 'none' }];
  });
}
function findAction(plan: BuilderActionPlan, names: string[]): { action: string; params: Record<string, unknown> } | undefined {
  return plan.actions?.find(action => names.includes(action.action));
}
function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : []);
  const single = readString(value);
  return single ? [single] : [];
}
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function readBoolean(value: unknown): boolean | undefined { return typeof value === 'boolean' ? value : undefined; }
function readNumber(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function asRecord(value: unknown): Record<string, unknown> | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function readFieldParam(params: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readString(params[key]);
    if (value) return value;
  }
  return undefined;
}
function readAggregationParam(params: Record<string, unknown>): string | undefined {
  const value = readString(params.aggregation) ?? readString(params.summarize) ?? readString(params.aggregationType);
  return value === 'sum' || value === 'avg' || value === 'count' || value === 'first' || value === 'last' || value === 'max' || value === 'min'
    ? value
    : undefined;
}
function setStringValue(config: Record<string, unknown>, key: string, value: string | undefined): void { if (value) config[key] = value; }
function setNumberValue(config: Record<string, unknown>, key: string, value: unknown): void {
  const numberValue = readNumber(value); if (numberValue !== undefined) config[key] = numberValue;
}
function setListValue(config: Record<string, unknown>, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    const items = value.filter(item => typeof item === 'string' && item.trim() || asRecord(item));
    if (items.length > 0) config[key] = items;
    return;
  }
  const single = readString(value);
  if (single) config[key] = [single];
}
function readObjectArray(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.flatMap(item => asRecord(item) ? [item] : []) : []; }
function columnKey(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof value === 'string' ? readString(value) : readString(record?.field) ?? readString(record?.key) ?? readString(record?.name);
}
function labelForField(field: string, table: BuilderDataTable | null): string {
  const metadata = fieldMetadata(table, field);
  return readString(metadata.label)
    ?? readString(metadata.businessName)
    ?? field.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
function dimensionRoleForField(field: string, table: BuilderDataTable | null): 'dimension' | 'time' {
  return fieldRole(field, table) === 'time' ? 'time' : 'dimension';
}
function formatForField(field: string, table: BuilderDataTable | null): 'currency' | 'number' | 'percentage' {
  const metadata = fieldMetadata(table, field);
  const format = readString(metadata.format) ?? readString(metadata.unit);
  if (format === 'currency' || format === 'number' || format === 'percentage') return format;
  return 'number';
}
function fieldRole(field: string, table: BuilderDataTable | null): string {
  const metadata = fieldMetadata(table, field);
  const explicit = readString(metadata.columnType)
    ?? readString(metadata.role)
    ?? readString(metadata.semanticRole)
    ?? table?.fields.find(item => item.name === field)?.columnType
    ?? table?.fields.find(item => item.name === field)?.role
    ?? table?.fields.find(item => item.name === field)?.semanticRole;
  if (explicit === 'time' || explicit === 'date') return 'time';
  if (explicit === 'measure' || explicit === 'metric') return 'measure';
  if (explicit === 'dimension' || explicit === 'attribute' || explicit === 'filter') return 'dimension';
  const type = table?.fields.find(item => item.name === field)?.type;
  if (type === 'date' || type === 'datetime' || type === 'timestamp') return 'time';
  if (type === 'number' || type === 'integer' || type === 'decimal') return 'measure';
  return 'dimension';
}
function fieldMetadata(table: BuilderDataTable | null, fieldName: string): Record<string, unknown> {
  const dictionary = table?.dictionary;
  const candidates = [dictionary?.fields, dictionary?.columns, dictionary?.ai?.fields, dictionary?.ai?.columns];
  for (const candidate of candidates) {
    const metadata = metadataFromCollection(candidate, fieldName);
    if (metadata) return metadata;
  }
  const field = table?.fields.find(item => item.name === fieldName);
  return field ? { ...field } : {};
}
function metadataFromCollection(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const match = value.find(item => asRecord(item)?.name === fieldName);
    return asRecord(match) ?? null;
  }
  const record = asRecord(value);
  const metadata = record ? asRecord(record[fieldName]) : undefined;
  return metadata ?? null;
}
