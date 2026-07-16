import type {
  BuilderAgentRequest,
  BuilderAgentResult
} from '@intraq/contracts';
import {
  asNonEmptyString,
  asStringArray,
  coalesceStringArrays,
  isRecord,
  parseComponentType,
  readCalculatedFieldArgs,
  readRecordArray
} from './dashboard-builder-agent-values.js';
import {
  normalizeDashboardBuilderFieldName,
  normalizeDashboardBuilderFieldNames
} from './dashboard-builder-field-normalizer.js';

export function hasSelectedComponentUpdateSelection(args: Record<string, unknown>): boolean {
  const scalarKeys = [
    'chartType',
    'badge',
    'color',
    'dimension',
    'tableFormat',
    'targetField',
    'text',
    'textVariant',
    'title',
    'tone',
    'valueField',
    'xField'
  ];
  if (scalarKeys.some(key => asNonEmptyString(args[key]))) return true;
  if (
    asStringArray(args.columns).length > 0
    || asStringArray(args.columnFields).length > 0
    || asStringArray(args.measures).length > 0
    || asStringArray(args.rowFields).length > 0
    || asStringArray(args.valueFields).length > 0
    || asStringArray(args.yFields).length > 0
  ) {
    return true;
  }
  const options = isRecord(args.options) ? args.options : {};
  if (Object.keys(options).length > 0) return true;
  const supportingMetric = isRecord(args.supportingMetric) ? args.supportingMetric : {};
  if (Object.keys(supportingMetric).length > 0) return true;
  const tableSort = isRecord(args.tableSort) ? args.tableSort : null;
  if (tableSort && asNonEmptyString(tableSort.field)) return true;
  return typeof args.showIcon === 'boolean'
    || typeof args.showTotals === 'boolean'
    || readCalculatedFieldArgs(args.calculatedFields).length > 0
    || readRecordArray(args.conditionalFormatting).length > 0;
}

