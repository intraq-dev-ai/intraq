import {
  schemaForRows,
  toLabel,
  type DataSourceRecord,
  type FieldDefinition,
  type TableDefinition
} from './foundation-store.js';
import {
  DEFAULT_TABLE_NAME,
  type ApiResponseColumnMapping,
  type ApiResponseMappingConfig,
  type ApiResponseShape
} from './api-runtime-types.js';
import {
  isRecord,
  parseJsonContainer,
  readPath,
  readString,
  slugify
} from './api-runtime-utils.js';

export function rowsFromPayload(
  payload: unknown,
  dataPath?: string,
  responseMapping?: ApiResponseMappingConfig,
  rowContextColumns: ApiResponseColumnMapping[] = [],
  responseShape: ApiResponseShape = 'rows'
): Array<Record<string, unknown>> {
  if (responseMapping) return rowsFromResponseMapping(payload, responseMapping, rowContextColumns);
  if (responseShape === 'highcharts') {
    const root = dataPath ? readPath(payload, dataPath) : payload;
    return rowsFromHighchartsPayload(root, defaultHighchartsMapping(), payload, rowContextColumns);
  }
  const selected = dataPath
    ? readPath(payload, dataPath)
    : responseShape === 'kendo'
      ? kendoRowsFromPayload(payload) ?? autoSelectRows(payload)
      : autoSelectRows(payload);
  const value = Array.isArray(selected) ? selected : selected === undefined || selected === null ? [] : [selected];
  return value.map((item, index) => ({ ...rowFromValue(item), ...rowContextFromPayload(payload, rowContextColumns, index) }));
}

function rowContextFromPayload(payload: unknown, columns: ApiResponseColumnMapping[], rowIndex: number): Record<string, unknown> {
  if (columns.length === 0) return {};
  return Object.fromEntries(columns.map(column => [column.name, normalizeCell(rowContextColumnValue(payload, column, rowIndex))]));
}

function rowContextColumnValue(payload: unknown, column: ApiResponseColumnMapping, rowIndex: number): unknown {
  if (column.mode !== 'by_index') return readPath(payload, column.path);
  const rawSource = readPath(payload, column.path);
  const source = typeof rawSource === 'string' ? parseJsonContainer(rawSource) : rawSource;
  const item = Array.isArray(source) ? source[rowIndex] : undefined;
  return column.valuePath ? readPath(item, column.valuePath) : item;
}

function rowsFromResponseMapping(
  payload: unknown,
  mapping: ApiResponseMappingConfig,
  rowContextColumns: ApiResponseColumnMapping[] = []
): Array<Record<string, unknown>> {
  if (mapping.type === 'highcharts') return rowsFromHighchartsPayload(
    mapping.rootPath ? readPath(payload, mapping.rootPath) : payload,
    mapping,
    payload,
    rowContextColumns
  );
  if (mapping.type === 'kendo') {
    const root = mapping.rootPath ? readPath(payload, mapping.rootPath) : payload;
    const selected = kendoRowsFromPayload(root);
    const value = Array.isArray(selected) ? selected : [];
    return value.map((item, index) => ({ ...rowFromValue(item), ...rowContextFromPayload(payload, rowContextColumns, index) }));
  }
  if (mapping.type !== 'matrix') return [];
  const root = mapping.rootPath ? readPath(payload, mapping.rootPath) : payload;
  const labels = mapping.labelPath ? readArrayValues(readPath(root, mapping.labelPath)) : [];
  const series = mapping.seriesPath ? readArrayValues(readPath(root, mapping.seriesPath)) : [];
  const values = mapping.valueColumns.map(column => ({
    column,
    value: readPath(root, column.path)
  }));
  const metadata = mapping.metadataColumns.map(column => ({
    column,
    value: readPath(root, column.path)
  }));
  const labelCount = Math.max(labels.length, ...values.map(item => mappedLabelCount(item.value)), 1);
  const seriesCount = Math.max(series.length, ...values.map(item => mappedSeriesCount(item.value)), 1);
  const rows: Array<Record<string, unknown>> = [];
  for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex += 1) {
    for (let labelIndex = 0; labelIndex < labelCount; labelIndex += 1) {
      const row: Record<string, unknown> = {
        ...rowContextFromPayload(payload, rowContextColumns, labelIndex),
        [mapping.labelColumn]: normalizeCell(normalizeMatrixLabel(labels[labelIndex] ?? labelIndex + 1, labels, mapping))
      };
      if (mapping.seriesPath) {
        row[mapping.seriesColumn] = normalizeCell(series[seriesIndex] ?? `Series ${seriesIndex + 1}`);
      }
      let hasMappedValue = false;
      for (const item of values) {
        const value = mappedCellValue(item.value, seriesIndex, labelIndex, seriesCount, labelCount);
        if (!isBlankMappedValue(value)) hasMappedValue = true;
        row[item.column.name] = normalizeCell(value);
      }
      for (const item of metadata) {
        row[item.column.name] = normalizeCell(mappedCellValue(item.value, seriesIndex, labelIndex, seriesCount, labelCount));
      }
      if (mapping.includeEmptyRows || hasMappedValue) rows.push(row);
    }
  }
  return rows;
}

