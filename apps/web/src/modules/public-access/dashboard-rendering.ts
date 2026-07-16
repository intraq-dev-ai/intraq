import { filterRows } from './dashboard-filtering';
import {
  formatCellValue,
  formatMetricValue,
  isPresent,
  isRecord,
  labelFor,
  readNumeric,
  readPositiveInteger,
  readString
} from './dashboard-values';
import type {
  EmbedDashboardElement,
  EmbedDashboardFilter,
  EmbedDashboardFilterValue,
  EmbedDataSource,
  EmbedDataSourcePreview,
  PublicChartDataset
} from './types';

export type PublicTileKind = 'card' | 'chart' | 'chatbot' | 'matrix' | 'news' | 'table';

export interface PublicTableColumn {
  key: string;
  label: string;
}

export interface PublicCardMetric {
  helper: string;
  label: string;
  value: string;
}

export interface PublicMatrixModel {
  columns: string[];
  rows: Array<{ cells: string[]; key: string; label: string; total: string }>;
  rowHeader: string;
  valueLabel: string;
}

export interface PublicChartModel {
  datasets: PublicChartDataset[];
  labels: string[];
  stacked: boolean;
  type: 'bar' | 'line' | 'pie';
}

export interface PublicTileModel {
  cardMetrics: PublicCardMetric[];
  chart: PublicChartModel;
  columns: PublicTableColumn[];
  dataLimit: number;
  element: EmbedDashboardElement;
  hasRenderableContent: boolean;
  kind: PublicTileKind;
  matrix: PublicMatrixModel | null;
  preview: EmbedDataSourcePreview | null;
  rows: Array<Record<string, unknown>>;
  sourceId: string | null;
}

interface BuildTilesInput {
  dataSources: EmbedDataSource[];
  elements: EmbedDashboardElement[];
  filters: EmbedDashboardFilter[];
  filterValues: EmbedDashboardFilterValue[];
  previews: EmbedDataSourcePreview[];
}

export function buildPublicDashboardTiles(input: BuildTilesInput): PublicTileModel[] {
  return input.elements.map(element => buildTileModel(element, input));
}

export function tileStyle(element: EmbedDashboardElement): Record<string, string> {
  const width = Math.min(Math.max(element.layout.w ?? 4, 3), 12);
  const height = Math.min(Math.max(element.layout.h ?? 3, 2), 8);
  const style: Record<string, string> = {
    gridColumn: `span ${width}`,
    gridRow: `span ${height}`
  };
  if (typeof element.layout.x === 'number' && element.layout.x >= 0) {
    style.gridColumn = `${Math.min(element.layout.x + 1, 12)} / span ${width}`;
  }
  if (typeof element.layout.y === 'number' && element.layout.y >= 0) {
    style.gridRow = `${element.layout.y + 1} / span ${height}`;
  }
  return style;
}

function buildTileModel(element: EmbedDashboardElement, input: BuildTilesInput): PublicTileModel {
  const source = findSource(element, input.dataSources);
  const preview = findPreview(element, source, input.previews);
  const sourceRows = preview?.rows ?? [];
  const rows = filterRows(sourceRows, input.filters, input.filterValues);
  const columns = tableColumns(element, source, preview, rows.length > 0 ? rows : sourceRows);
  const labelField = configuredField(element.config, ['xField', 'labelField', 'categoryField', 'dimensionField'])
    ?? columns[0]?.key
    ?? 'label';
  const valueFields = metricFields(element, rows.length > 0 ? rows : sourceRows, columns);
  const kind = tileKind(element);
  const cardMetrics = buildCardMetrics(element, rows, valueFields);
  const chart = buildChartModel(element, rows, labelField, valueFields);
  const matrix = buildMatrixModel(element, rows, columns, labelField, valueFields);
  return {
    cardMetrics,
    chart,
    columns,
    dataLimit: tileDataLimit(kind),
    element,
    hasRenderableContent: rows.length > 0 || cardMetrics.length > 0,
    kind,
    matrix,
    preview,
    rows,
    sourceId: source?.id ?? null
  };
}

function findPreview(
  element: EmbedDashboardElement,
  source: EmbedDataSource | null,
  previews: EmbedDataSourcePreview[]
): EmbedDataSourcePreview | null {
  const keys = elementSourceKeys(element);
  const tableName = configuredField(element.config, ['tableName']);
  if (source) {
    const preview = previews.find(item => {
      return item.sourceId === source.id
        || item.sourceId === source.dataSourceId
        || Boolean(tableName && item.tableName === tableName);
    });
    if (preview) return preview;
  }
  return previews.find(preview => keys.has(preview.sourceId) || keys.has(preview.tableName)) ?? null;
}

function findSource(element: EmbedDashboardElement, dataSources: EmbedDataSource[]): EmbedDataSource | null {
  const keys = elementSourceKeys(element);
  return dataSources.find(item => sourceKeys(item).some(key => keys.has(key))) ?? null;
}