export function selectedComponentStyleUpdateResult(
  request: BuilderAgentRequest,
  args: Record<string, unknown>
): BuilderAgentResult {
  const actions: BuilderAgentResult['actions'] = [];
  const color = asNonEmptyString(args.color);
  const targetField = normalizeDashboardBuilderFieldName(request, asNonEmptyString(args.targetField));
  const seriesColors = isRecord(args.seriesColors) ? args.seriesColors : {};
  for (const [field, seriesColor] of Object.entries(seriesColors)) {
    const resolvedColor = asNonEmptyString(seriesColor);
    const normalizedField = normalizeDashboardBuilderFieldName(request, field);
    if (normalizedField && resolvedColor) {
      actions.push({
        action: 'set_series_color',
        params: { color: resolvedColor, field: normalizedField, source: 'ai_update_tool' }
      });
    }
  }
  if (color) {
    actions.push({
      action: 'set_series_color',
      params: {
        color,
        ...(targetField ? { field: targetField } : {}),
        source: 'ai_update_tool'
      }
    });
  }
  const chartType = asNonEmptyString(args.chartType);
  if (chartType) {
    actions.push({
      action: 'set_chart_type',
      params: { chartType, source: 'ai_update_tool' }
    });
  }
  const title = asNonEmptyString(args.title);
  if (title) {
    actions.push({
      action: 'set_title',
      params: { force: true, source: 'ai_update_tool', title }
    });
  }
  const text = asNonEmptyString(args.text);
  if (text) {
    actions.push({
      action: 'set_text_content',
      params: { source: 'ai_update_tool', text }
    });
  }
  const textVariant = readTextVariant(args.textVariant);
  const tone = readTextTone(args.tone);
  const badge = asNonEmptyString(args.badge);
  if (textVariant || tone || badge || typeof args.showIcon === 'boolean') {
    actions.push({
      action: 'set_text_presentation',
      params: {
        ...(badge ? { badge } : {}),
        ...(typeof args.showIcon === 'boolean' ? { showIcon: args.showIcon } : {}),
        source: 'ai_update_tool',
        ...(textVariant ? { variant: textVariant } : {}),
        ...(tone ? { tone } : {})
      }
    });
  }
  const xField = normalizeDashboardBuilderFieldName(
    request,
    asNonEmptyString(args.xField) ?? asNonEmptyString(args.dimension)
  );
  if (xField) {
    actions.push({
      action: 'set_x_axis',
      params: { field: xField, source: 'ai_update_tool' }
    });
  }
  const yFields = coalesceStringArrays(args.yFields, args.measures);
  const valueField = normalizeDashboardBuilderFieldName(request, asNonEmptyString(args.valueField));
  const measureFields = yFields.length > 0 ? yFields : valueField ? [valueField] : [];
  if (measureFields.length > 0) {
    actions.push({
      action: 'set_y_axis',
      params: { fields: normalizeDashboardBuilderFieldNames(request, measureFields), source: 'ai_update_tool' }
    });
  }
  const columns = normalizeDashboardBuilderFieldNames(request, asStringArray(args.columns));
  if (columns.length > 0) {
    actions.push({
      action: 'set_table_columns',
      params: { columns, source: 'ai_update_tool' }
    });
  }
  const rowFields = normalizeDashboardBuilderFieldNames(request, asStringArray(args.rowFields));
  const columnFields = normalizeDashboardBuilderFieldNames(request, asStringArray(args.columnFields));
  const valueFields = normalizeDashboardBuilderFieldNames(request, asStringArray(args.valueFields));
  if (rowFields.length > 0 || columnFields.length > 0 || valueFields.length > 0) {
    actions.push({
      action: 'set_matrix_fields',
      params: {
        ...(rowFields.length > 0 ? { rowFields } : {}),
        ...(columnFields.length > 0 ? { columnFields } : {}),
        ...(valueFields.length > 0 ? { valueFields } : {}),
        source: 'ai_update_tool'
      }
    });
  }
  const supportingMetric = isRecord(args.supportingMetric) ? args.supportingMetric : null;
  if (supportingMetric) {
    const supportingField = normalizeDashboardBuilderFieldName(request, asNonEmptyString(supportingMetric.field));
    actions.push({
      action: 'set_supporting_metric',
      params: {
        ...(supportingField ? { supportingField } : {}),
        ...(asNonEmptyString(supportingMetric.aggregation) ? { supportingAggregation: asNonEmptyString(supportingMetric.aggregation) } : {}),
        ...(asNonEmptyString(supportingMetric.format) ? { supportingFormat: asNonEmptyString(supportingMetric.format) } : {}),
        ...(asNonEmptyString(supportingMetric.label) ? { supportingLabel: asNonEmptyString(supportingMetric.label) } : {}),
        ...(typeof supportingMetric.precision === 'number' ? { supportingPrecision: supportingMetric.precision } : {}),
        ...(asNonEmptyString(supportingMetric.tone) ? { supportingTone: asNonEmptyString(supportingMetric.tone) } : {}),
        source: 'ai_update_tool'
      }
    });
  }
  const options = isRecord(args.options) ? args.options : {};
  for (const [key, value] of Object.entries(options)) {
    if (key.trim() && (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string')) {
      actions.push({
        action: 'set_chart_option',
        params: { key, source: 'ai_update_tool', value }
      });
    }
  }
  const tableSort = isRecord(args.tableSort) ? args.tableSort : null;
  const tableSortField = tableSort ? asNonEmptyString(tableSort.field) : null;
  if (tableSortField) {
    actions.push({
      action: 'set_table_sort',
      params: {
        direction: asNonEmptyString(tableSort?.direction) === 'asc' ? 'asc' : 'desc',
        field: normalizeDashboardBuilderFieldName(request, tableSortField) ?? tableSortField,
        source: 'ai_update_tool'
      }
    });
  }
  const tableFormat = asNonEmptyString(args.tableFormat);
  if (tableFormat) {
    actions.push({
      action: 'set_table_format',
      params: { format: tableFormat, source: 'ai_update_tool' }
    });
  }
  if (typeof args.showTotals === 'boolean') {
    actions.push({
      action: 'set_table_total',
      params: { enabled: args.showTotals, source: 'ai_update_tool' }
    });
  }
  for (const field of readCalculatedFieldArgs(args.calculatedFields)) {
    actions.push({
      action: 'add_calculated_field',
      params: { ...field, source: 'ai_update_tool' }
    });
  }
  for (const rule of readRecordArray(args.conditionalFormatting)) {
    const ruleField = normalizeDashboardBuilderFieldName(request, asNonEmptyString(rule.field));
    actions.push({
      action: 'add_conditional_formatting',
      params: { ...rule, ...(ruleField ? { field: ruleField } : {}), source: 'ai_update_tool' }
    });
  }

  if (actions.length === 0) {
    actions.push({
      action: 'request_clarification',
      params: {
        message: 'I need to know which visual setting to change on the selected component.'
      }
    });
  }

  const componentType = parseComponentType(request.componentType) ?? 'chart';
  const summary = asNonEmptyString(args.summary) ?? 'Updated the selected component.';
  return {
    type: 'action-plan',
    workflow: 'dashboard-builder',
    mode: 'update',
    componentType,
    message: request.prompt,
    title: 'Update selected component',
    summary,
    actions,
    params: {
      element: {
        clientElementId: request.elementId ?? 'selected-component',
        ...(request.dashboardId ? { dashboardId: request.dashboardId } : {}),
        ...(request.elementId ? { elementId: request.elementId } : {})
      }
    },
    visualizations: [],
    knowledgeReferences: []
  };
}

function readTextTone(value: unknown): 'critical' | 'info' | 'neutral' | 'success' | 'warning' | null {
  return value === 'critical' || value === 'info' || value === 'neutral' || value === 'success' || value === 'warning'
    ? value
    : null;
}

function readTextVariant(value: unknown): 'body' | 'insight' | 'section' | null {
  return value === 'body' || value === 'insight' || value === 'section' ? value : null;
}
