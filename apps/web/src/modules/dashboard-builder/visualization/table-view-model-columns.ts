import { labelFor, type MetricFormat } from './formatting';
import { displayConfigPatch } from './table-cell-formatting';
import type { TableRuntimeContext } from './table-view-model-types';
import {
  alignPatch,
  colorPatch,
  formatPatch,
  numberPatch,
  numberValue,
  readColumnFormat,
  readCssColor,
  sortablePatch,
  totalAggregationPatch,
  widthPatch
} from './table-view-model-format-utils';
import { dimensionEncoding, measureEncodings } from './spec';
import { isRecord, readBoolean, readString } from './view-model-config';
import { readCssLength } from './view-model-runtime';
import type {
  DashboardTableAction,
  DashboardTableBulletRange,
  DashboardTableCellConfig,
  DashboardTableCellLinkConfig,
  DashboardTableCellType,
  DashboardTableColumn
} from './view-model-types';
import type { DashboardElement, VisualizationSpec } from '../types';

export function tableColumns(spec: VisualizationSpec, element?: DashboardElement): DashboardTableColumn[] {
  const config = element?.config ?? {};
  const configured = configuredColumnDefinitions(element);
  if (configured.length > 0) return configured.map(column => tableColumnRuntimeOptions(column, config));
  const dimension = dimensionEncoding(spec);
  const measures = measureEncodings(spec);
  const baseColumns: DashboardTableColumn[] = [
    { key: dimension?.field ?? 'label', label: dimension?.label ?? labelFor(dimension?.field ?? 'Label'), cellType: 'text' },
    ...measures.map(measure => ({
      key: measure.field,
      label: measure.label ?? labelFor(measure.field),
      cellType: 'text' as const,
      ...formatPatch(measure.format)
    }))
  ];
  return baseColumns.map(column => tableColumnRuntimeOptions(column, config));
}

export function configuredColumnDefinitions(element?: DashboardElement): DashboardTableColumn[] {
  const columns = element?.config?.columns;
  if (!Array.isArray(columns)) return [];
  return columns.flatMap(column => {
    if (typeof column === 'string' && column.trim()) return [{ key: column.trim(), label: labelFor(column.trim()), cellType: 'text' as const }];
    if (!isRecord(column)) return [];
    const key = readString(column.field) ?? readString(column.key) ?? readString(column.name);
    if (!key) return [];
    const cellType = readCellType(column.cellType);
    const format = readColumnFormat(column.format ?? column.formatType)
      ?? defaultFormatForCellType(cellType)
      ?? formatForCellType(column.cellType);
    const definition: DashboardTableColumn = {
      key,
      label: readString(column.label) ?? labelFor(key),
      cellType,
      ...alignPatch(column.align),
      ...actionsPatch(column.actions ?? column.buttons ?? column.rowActions),
      ...cellConfigPatch(column),
      ...displayConfigPatch(column),
      ...linkPatch(column),
      ...numberPatch('maxValue', column.maxValue),
      ...numberPatch('target', column.target),
      ...runtimeOverridesPatch(column),
      ...sortablePatch(column.sortable),
      ...totalAggregationPatch(column.totalAggregation ?? column.aggregation ?? column.aggregationType),
      ...widthPatch(column.width ?? column.headerWidth),
      ...formatPatch(format)
    };
    return [definition];
  });
}

export function tableColumnRuntimeOptions(
  column: DashboardTableColumn,
  config: Record<string, unknown>
): DashboardTableColumn {
  const tableSortingEnabled = readBoolean(config.enableSorting);
  const columnSortable = tableSortingEnabled === false
    ? false
    : column.sortable ?? tableSortingEnabled;
  return {
    ...column,
    ...widthPatch(column.width ?? readColumnWidth(config, column.key)),
    ...sortablePatch(columnSortable)
  };
}

export function applyColumnRuntimeOverrides(
  columns: DashboardTableColumn[],
  runtimeContext: TableRuntimeContext
): DashboardTableColumn[] {
  return columns.map(column => applyColumnRuntimeOverride(column, runtimeContext));
}

function applyColumnRuntimeOverride(
  column: DashboardTableColumn,
  runtimeContext: TableRuntimeContext
): DashboardTableColumn {
  const overrides = column.runtimeOverrides;
  if (!isRecord(overrides)) return column;
  const label = runtimeTextOverride(overrides.labels ?? overrides.label ?? overrides.labelByValue ?? overrides.labelByParameter, overrides, runtimeContext);
  const dateFormat = runtimeTextOverride(overrides.dateFormats ?? overrides.dateFormat ?? overrides.dateFormatByValue ?? overrides.dateFormatByParameter, overrides, runtimeContext);
  const displayConfig = runtimeRecordOverride(overrides.displayConfig ?? overrides.displayConfigByValue ?? overrides.displayConfigByParameter, overrides, runtimeContext);
  if (!label && !dateFormat && !displayConfig) return column;
  return {
    ...column,
    ...(label ? { label } : {}),
    ...((dateFormat || displayConfig)
      ? {
        displayConfig: {
          ...(column.displayConfig ?? {}),
          ...(displayConfig ?? {}),
          ...(dateFormat ? { dateFormat } : {})
        }
      }
      : {})
  };
}