function elementSourceKeys(element: EmbedDashboardElement): Set<string> {
  return new Set([
    element.dataSourceId,
    configuredField(element.config, ['dataSourceId']),
    configuredField(element.config, ['dataSource']),
    configuredField(element.config, ['dataSourceTableId']),
    configuredField(element.config, ['tableId']),
    configuredField(element.config, ['tableName'])
  ].filter(isPresent));
}

function sourceKeys(source: EmbedDataSource): string[] {
  return [
    source.id,
    source.dataSourceId,
    source.tableName,
    ...source.tables.flatMap(table => [table.id, table.name])
  ].filter(isPresent);
}

function tileKind(element: EmbedDashboardElement): PublicTileKind {
  const type = element.type.toLowerCase();
  const chartType = element.chartType?.toLowerCase() ?? '';
  const configType = readString(element.config.type)?.toLowerCase() ?? '';
  if (['card', 'kpi', 'metric'].includes(type) || ['card', 'kpi', 'metric'].includes(chartType)) return 'card';
  if (type === 'matrix' || chartType === 'matrix') return 'matrix';
  if (type === 'news') return 'news';
  if (type === 'chatbot') return 'chatbot';
  if (type === 'table' || chartType === 'table' || configType === 'table') return 'table';
  return 'chart';
}

function tileDataLimit(kind: PublicTileKind): number {
  if (kind === 'chart' || kind === 'card' || kind === 'matrix') return 250;
  return 100;
}

function chartKind(element: EmbedDashboardElement): 'bar' | 'line' | 'pie' {
  const kind = (element.chartType ?? readString(element.config.type) ?? element.type).toLowerCase();
  if (kind === 'line' || kind === 'area') return 'line';
  if (kind === 'pie' || kind === 'donut' || kind === 'doughnut') return 'pie';
  return 'bar';
}

function tableColumns(
  element: EmbedDashboardElement,
  source: EmbedDataSource | null,
  preview: EmbedDataSourcePreview | null,
  rows: Array<Record<string, unknown>>
): PublicTableColumn[] {
  const configured = [
    ...readColumnRefs(element.config.columns),
    ...readColumnRefs(element.config.dataColumns)
  ];
  if (configured.length > 0) return dedupeColumns(configured).slice(0, 10);

  const fields = preview?.fields.map(field => ({ key: field.name, label: labelFor(field.name) })).filter(column => column.key) ?? [];
  if (fields.length > 0) return fields.slice(0, 10);
  const sourceFields = fieldsForElementSource(element, source);
  if (sourceFields.length > 0) return sourceFields.slice(0, 10);
  const row = rows[0];
  return row ? Object.keys(row).slice(0, 10).map(key => ({ key, label: labelFor(key) })) : [];
}

function fieldsForElementSource(element: EmbedDashboardElement, source: EmbedDataSource | null): PublicTableColumn[] {
  if (!source) return [];
  const tableName = configuredField(element.config, ['tableName']);
  const tableId = configuredField(element.config, ['tableId', 'dataSourceTableId']);
  const table = source.tables.find(item => {
    return item.id === tableId || item.name === tableName || item.name === source.tableName;
  }) ?? source.tables.find(item => item.isSelected) ?? source.tables[0];
  return table?.fields.map(field => ({ key: field.name, label: labelFor(field.name) })) ?? [];
}

function metricFields(
  element: EmbedDashboardElement,
  rows: Array<Record<string, unknown>>,
  columns: PublicTableColumn[]
): string[] {
  const configured = [
    ...readFieldArray(element.config.ySeries),
    ...readFieldArray(element.config.yFields),
    ...readFieldArray(element.config.valueFields),
    configuredField(element.config, ['yField', 'valueField', 'metricField', 'field'])
  ].filter(isPresent);
  if (configured.length > 0) return [...new Set(configured)];
  return columns.map(column => column.key).filter(column => rows.some(row => readNumeric(row[column]) !== null)).slice(0, 3);
}

function buildChartModel(
  element: EmbedDashboardElement,
  rows: Array<Record<string, unknown>>,
  labelField: string,
  valueFields: string[]
): PublicChartModel {
  const chartType = chartKind(element);
  const groups = new Map<string, Map<string, number>>();
  const fields = valueFields.length > 0 ? valueFields : ['__count'];
  for (const row of rows.slice(0, 250)) {
    const label = formatGroupLabel(row[labelField]);
    const group = groups.get(label) ?? new Map<string, number>();
    for (const field of fields) {
      const value = field === '__count' ? 1 : readNumeric(row[field]) ?? 0;
      group.set(field, (group.get(field) ?? 0) + value);
    }
    groups.set(label, group);
  }
  const limit = readPositiveInteger(element.config.topN) ?? 8;
  const labels = [...groups.keys()].slice(0, limit);
  const datasets = fields.map(field => ({
    label: field === '__count' ? 'Rows' : labelFor(field),
    values: labels.map(label => groups.get(label)?.get(field) ?? 0)
  }));
  return {
    datasets: chartType === 'pie' ? datasets.slice(0, 1) : datasets,
    labels,
    stacked: element.type.toLowerCase() === 'stacked'
      || element.chartType?.toLowerCase() === 'stacked'
      || element.config.stackBars === true,
    type: chartType
  };
}

