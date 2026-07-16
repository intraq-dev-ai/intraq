import type { SqlQueryCell, SqlQueryRow } from './sql-query-types.js';
import type {
  ExportColumnMapping,
  ExportGenerateRowsConfig,
  ExportRow,
  ExportRowTransformResult,
  ExportTransformConfig
} from './export-row-transform-types.js';
export type { ExportRowTransformResult } from './export-row-transform-types.js';

export function hasExportRowTransforms(config: unknown): boolean {
  const normalized = readExportTransformConfig(config);
  return Boolean(
    normalized.columns.length
    || normalized.appendRows.length
    || normalized.generateRows.length
    || normalized.splitByGroupFlag
    || normalized.sortBy.length
  );
}

export function readExportSectionOptions(config: unknown): { includeSectionHeader?: boolean } {
  const normalized = readExportTransformConfig(config);
  return {
    ...(normalized.includeSectionHeader === undefined ? {} : { includeSectionHeader: normalized.includeSectionHeader })
  };
}

export function applyExportRowTransforms(
  rows: ExportRow[],
  config: unknown,
  fallbackColumns: string[] = []
): ExportRowTransformResult {
  const normalized = readExportTransformConfig(config);
  let workingRows = [...rows];
  if (normalized.generateRows.length > 0) workingRows = applyGenerateRows(workingRows, normalized.generateRows);
  if (normalized.sortBy.length > 0) workingRows = sortRows(workingRows, normalized.sortBy);
  if (normalized.splitByGroupFlag) workingRows = applySplitByGroupFlag(workingRows, normalized.splitByGroupFlag);
  if (normalized.appendRows.length > 0) {
    workingRows = [
      ...workingRows,
      ...appendRowsFor(workingRows, normalized.appendRows, { allRows: workingRows, sectionRows: workingRows })
    ];
  }

  const columns = normalized.columns.length > 0
    ? normalized.columns.map(column => column.header)
    : fallbackColumns.length > 0
      ? fallbackColumns
      : columnsForRows(workingRows);
  const projectedRows = normalized.columns.length > 0
    ? workingRows.map(row => projectRow(row, normalized.columns))
    : workingRows.map(row => normalizeRow(row, columns));
  return {
    columns,
    ...(normalized.includeSectionHeader === undefined ? {} : { includeSectionHeader: normalized.includeSectionHeader }),
    rows: projectedRows
  };
}

function readExportTransformConfig(config: unknown): ExportTransformConfig {
  const root = readRecord(config);
  const csv = readRecord(root.csv);
  const transform = readRecord(root.rowTransform ?? root.rowTransforms ?? root.transform ?? root.transforms ?? csv.transform ?? csv.transforms);
  const merged = { ...csv, ...transform, ...root };
  const includeSectionHeader = readBoolean(merged.includeSectionHeader ?? merged.showSectionHeader ?? csv.includeSectionHeader ?? csv.showSectionHeader);
  const splitByGroupFlag = readRecordOrUndefined(merged.splitByGroupFlag ?? merged.splitSections ?? merged.sectionSplit);
  return {
    appendRows: readArray(merged.appendRows ?? merged.rowsToAppend ?? merged.summaryRows ?? merged.footerRows),
    columns: readColumnMappings(merged.columns ?? merged.columnMappings ?? merged.headers ?? csv.columns ?? csv.headers),
    generateRows: readGenerateRows(merged.generateRows ?? merged.generatedRows ?? merged.derivedRows ?? merged.rowsFromGroups ?? merged.groupRows),
    ...(includeSectionHeader === undefined ? {} : { includeSectionHeader }),
    ...(splitByGroupFlag ? { splitByGroupFlag } : {}),
    sortBy: readSortBy(merged.sortBy ?? merged.orderBy)
  };
}