function readCellType(value: unknown): DashboardTableCellType {
  if (value === 'bar') return 'bar-in-cell';
  if (value === 'number' || value === 'currency') return 'text';
  if (
    value === 'actions'
    || value === 'advanced-sparkline'
    || value === 'bar-in-cell'
    || value === 'bullet-chart'
    || value === 'progress'
    || value === 'badge'
    || value === 'sparkline'
    || value === 'delta'
    || value === 'moving-average'
    || value === 'running-total'
    || value === 'percent-of-total'
    || value === 'yoy-change'
    || value === 'mom-change'
    || value === 'trend-indicator'
  ) return value;
  return 'text';
}

function defaultFormatForCellType(cellType: DashboardTableCellType): MetricFormat | undefined {
  if (cellType === 'percent-of-total' || cellType === 'yoy-change' || cellType === 'mom-change') return 'percentage';
  if (cellType === 'moving-average' || cellType === 'running-total') return 'number';
  return undefined;
}

function formatForCellType(value: unknown): MetricFormat | undefined {
  if (value === 'number') return 'number';
  if (value === 'currency') return 'currency';
  return undefined;
}

function actionsPatch(value: unknown): Pick<DashboardTableColumn, 'actions'> {
  const actions = readTableActions(value);
  return actions.length > 0 ? { actions } : {};
}

function linkPatch(column: Record<string, unknown>): Pick<DashboardTableColumn, 'link'> {
  const rawLink = column.link ?? column.cellLink ?? column.href ?? column.hrefTemplate ?? column.urlTemplate ?? column.linkTemplate;
  const link = readTableCellLink(rawLink, column);
  return link ? { link } : {};
}

function runtimeOverridesPatch(column: Record<string, unknown>): Pick<DashboardTableColumn, 'runtimeOverrides'> {
  const runtimeOverrides = column.runtimeOverrides ?? column.runtime ?? column.dynamicColumn ?? column.dynamic ?? column.parameterOverrides;
  return isRecord(runtimeOverrides) ? { runtimeOverrides } : {};
}

function cellConfigPatch(column: Record<string, unknown>): Pick<DashboardTableColumn, 'cellConfig'> {
  const cellConfig: DashboardTableCellConfig = {
    ...badgeMappingPatch(column.badgeMapping ?? column.badgeMap ?? column.badges),
    ...colorPatch('barColor', column.customBarColor ?? column.barColor),
    ...colorPatch('progressColor', column.progressColor),
    ...colorPatch('sparklineColor', column.chartColor ?? column.sparklineColor ?? column.color),
    ...bulletRangesPatch(column.ranges ?? column.bulletRanges),
    ...deltaConfigPatch(column),
    ...sparklineConfigPatch(column)
  };
  return Object.keys(cellConfig).length > 0 ? { cellConfig } : {};
}

function readTableCellLink(value: unknown, column: Record<string, unknown>): DashboardTableCellLinkConfig | undefined {
  if (typeof value === 'string') {
    const hrefTemplate = value.trim();
    return hrefTemplate ? { hrefTemplate, ...linkTargetPatch(column.linkTarget ?? column.targetMode ?? column.openIn) } : undefined;
  }
  if (!isRecord(value)) return undefined;
  const hrefTemplate = readString(value.hrefTemplate ?? value.template ?? value.href ?? value.url ?? value.urlTemplate);
  if (!hrefTemplate) return undefined;
  const ariaLabelTemplate = readString(value.ariaLabelTemplate ?? value.ariaLabel ?? value.labelTemplate);
  const rel = readString(value.rel);
  return {
    hrefTemplate,
    ...(ariaLabelTemplate ? { ariaLabelTemplate } : {}),
    ...(rel ? { rel } : {}),
    ...linkTargetPatch(value.target ?? value.openIn)
  };
}

function linkTargetPatch(value: unknown): Pick<DashboardTableCellLinkConfig, 'target'> {
  if (value === '_self' || value === 'self') return { target: '_self' };
  if (value === '_parent' || value === 'parent') return { target: '_parent' };
  if (value === '_top' || value === 'top') return { target: '_top' };
  if (value === '_blank' || value === 'blank' || value === 'new-tab' || value === 'new_tab') return { target: '_blank' };
  return {};
}

function badgeMappingPatch(value: unknown): Pick<DashboardTableCellConfig, 'badgeMapping'> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).flatMap(([key, item]) => {
    const mapped = readString(item) ?? (isRecord(item) ? readString(item.className ?? item.class ?? item.color ?? item.tone) : undefined);
    return mapped ? [[key, mapped] as const] : [];
  });
  return entries.length > 0 ? { badgeMapping: Object.fromEntries(entries) } : {};
}