function buildCardMetrics(
  element: EmbedDashboardElement,
  rows: Array<Record<string, unknown>>,
  valueFields: string[]
): PublicCardMetric[] {
  const staticValue = element.config.value;
  if (staticValue !== undefined && staticValue !== null && staticValue !== '') {
    return [{
      helper: readString(element.config.helper) ?? 'Configured value',
      label: readString(element.config.title) ?? element.title,
      value: formatMetricValue(staticValue, element.config)
    }];
  }
  const fields = valueFields.length > 0 ? valueFields : [];
  if (fields.length === 0 && rows.length > 0) {
    return [{ helper: 'Visible rows', label: element.title, value: formatMetricValue(rows.length, element.config) }];
  }
  return fields.slice(0, 4).map(field => ({
    helper: `${rows.length} row${rows.length === 1 ? '' : 's'}`,
    label: labelFor(field),
    value: formatMetricValue(aggregate(rows, field, readString(element.config.aggregationType) ?? 'sum'), element.config)
  }));
}

function buildMatrixModel(
  element: EmbedDashboardElement,
  rows: Array<Record<string, unknown>>,
  columns: PublicTableColumn[],
  labelField: string,
  valueFields: string[]
): PublicMatrixModel | null {
  const rowField = readFieldArray(element.config.rowFields)[0] ?? labelField;
  const columnField = readFieldArray(element.config.columnFields)[0] ?? columns.find(column => column.key !== rowField)?.key;
  const valueField = readFieldArray(element.config.valueFields)[0] ?? valueFields[0];
  if (!rowField || !columnField || !valueField) return null;

  const matrix = new Map<string, Map<string, number>>();
  const columnSet = new Set<string>();
  for (const row of rows.slice(0, 500)) {
    const rowLabel = formatGroupLabel(row[rowField]);
    const columnLabel = formatGroupLabel(row[columnField]);
    columnSet.add(columnLabel);
    const rowValues = matrix.get(rowLabel) ?? new Map<string, number>();
    rowValues.set(columnLabel, (rowValues.get(columnLabel) ?? 0) + (readNumeric(row[valueField]) ?? 0));
    matrix.set(rowLabel, rowValues);
  }
  const matrixColumns = [...columnSet].slice(0, 8);
  const matrixRows = [...matrix.entries()].slice(0, 12).map(([label, values]) => {
    const rawCells = matrixColumns.map(column => values.get(column) ?? 0);
    const total = rawCells.reduce((sum, value) => sum + value, 0);
    return {
      cells: rawCells.map(value => formatMetricValue(value, element.config)),
      key: label,
      label,
      total: formatMetricValue(total, element.config)
    };
  });
  return {
    columns: matrixColumns,
    rows: matrixRows,
    rowHeader: labelFor(rowField),
    valueLabel: labelFor(valueField)
  };
}

function aggregate(rows: Array<Record<string, unknown>>, field: string, aggregation: string): number {
  const values = rows.map(row => readNumeric(row[field])).filter(isPresent);
  if (aggregation === 'count') return rows.length;
  if (values.length === 0) return 0;
  if (aggregation === 'avg' || aggregation === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === 'min') return Math.min(...values);
  if (aggregation === 'max') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

function readColumnRefs(value: unknown): PublicTableColumn[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (typeof item === 'string') return { key: item, label: labelFor(item) };
    if (!isRecord(item)) return null;
    const key = readString(item.field) ?? readString(item.key) ?? readString(item.name);
    if (!key) return null;
    return { key, label: readString(item.label) ?? readString(item.title) ?? labelFor(key) };
  }).filter(isPresent);
}

function readFieldArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (typeof item === 'string') return item.trim();
    if (!isRecord(item)) return '';
    return readString(item.field) ?? readString(item.key) ?? readString(item.name) ?? '';
  }).filter(Boolean);
}

function configuredField(config: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(config[key]);
    if (value) return value;
  }
  return null;
}

function dedupeColumns(columns: PublicTableColumn[]): PublicTableColumn[] {
  const seen = new Set<string>();
  return columns.filter(column => {
    if (seen.has(column.key)) return false;
    seen.add(column.key);
    return true;
  });
}

function formatGroupLabel(value: unknown): string {
  return formatCellValue(value) || 'Unlabelled';
}