function readColumnMappings(value: unknown): ExportColumnMapping[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [{ header: item.trim(), field: item.trim() }];
    const record = readRecord(item);
    const header = readString(record.header ?? record.label ?? record.name ?? record.key);
    if (!header) return [];
    const field = readString(record.field ?? record.path ?? record.source ?? record.valuePath ?? record.key);
    return [{
      ...(record.defaultValue !== undefined ? { defaultValue: record.defaultValue } : {}),
      ...(field ? { field } : {}),
      header,
      ...(record.value !== undefined && !field ? { value: record.value } : {})
    }];
  });
}

function readSortBy(value: unknown): Array<{ direction: 'asc' | 'desc'; field: string }> {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [{ field: item.trim(), direction: 'asc' as const }];
    const record = readRecord(item);
    const field = readString(record.field ?? record.name ?? record.path);
    if (!field) return [];
    const direction = readString(record.direction ?? record.dir)?.toLowerCase() === 'desc' ? 'desc' : 'asc';
    return [{ field, direction }];
  });
}

function sortRows(rows: ExportRow[], sortBy: Array<{ direction: 'asc' | 'desc'; field: string }>): ExportRow[] {
  return [...rows].sort((left, right) => {
    for (const sort of sortBy) {
      const comparison = compareValues(readPath(left, sort.field), readPath(right, sort.field));
      if (comparison !== 0) return sort.direction === 'desc' ? -comparison : comparison;
    }
    return 0;
  });
}

function readGenerateRows(value: unknown): ExportGenerateRowsConfig[] {
  return readArray(value).flatMap(item => {
    const record = readRecord(item);
    const groupBy = readStringArray(record.groupBy ?? record.groupFields ?? record.key ?? record.keys);
    const rows = readArray(record.rows ?? record.templates ?? record.generatedRows ?? record.derivedRows);
    if (rows.length === 0) return [];
    const positionText = readString(record.position ?? record.insert)?.toLowerCase();
    const position = positionText === 'before' || positionText === 'replace' ? positionText : 'after';
    return [{
      groupBy,
      includeSourceRows: readBoolean(record.includeSourceRows ?? record.keepSourceRows) ?? position !== 'replace',
      position,
      rows
    }];
  });
}

function applyGenerateRows(rows: ExportRow[], configs: ExportGenerateRowsConfig[]): ExportRow[] {
  return configs.reduce((currentRows, config) => {
    const grouped = groupRows(currentRows, config.groupBy);
    return grouped.flatMap(group => {
      const generatedRows = config.rows.flatMap(rowConfig => generateConfiguredRow(rowConfig, group.rows, currentRows));
      if (!config.includeSourceRows || config.position === 'replace') return generatedRows;
      return config.position === 'before'
        ? [...generatedRows, ...group.rows]
        : [...group.rows, ...generatedRows];
    });
  }, rows);
}

function groupRows(rows: ExportRow[], groupBy: string[]): Array<{ key: string; rows: ExportRow[] }> {
  if (groupBy.length === 0) return rows.length ? [{ key: '__all__', rows }] : [];
  const order: string[] = [];
  const groups = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const key = groupBy.map(field => String(readPath(row, field) ?? '')).join('\u001f');
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)?.push(row);
  }
  return order.map(key => ({ key, rows: groups.get(key) ?? [] }));
}

function generateConfiguredRow(rowConfigValue: unknown, sectionRows: ExportRow[], allRows: ExportRow[]): ExportRow[] {
  const rowConfig = readRecord(rowConfigValue);
  const currentRow = sectionRows[0] ?? {};
  const context = { allRows, currentRow, sectionRows };
  if (!shouldAppendRow(rowConfig.when, context)) return [];
  const values = readRecord(rowConfig.values ?? rowConfig.fields ?? rowConfig.row ?? rowConfig);
  const row: ExportRow = {};
  const labelField = readString(rowConfig.labelField ?? rowConfig.field);
  const label = readString(rowConfig.label);
  if (labelField && label !== undefined) row[labelField] = label;
  for (const [key, value] of Object.entries(values)) {
    if (key === 'when' || key === 'values' || key === 'fields' || key === 'row' || key === 'label' || key === 'labelField') continue;
    row[key] = resolveConfiguredValue(value, context);
  }
  return [row];
}