function bulletRangesPatch(value: unknown): Pick<DashboardTableCellConfig, 'bulletRanges'> {
  if (!Array.isArray(value)) return {};
  const ranges = value.flatMap(item => {
    if (!isRecord(item)) return [];
    const max = numberValue(item.max);
    const color = readCssColor(item.color);
    const min = numberValue(item.min);
    return max === undefined || !color ? [] : [{ max, color, ...(min === undefined ? {} : { min }) } as DashboardTableBulletRange];
  }).sort((left, right) => left.max - right.max);
  return ranges.length > 0 ? { bulletRanges: ranges } : {};
}

function deltaConfigPatch(column: Record<string, unknown>): Pick<DashboardTableCellConfig, 'deltaColorScheme' | 'deltaCompareField' | 'deltaDisplayMode' | 'showDeltaArrow'> {
  const displayMode = column.deltaDisplayMode === 'absolute' || column.deltaDisplayMode === 'percentage' || column.deltaDisplayMode === 'both' ? column.deltaDisplayMode : undefined;
  const compareField = readString(column.deltaCompareField ?? column.compareField ?? column.comparisonField);
  const scheme = readString(column.deltaColorScheme);
  return {
    ...(scheme ? { deltaColorScheme: scheme } : {}),
    ...(compareField ? { deltaCompareField: compareField } : {}),
    ...(displayMode ? { deltaDisplayMode: displayMode } : {}),
    ...(typeof column.showDeltaArrow === 'boolean' ? { showDeltaArrow: column.showDeltaArrow } : {})
  };
}

function sparklineConfigPatch(column: Record<string, unknown>): Pick<DashboardTableCellConfig, 'showArea' | 'showDots' | 'showMinMaxAvg' | 'sparklineFields' | 'sparklineSize'> {
  const fields = Array.isArray(column.sparklineFields) ? column.sparklineFields.flatMap(field => readString(field) ?? []) : [];
  const size = column.sparklineSize === 'small' || column.sparklineSize === 'medium' || column.sparklineSize === 'large' ? column.sparklineSize : undefined;
  return {
    ...(fields.length > 0 ? { sparklineFields: fields } : {}),
    ...(size ? { sparklineSize: size } : {}),
    ...(typeof column.showArea === 'boolean' ? { showArea: column.showArea } : {}),
    ...(typeof column.showDots === 'boolean' ? { showDots: column.showDots } : {}),
    ...(typeof column.showMinMaxAvg === 'boolean' ? { showMinMaxAvg: column.showMinMaxAvg } : {})
  };
}

function readTableActions(value: unknown): DashboardTableAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string') {
      const actionId = item.trim();
      return actionId ? [{ actionId, label: labelFor(actionId) }] : [];
    }
    if (!isRecord(item)) return [];
    const actionId = readString(item.actionId) ?? readString(item.id) ?? readString(item.name) ?? readString(item.action) ?? readString(item.key);
    if (!actionId) return [];
    return [{ actionId, label: readString(item.label) ?? readString(item.title) ?? readString(item.text) ?? labelFor(actionId) }];
  });
}

function runtimeTextOverride(
  value: unknown,
  fallback: Record<string, unknown>,
  runtimeContext: TableRuntimeContext
): string | undefined {
  const mapped = runtimeOverrideValue(value, fallback, runtimeContext);
  return typeof mapped === 'string' && mapped.trim().length > 0 ? mapped : undefined;
}

function runtimeRecordOverride(
  value: unknown,
  fallback: Record<string, unknown>,
  runtimeContext: TableRuntimeContext
): Record<string, unknown> | undefined {
  const mapped = runtimeOverrideValue(value, fallback, runtimeContext);
  return isRecord(mapped) ? mapped : undefined;
}

function runtimeOverrideValue(
  value: unknown,
  fallback: Record<string, unknown>,
  runtimeContext: TableRuntimeContext
): unknown {
  if (!isRecord(value)) return undefined;
  const parameter = readString(value.parameter ?? value.param ?? value.field ?? fallback.parameter ?? fallback.param ?? fallback.field);
  if (!parameter) return undefined;
  const parameterValue = runtimeParameterValue(runtimeContext, parameter);
  if (parameterValue === undefined || parameterValue === null) return value.default ?? value.fallback;
  const values = isRecord(value.values) ? value.values : value;
  return runtimeMapValue(values, parameterValue) ?? value.default ?? value.fallback;
}

function runtimeParameterValue(runtimeContext: TableRuntimeContext, parameter: string): unknown {
  const values = runtimeContext.parameterValues ?? {};
  if (parameter in values) return values[parameter];
  const lower = parameter.toLowerCase();
  if (lower in values) return values[lower];
  const match = Object.keys(values).find(key => key.toLowerCase() === lower);
  return match ? values[match] : undefined;
}

function runtimeMapValue(values: Record<string, unknown>, parameterValue: unknown): unknown {
  const key = String(parameterValue);
  if (key in values) return values[key];
  const lower = key.toLowerCase();
  if (lower in values) return values[lower];
  const match = Object.keys(values).find(candidate => candidate.toLowerCase() === lower);
  return match ? values[match] : undefined;
}

function readColumnWidth(config: Record<string, unknown>, key: string): string | undefined {
  const widths = config.columnWidths ?? config.headerWidths;
  if (!isRecord(widths)) return undefined;
  return readCssLength(widths[key]);
}
