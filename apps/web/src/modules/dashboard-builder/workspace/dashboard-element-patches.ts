import { visualizationSpecFromElement } from '../visualization/spec';
import type { BuilderActionPlan, Dashboard } from '../types';
import { readString } from './dashboard-agent-conversation';
import { applyCardSupportingPlanConfig } from '../agent-context/card-supporting-plan-config';

export type ElementPatch = {
  chartType?: string;
  config?: Record<string, unknown>;
  dataSourceId?: string;
  name: string;
  type: string;
};

export function selectedElementUpdatePatch(
  element: Dashboard['elements'][number],
  plan: BuilderActionPlan
): (ElementPatch & { dataSourceId?: string; layout?: Record<string, unknown> }) | null {
  const config = { ...(element.config ?? {}) };
  let appliedActionCount = 0;
  const patch: ElementPatch & { dataSourceId?: string; layout?: Record<string, unknown> } = {
    name: element.name,
    type: element.type,
    config,
    layout: { ...(element.layout ?? {}) }
  };
  if (element.chartType) patch.chartType = element.chartType;
  if (element.dataSourceId) patch.dataSourceId = element.dataSourceId;

  for (const action of plan.actions ?? []) {
    const params = action.params ?? {};
    if (action.action === 'set_chart_type') {
      const chartType = readString(params.chartType) ?? readString(params.type);
      if (chartType) {
        patch.chartType = chartType;
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_x_axis' || action.action === 'set_dimension') {
      const field = readString(params.field) ?? readString(params.xField);
      if (field) {
        config.xField = field;
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_y_axis' || action.action === 'set_measure' || action.action === 'set_metrics') {
      const fields = readStringList(params.fields ?? params.yFields ?? params.measures);
      if (fields.length > 0) {
        config.ySeries = fields;
        config.valueField = fields[0];
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_table_columns') {
      const fields = readStringList(params.columns ?? params.fields);
      if (fields.length > 0 && element.type === 'table') {
        config.columns = fields;
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_matrix_fields') {
      if (applyMatrixFields(config, params)) {
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_series_color' || action.action === 'set_line_color' || action.action === 'set_chart_color') {
      if (applyChartColor(config, readString(params.color) ?? readString(params.value), readString(params.field))) {
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_title' && params.force === true) {
      const title = readString(params.title) ?? readString(params.name);
      if (title) {
        patch.name = title;
        config.title = title;
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_text_content' && element.type === 'text') {
      const text = readString(params.text) ?? readString(params.content);
      if (text) {
        config.text = text;
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_text_presentation' && element.type === 'text') {
      if (applyTextPresentation(config, params)) appliedActionCount += 1;
    } else if (action.action === 'set_supporting_metric' && element.type === 'card') {
      const previousConfig = JSON.stringify(config);
      applyCardSupportingPlanConfig(config, params, {}, {});
      if (JSON.stringify(config) !== previousConfig) appliedActionCount += 1;
    } else if (action.action === 'set_chart_option') {
      const key = readString(params.key);
      if (key && isPrimitiveChartOption(params.value)) {
        config[key] = params.value;
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_table_sort') {
      const field = readString(params.field) ?? readString(params.sortBy);
      if (field) {
        config.sortBy = field;
        config.sortDirection = readString(params.direction) === 'asc' ? 'asc' : 'desc';
        config.enableSorting = true;
        appliedActionCount += 1;
      }
    } else if (action.action === 'set_table_total') {
      config.showTotal = params.enabled !== false;
      config.showTotals = params.enabled !== false;
      appliedActionCount += 1;
    } else if (action.action === 'set_table_format') {
      const format = readString(params.format) ?? readString(params.displayMode) ?? readString(params.style);
      if (format) {
        config.displayMode = tableDisplayModeFromFormat(format);
        config.tableStyle = format;
        appliedActionCount += 1;
      }
    } else if (action.action === 'add_calculated_field') {
      if (appendCalculatedField(config, params)) appliedActionCount += 1;
    } else if (action.action === 'add_conditional_formatting') {
      if (appendConditionalFormatting(config, params)) appliedActionCount += 1;
    }
  }

  if (appliedActionCount === 0) {
    return null;
  }
  const visualizationElement = { ...element, ...patch, config };
  config.visualization = visualizationSpecFromElement(visualizationElement);
  return patch;
}

function applyTextPresentation(config: Record<string, unknown>, params: Record<string, unknown>): boolean {
  let changed = false;
  const badge = readString(params.badge);
  const variant = readString(params.variant ?? params.textVariant);
  const tone = readString(params.tone ?? params.severity);
  if (badge) {
    config.badge = badge;
    changed = true;
  }
  if (variant === 'body' || variant === 'insight' || variant === 'section') {
    config.textVariant = variant;
    changed = true;
  }
  if (tone === 'critical' || tone === 'info' || tone === 'neutral' || tone === 'success' || tone === 'warning') {
    config.tone = tone;
    changed = true;
  }
  if (typeof params.showIcon === 'boolean') {
    config.showIcon = params.showIcon;
    changed = true;
  }
  return changed;
}

function applyChartColor(config: Record<string, unknown>, color: string | undefined, field?: string): boolean {
  if (!color) return false;
  const ySeries = readStringList(config.ySeries);
  const targetField = field || ySeries[0] || readString(config.valueField);
  if (targetField) {
    config.ySeriesColors = {
      ...(typeof config.ySeriesColors === 'object' && config.ySeriesColors !== null && !Array.isArray(config.ySeriesColors) ? config.ySeriesColors : {}),
      [targetField]: color
    };
  }
  config.color = color;
  config.colors = [color];
  return true;
}

function isPrimitiveChartOption(value: unknown): value is boolean | number | string {
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';
}

function applyMatrixFields(config: Record<string, unknown>, params: Record<string, unknown>): boolean {
  const rowFields = readStringList(params.rowFields);
  const columnFields = readStringList(params.columnFields);
  const valueFields = readStringList(params.valueFields);
  if (rowFields.length === 0 && columnFields.length === 0 && valueFields.length === 0) return false;
  if (rowFields.length > 0) config.rowFields = rowFields;
  if (columnFields.length > 0) config.columnFields = columnFields;
  if (valueFields.length > 0) config.valueFields = valueFields;
  return true;
}

function appendCalculatedField(config: Record<string, unknown>, params: Record<string, unknown>): boolean {
  const name = readString(params.name) ?? readString(params.field) ?? readString(params.key);
  const expression = readString(params.expression) ?? readString(params.formula) ?? readString(params.calculation);
  if (!name || !expression) return false;
  const current = readRecordArray(config.calculatedFields).filter(field => readString(field.name ?? field.field ?? field.key) !== name);
  config.calculatedFields = [...current, { name, expression }];
  const columns = Array.isArray(config.columns) ? [...config.columns] : [];
  if (columns.length > 0 && !columns.some(column => columnKey(column) === name)) {
    columns.push({ field: name, label: labelFromField(name), cellType: 'number' });
    config.columns = columns;
  }
  return true;
}

function appendConditionalFormatting(config: Record<string, unknown>, params: Record<string, unknown>): boolean {
  const field = readString(params.field) ?? readString(params.column) ?? readString(params.valueField);
  const operator = readString(params.operator) ?? readString(params.comparison) ?? 'equals';
  if (!field || params.value === undefined) return false;
  const rule = {
    ...params,
    field,
    operator,
    value: params.value,
    ...(readString(params.color) && !params.tone ? { tone: params.color } : {})
  };
  delete rule.source;
  config.conditionalFormatting = [...readRecordArray(config.conditionalFormatting), rule];
  return true;
}

function tableDisplayModeFromFormat(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('dense')) return 'dense';
  if (normalized.includes('compact') || normalized.includes('report') || normalized.includes('formal')) return 'compact';
  if (normalized.includes('plain')) return 'plain';
  return 'comfortable';
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.flatMap(item => typeof item === 'object' && item !== null && !Array.isArray(item) ? [item as Record<string, unknown>] : []) : [];
}

function columnKey(value: unknown): string | undefined {
  if (typeof value === 'string') return readString(value);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return readString(record.field) ?? readString(record.key) ?? readString(record.name);
}

function labelFromField(field: string): string {
  return field.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  const single = readString(value);
  return single ? [single] : [];
}