function applySplitByGroupFlag(rows: ExportRow[], config: Record<string, unknown>): ExportRow[] {
  const groupBy = readString(config.groupBy ?? config.groupField ?? config.keyField);
  const flagField = readString(config.flagField ?? config.field);
  if (!groupBy || !flagField) return rows;
  const flagValues = readArray(config.flagValues ?? config.values).map(normalizeComparable);
  const flaggedGroups = new Set(rows
    .filter(row => matchesFlag(readPath(row, flagField), flagValues))
    .map(row => String(readPath(row, groupBy) ?? '')));
  const regularConfig = readRecord(config.regular ?? config.primary);
  if (flaggedGroups.size === 0) {
    return [
      ...rows,
      ...appendRowsFor(rows, readArray(regularConfig.appendRows ?? regularConfig.summaryRows ?? regularConfig.footerRows), {
        allRows: rows,
        ...(rows[0] ? { currentRow: rows[0] } : {}),
        sectionRows: rows
      })
    ];
  }

  const regularRows = rows.filter(row => !flaggedGroups.has(String(readPath(row, groupBy) ?? '')));
  const flaggedRows = rows.filter(row => flaggedGroups.has(String(readPath(row, groupBy) ?? '')));
  const flaggedConfig = readRecord(config.flagged ?? config.secondary);
  const output = [
    ...regularRows,
    ...appendRowsFor(regularRows, readArray(regularConfig.appendRows ?? regularConfig.summaryRows ?? regularConfig.footerRows), {
      allRows: rows,
      ...(regularRows[0] ? { currentRow: regularRows[0] } : {}),
      sectionRows: regularRows
    })
  ];

  if (readBoolean(flaggedConfig.separatorRow ?? config.separatorRow) !== false) output.push({});
  const header = readString(flaggedConfig.header ?? flaggedConfig.headerText ?? config.header ?? config.headerText);
  if (header) {
    const headerField = readString(flaggedConfig.headerField ?? flaggedConfig.labelField ?? config.headerField ?? config.labelField)
      ?? firstField(rows);
    output.push({ [headerField]: renderTemplate(header, statsFor(flaggedRows, rows, flaggedGroups.size)) });
  }
  output.push(...flaggedRows);
  output.push(...appendRowsFor(flaggedRows, readArray(flaggedConfig.appendRows ?? flaggedConfig.summaryRows ?? flaggedConfig.footerRows), {
    allRows: rows,
    ...(flaggedRows[0] ? { currentRow: flaggedRows[0] } : {}),
    sectionRows: flaggedRows
  }));
  return output;
}

function appendRowsFor(
  sectionRows: ExportRow[],
  configs: unknown[],
  context: ExportValueContext
): ExportRow[] {
  return configs.flatMap(item => {
    const rowConfig = readRecord(item);
    if (!shouldAppendRow(rowConfig.when, context)) return [];
    const values = readRecord(rowConfig.values ?? rowConfig.fields ?? rowConfig.row);
    const row: ExportRow = {};
    const labelField = readString(rowConfig.labelField ?? rowConfig.field);
    const label = readString(rowConfig.label);
    if (labelField && label !== undefined) row[labelField] = label;
    for (const [key, value] of Object.entries(values)) {
      row[key] = resolveConfiguredValue(value, context);
    }
    return [row];
  });
}

interface ExportValueContext {
  allRows: ExportRow[];
  currentRow?: ExportRow;
  sectionRows: ExportRow[];
}