function defaultHighchartsMapping(): ApiResponseMappingConfig {
  return {
    includeEmptyRows: true,
    labelColumn: 'label',
    metadataColumns: [],
    seriesColumn: 'series',
    type: 'highcharts',
    valueColumn: 'value',
    valueColumns: []
  };
}

function rowsFromHighchartsPayload(
  root: unknown,
  mapping: ApiResponseMappingConfig,
  payload: unknown,
  rowContextColumns: ApiResponseColumnMapping[] = []
): Array<Record<string, unknown>> {
  const labels = highchartsLabels(root, mapping);
  const series = highchartsSeries(root, mapping);
  if (series.length === 0) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
    const seriesItem = series[seriesIndex];
    const seriesName = highchartsSeriesName(seriesItem, seriesIndex);
    const points = highchartsSeriesData(seriesItem, mapping);
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex];
      const label = highchartsPointLabel(point, labels, pointIndex);
      const value = highchartsPointValue(point);
      if (!mapping.includeEmptyRows && isBlankMappedValue(value)) continue;
      rows.push({
        ...rowContextFromPayload(payload, rowContextColumns, pointIndex),
        [mapping.labelColumn]: normalizeCell(normalizeMatrixLabel(label ?? pointIndex + 1, labels, mapping)),
        [mapping.seriesColumn]: normalizeCell(seriesName),
        [mapping.valueColumn ?? 'value']: normalizeCell(value)
      });
    }
  }
  return rows;
}

function highchartsLabels(root: unknown, mapping: ApiResponseMappingConfig): unknown[] {
  if (mapping.labelPath) return readArrayValues(readPath(root, mapping.labelPath));
  for (const path of ['xAxis.categories', 'xAxis[0].categories', 'categories', 'Categories', 'labels', 'Labels', 'Xlabel', 'xLabel', 'xLabels', 'XLabels']) {
    const value = readArrayValues(readPath(root, path));
    if (value.length > 0) return value;
  }
  return [];
}

function highchartsSeries(root: unknown, mapping: ApiResponseMappingConfig): unknown[] {
  if (mapping.seriesPath) return readArrayValues(readPath(root, mapping.seriesPath));
  for (const path of ['series', 'Series', 'data.Series', 'Data.Series']) {
    const value = readArrayValues(readPath(root, path));
    if (value.length > 0) return value;
  }
  return Array.isArray(root) ? root : [];
}

function highchartsSeriesName(seriesItem: unknown, index: number): unknown {
  if (isRecord(seriesItem)) {
    return seriesItem.name ?? seriesItem.Name ?? seriesItem.label ?? seriesItem.Label ?? `Series ${index + 1}`;
  }
  return `Series ${index + 1}`;
}

function highchartsSeriesData(seriesItem: unknown, mapping: ApiResponseMappingConfig): unknown[] {
  if (mapping.valuePath && isRecord(seriesItem)) return readArrayValues(readPath(seriesItem, mapping.valuePath));
  if (Array.isArray(seriesItem)) return seriesItem;
  if (!isRecord(seriesItem)) return [];
  for (const path of ['data', 'Data', 'values', 'Values', 'y']) {
    const value = readArrayValues(readPath(seriesItem, path));
    if (value.length > 0) return value;
  }
  return [];
}

function highchartsPointLabel(point: unknown, labels: unknown[], index: number): unknown {
  if (isRecord(point)) return point.name ?? point.Name ?? point.x ?? point.X ?? labels[index];
  if (Array.isArray(point)) return point[0] ?? labels[index];
  return labels[index];
}

function highchartsPointValue(point: unknown): unknown {
  if (Array.isArray(point)) return point.length > 1 ? point[1] : point[0];
  if (isRecord(point)) return point.y ?? point.Y ?? point.value ?? point.Value ?? point.data ?? point.Data;
  return point;
}

function kendoRowsFromPayload(payload: unknown): unknown[] | null {
  if (!isRecord(payload)) return Array.isArray(payload) ? payload : null;
  for (const key of ['Data', 'data', 'Results', 'results']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    const nested = kendoRowsFromPayload(value);
    if (nested) return nested;
  }
  return null;
}

function readArrayValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeMatrixLabel(
  value: unknown,
  labels: unknown[],
  mapping: ApiResponseMappingConfig
): unknown {
  const mode = (mapping.labelDateMode ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  let normalized = value;
  if (['fillfromfirstlabel', 'datetimefromfirstlabel', 'dateprefix'].includes(mode)
    && typeof normalized === 'string'
    && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(normalized.trim())) {
    const datePrefix = labels
      .flatMap(label => typeof label === 'string' ? [normalizeDateLikeLabel(label)?.slice(0, 10)] : [])
      .find((label): label is string => Boolean(label));
    normalized = datePrefix ? `${datePrefix} ${normalized.trim()}` : normalized;
  }
  return typeof normalized === 'string'
    ? normalizeDateLikeLabel(normalized) ?? normalized
    : normalized;
}

function normalizeDateLikeLabel(value: string): string | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(.*)$/.exec(value.trim());
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${match[4] ?? ''}`;
}

function mappedSeriesCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.some(Array.isArray)) return value.length;
  return 0;
}

function mappedLabelCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  const firstRow = value.find(Array.isArray);
  return Array.isArray(firstRow) ? firstRow.length : value.length;
}

function mappedCellValue(
  value: unknown,
  seriesIndex: number,
  labelIndex: number,
  seriesCount: number,
  labelCount: number
): unknown {
  if (!Array.isArray(value)) return value;
  const seriesValue = value[seriesIndex];
  if (Array.isArray(seriesValue)) return seriesValue[labelIndex];
  if (value.length === labelCount) return value[labelIndex];
  if (value.length === seriesCount) return value[seriesIndex];
  return value[labelIndex] ?? value[seriesIndex];
}

function isBlankMappedValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function autoSelectRows(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return payload;
  for (const key of ['data', 'Data', 'results', 'Results', 'items', 'Items', 'records', 'Records', 'rows', 'Rows']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
      const nested = autoSelectRows(value);
      if (Array.isArray(nested)) return nested;
    }
  }
  return payload;
}

function rowFromValue(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return flattenRecord(value);
  return { value };
}

function flattenRecord(record: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(record)) {
    const name = prefix ? `${prefix}_${key}` : key;
    if (isRecord(value)) entries.push(...Object.entries(flattenRecord(value, name)));
    else entries.push([name, normalizeCell(value)]);
  }
  return Object.fromEntries(entries);
}

function normalizeCell(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

export function inferFields(rows: Array<Record<string, unknown>>): FieldDefinition[] {
  const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  return keys.map(name => {
    const values = rows.map(row => row[name]).filter(value => value !== null && value !== undefined);
    return {
      name,
      type: fieldType(values),
      description: `${toLabel(name)} field`,
      dictionaryDescription: `${toLabel(name)} field`,
      sampleValues: Array.from(new Set(values.map(value => String(value)))).slice(0, 5)
    };
  });
}

function fieldType(values: unknown[]): string {
  if (values.length === 0) return 'string';
  if (values.every(value => typeof value === 'number')) return 'number';
  if (values.every(value => typeof value === 'boolean')) return 'boolean';
  if (values.every(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) return 'date';
  return 'string';
}

export function columnTypesFor(fields: Array<FieldDefinition | { name: string; type: string }>): Array<{ name: string; type: string }> {
  return fields.map(field => ({ name: field.name, type: field.type }));
}

export function normalizeRow(row: Record<string, unknown>, columns: string[]): Record<string, string | number | boolean | null> {
  const keys = columns.length > 0 ? columns : Object.keys(row);
  return Object.fromEntries(keys.map(key => [key, toSqlCell(row[key])]));
}

function toSqlCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

export function defaultApiTable(source: DataSourceRecord): TableDefinition {
  const configured = readString(source.config.tableName) ?? readString(source.config.name) ?? DEFAULT_TABLE_NAME;
  return {
    id: `${source.id}__${slugify(configured)}`,
    name: slugify(configured),
    description: `${toLabel(configured)} API endpoint`,
    fields: [],
    dictionary: { businessName: toLabel(configured) },
    settings: { targetType: 'raw_table' },
    isSelected: true
  };
}

export function apiTableFromRows(
  source: DataSourceRecord,
  existing: TableDefinition,
  rows: Array<Record<string, unknown>>
): TableDefinition {
  const fields = inferFields(rows);
  const rowCount = rows.length;
  return {
    ...existing,
    description: existing.description || `${toLabel(existing.name)} API endpoint`,
    fields: fields.length > 0 ? fields : existing.fields,
    dictionary: {
      ...existing.dictionary,
      businessName: existing.dictionary.businessName ?? toLabel(existing.name),
      rawSchema: {
        ...(isRecord(existing.dictionary.rawSchema) ? existing.dictionary.rawSchema : {}),
        rowCount,
        refreshedAt: new Date().toISOString(),
        sourceType: 'api'
      }
    },
    settings: {
      ...existing.settings,
      isDataModel: existing.settings?.isDataModel === true,
      targetType: existing.settings?.targetType ?? 'raw_table'
    },
    isSelected: existing.isSelected,
    sampleRows: rows.slice(0, 20)
  };
}

export function columnsForRows(rows: Array<Record<string, unknown>>, fields: FieldDefinition[]): string[] {
  return fields.length > 0 ? fields.map(field => field.name) : schemaForRows(rows).map(field => field.name);
}