function shouldAppendRow(condition: unknown, context: ExportValueContext): boolean {
  if (condition === undefined || condition === null) return true;
  if (typeof condition === 'boolean') return condition;
  const record = readRecord(condition);
  const all = readArray(record.all);
  if (all.length > 0 && all.some(item => !shouldAppendRow(item, context))) return false;
  const any = readArray(record.any);
  if (any.length > 0 && !any.some(item => shouldAppendRow(item, context))) return false;
  const minRows = readNumber(record.minRows);
  if (minRows !== undefined && context.sectionRows.length < minRows) return false;
  const difference = readRecordOrUndefined(record.difference);
  if (difference) {
    const value = computeDifference(difference, context.sectionRows, context.allRows);
    if (Math.abs(value) < 0.000001) return false;
  }
  const field = readString(record.field ?? record.path);
  if (field) {
    const value = readPath(context.currentRow ?? context.sectionRows[0] ?? {}, field);
    return matchesConditionValue(value, record);
  }
  return true;
}

function matchesConditionValue(value: unknown, condition: Record<string, unknown>): boolean {
  const operator = (readString(condition.operator ?? condition.op) ?? 'truthy').toLowerCase();
  const expected = condition.value ?? condition.equals ?? condition.eq;
  const numericValue = Number(value);
  const numericExpected = Number(expected);
  if (operator === 'exists') return value !== undefined && value !== null;
  if (operator === 'notexists' || operator === 'missing') return value === undefined || value === null;
  if (operator === 'empty') return value === undefined || value === null || String(value).trim() === '';
  if (operator === 'notempty') return value !== undefined && value !== null && String(value).trim() !== '';
  if (operator === 'nonzero') return Number.isFinite(numericValue) && Math.abs(numericValue) > 0.000001;
  if (operator === 'zero') return Number.isFinite(numericValue) && Math.abs(numericValue) < 0.000001;
  if (operator === 'eq' || operator === 'equals') return normalizeComparable(value) === normalizeComparable(expected);
  if (operator === 'ne' || operator === 'notequals') return normalizeComparable(value) !== normalizeComparable(expected);
  if ((operator === 'gt' || operator === 'gte' || operator === 'lt' || operator === 'lte') && Number.isFinite(numericValue) && Number.isFinite(numericExpected)) {
    if (operator === 'gt') return numericValue > numericExpected;
    if (operator === 'gte') return numericValue >= numericExpected;
    if (operator === 'lt') return numericValue < numericExpected;
    return numericValue <= numericExpected;
  }
  if (operator === 'falsy' || operator === 'false') return !value;
  return Boolean(value);
}

function resolveConfiguredValue(value: unknown, context: ExportValueContext): unknown {
  if (typeof value === 'string') return renderTemplate(value, contextValues(context));
  const record = readRecordOrUndefined(value);
  if (!record) return value;
  const aggregate = readString(record.aggregate ?? record.agg)?.toLowerCase();
  if (aggregate) return aggregateRows(readString(record.field ?? record.path), context.sectionRows, aggregate);
  const difference = readRecordOrUndefined(record.difference);
  if (difference) return computeDifference(difference, context.sectionRows, context.allRows);
  const field = readString(record.field ?? record.path);
  if (field) {
    const scope = readString(record.scope)?.toLowerCase();
    const sourceRow = scope === 'last'
      ? context.sectionRows[context.sectionRows.length - 1]
      : scope === 'all'
        ? context.allRows[0]
        : context.currentRow ?? context.sectionRows[0];
    return readPath(sourceRow ?? {}, field) ?? record.defaultValue ?? null;
  }
  const template = readString(record.template);
  if (template) return renderTemplate(template, contextValues(context));
  if (record.value !== undefined) return record.value;
  return value;
}

function computeDifference(config: Record<string, unknown>, sectionRows: ExportRow[], allRows: ExportRow[]): number {
  const totalField = readString(config.totalField ?? config.totalPath);
  const sumField = readString(config.sumField ?? config.field ?? config.path);
  const totalRows = readString(config.totalScope ?? config.scope)?.toLowerCase() === 'all' ? allRows : sectionRows;
  const sumRows = readString(config.sumScope ?? config.scope)?.toLowerCase() === 'all' ? allRows : sectionRows;
  const total = aggregateRows(totalField, totalRows, 'sum');
  const sum = aggregateRows(sumField, sumRows, 'sum');
  return roundNumber(total - sum);
}

function aggregateRows(field: string | undefined, rows: ExportRow[], aggregate: string): number {
  if (aggregate === 'count') return rows.length;
  if (!field) return 0;
  const values = rows.map(row => Number(readPath(row, field))).filter(Number.isFinite);
  if (aggregate === 'countdistinct') return new Set(values.map(String)).size;
  if (values.length === 0) return 0;
  if (aggregate === 'avg' || aggregate === 'average') return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
  if (aggregate === 'max') return Math.max(...values);
  if (aggregate === 'min') return Math.min(...values);
  return roundNumber(values.reduce((sum, value) => sum + value, 0));
}

function statsFor(sectionRows: ExportRow[], allRows: ExportRow[], groupCount?: number): Record<string, unknown> {
  return {
    allRowCount: allRows.length,
    groupCount: groupCount ?? 0,
    rowCount: sectionRows.length
  };
}

function contextValues(context: ExportValueContext, groupCount?: number): Record<string, unknown> {
  return {
    ...statsFor(context.sectionRows, context.allRows, groupCount),
    ...(context.currentRow ?? context.sectionRows[0] ?? {})
  };
}

function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => String(readPath(values, key) ?? ''));
}

function projectRow(row: ExportRow, columns: ExportColumnMapping[]): SqlQueryRow {
  return Object.fromEntries(columns.map(column => [
    column.header,
    toSqlCell(column.value !== undefined
      ? column.value
      : column.field
        ? readPath(row, column.field) ?? column.defaultValue ?? null
        : column.defaultValue ?? null)
  ]));
}

function normalizeRow(row: ExportRow, columns: string[]): SqlQueryRow {
  return Object.fromEntries(columns.map(column => [column, toSqlCell(row[column])]));
}

function columnsForRows(rows: ExportRow[]): string[] {
  return Array.from(new Set(rows.flatMap(row => Object.keys(row))));
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return 1;
  if (right === undefined || right === null) return -1;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right));
}

function matchesFlag(value: unknown, flagValues: unknown[]): boolean {
  const normalized = normalizeComparable(value);
  if (flagValues.length === 0) return normalized === true || normalized === 'true' || normalized === 1 || normalized === '1';
  return flagValues.some(flag => flag === normalized);
}

function normalizeComparable(value: unknown): unknown {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const number = Number(normalized);
    return Number.isFinite(number) && normalized !== '' ? number : normalized;
  }
  return value;
}

function firstField(rows: ExportRow[]): string {
  return rows.find(row => Object.keys(row).length > 0) ? Object.keys(rows.find(row => Object.keys(row).length > 0) as ExportRow)[0] ?? 'label' : 'label';
}

function toSqlCell(value: unknown): SqlQueryCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function roundNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function readPath(value: unknown, path: string): unknown {
  const parts = path.split('.').flatMap(part => {
    const tokens: string[] = [];
    part.replace(/([^\[\]]+)|\[(\d+)\]/g, (_match, key: string | undefined, index: string | undefined) => {
      tokens.push(key ?? index ?? '');
      return '';
    });
    return tokens.filter(Boolean);
  });
  return parts.reduce<unknown>((current, part) => {
    if (Array.isArray(current)) return current[Number(part)];
    return isRecord(current) ? current[part] : undefined;
  }, value);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function readNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(item => readString(item) ?? []);
  const text = readString(value);
  return text ? text.split(',').map(item => item.trim()).filter(Boolean) : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function readRecordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? { ...value } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
