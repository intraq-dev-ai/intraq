import { matrixHeaderMetaPatch, type MatrixConditionalRule } from './matrix-conditional-formatting';
import type { MatrixColumn, MatrixGroup, MatrixSort } from './matrix-view-model-types';
import { parseReportDate } from './report-time-zone';
import { formatTableDatePattern } from './table-date-pattern-format';
import { aggregateRows, type ConfiguredField } from './view-model-config';
import { compareValues, matchesFilter, type RuntimeFilter } from './view-model-runtime';
import type {
  DashboardMatrixCellMeta,
  DashboardMatrixColumnDataDisplayMode,
  DashboardMatrixColumnHeaderRow,
  DashboardMatrixRow,
  DashboardMatrixRowHeaderCell,
  DashboardMatrixValueHeader
} from './view-model-types';

export function groupRows(rawRows: Array<Record<string, unknown>>, rowFieldNames: string[]): MatrixGroup[] {
  const groups = new Map<string, MatrixGroup>();
  for (const row of rawRows) {
    const key = rowFieldNames.length ? compositeLabel(row, rowFieldNames) : '__all__';
    const label = rowFieldNames.length ? key : '';
    const group = groups.get(key) ?? { label, rows: [], values: compositeValues(row, rowFieldNames) };
    group.rows.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

export function sortedMatrixGroups(
  groups: MatrixGroup[],
  sort: MatrixSort | MatrixSort[] | undefined,
  fallbackField: string | undefined,
  groupFieldNames: string[] = []
): MatrixGroup[] {
  const sorts = Array.isArray(sort) ? sort : sort ? [sort] : [];
  if (sorts.length === 0) return groups;
  return [...groups].sort((left, right) => {
    for (const item of sorts) {
      const compareField = item.compareKey ?? (item.key === 'value' ? fallbackField : undefined);
      const groupFieldIndex = groupFieldNames.indexOf(item.key);
      const result = compareField
        ? compareValues(aggregateRows(left.rows, compareField, 'sum'), aggregateRows(right.rows, compareField, 'sum'), item.direction)
        : groupFieldIndex >= 0
          ? compareValues(left.values[groupFieldIndex], right.values[groupFieldIndex], item.direction)
          : !item.key || item.key === 'label' || item.key === 'row' || item.key === 'column'
            ? compareValues(left.label, right.label, item.direction)
            : compareValues(aggregateRows(left.rows, item.key, 'sum'), aggregateRows(right.rows, item.key, 'sum'), item.direction);
      if (result !== 0) return result;
    }
    return 0;
  });
}

export function sortRecords(
  rows: Array<Record<string, unknown>>,
  sort: MatrixSort | MatrixSort[] | undefined
): Array<Record<string, unknown>> {
  const sorts = Array.isArray(sort) ? sort : sort ? [sort] : [];
  if (sorts.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const item of sorts) {
      const result = compareValues(left[item.key], right[item.key], item.direction);
      if (result !== 0) return result;
    }
    return 0;
  });
}

export function filterRecords(rows: Array<Record<string, unknown>>, filters: RuntimeFilter[]): Array<Record<string, unknown>> {
  return filters.length === 0 ? rows : rows.filter(row => matchesFilterChain(row, filters));
}

export function effectiveMatrixRowFields(
  rawRows: Array<Record<string, unknown>>,
  rowFields: ConfiguredField[],
  valueFieldNames: Set<string>
): ConfiguredField[] {
  const nonValueFields = rowFields.filter(field => !valueFieldNames.has(field.field));
  const hasReadableLabelField = nonValueFields.some(field => rawRows.some(row => isReadableDimensionValue(row[field.field])));
  return hasReadableLabelField ? nonValueFields : [];
}

export function uniqueColumnGroups(
  rows: Array<Record<string, unknown>>,
  fields: ConfiguredField[]
): Array<{ displayValues: string[]; label: string; values: string[] }> {
  const groups = new Map<string, { displayValues: string[]; values: string[] }>();
  for (const row of rows) {
    const values = fields.map(field => String(row[field.field] ?? '')).filter(Boolean);
    const displayValues = fields.map(field => formatDimensionValue(row[field.field], field)).filter(Boolean);
    const key = values.join(' / ') || 'Unassigned';
    if (!groups.has(key)) groups.set(key, { displayValues, values });
  }
  return Array.from(groups, ([key, { displayValues, values }]) => ({
    displayValues,
    label: displayValues.join(' / ') || key,
    values
  }));
}

export function matrixColumns(columns: MatrixColumn[], fields: string[], showSubtotals: boolean): MatrixColumn[] {
  if (!showSubtotals || fields.length < 2) return columns;
  const output: MatrixColumn[] = [];
  columns.forEach((column, index) => {
    output.push(column);
    for (let depth = fields.length - 2; depth >= 0; depth -= 1) {
      const prefix = column.values.slice(0, depth + 1);
      const nextPrefix = columns[index + 1]?.values.slice(0, depth + 1);
      if (prefix.length && JSON.stringify(prefix) !== JSON.stringify(nextPrefix)) {
        const displayPrefix = column.displayValues?.slice(0, depth + 1) ?? prefix;
        const values = Array.from({ length: fields.length }, (_, valueIndex) => valueIndex <= depth ? prefix[valueIndex] ?? '' : valueIndex === depth + 1 ? 'Total' : '');
        const displayValues = Array.from({ length: fields.length }, (_, valueIndex) => valueIndex <= depth ? displayPrefix[valueIndex] ?? '' : valueIndex === depth + 1 ? 'Total' : '');
        output.push({ displayValues, label: `${displayPrefix.join(' / ')} Total`, subtotalDepth: depth, values });
      }
    }
  });
  return output;
}

export function matrixColumnHeaderRows(
  columns: MatrixColumn[],
  fields: string[],
  rules: MatrixConditionalRule[],
  displayMode: DashboardMatrixColumnDataDisplayMode,
  valueHeaders: DashboardMatrixValueHeader[],
  showValueHeaderRow: boolean
): DashboardMatrixColumnHeaderRow[] {
  const valueCount = Math.max(valueHeaders.length, 1);
  const depth = Math.max(...columns.map(column => column.values.length), 0);
  const rows = Array.from({ length: depth }, (_, level) => {
    const cells: DashboardMatrixColumnHeaderRow['cells'] = [];
    if (displayMode === 'repeat') {
      columns.forEach((column, index) => {
        const label = column.displayValues?.[level] || column.values[level] || 'Unassigned';
        const meta = matrixHeaderMetaPatch([label], fields[level] ?? '', rules, 'column')[0];
        cells.push({
          columnIndexes: expandedColumnIndexes(index, valueCount),
          colspan: valueCount,
          depth: level,
          key: `${level}-${column.label}-${index}`,
          label,
          ...(meta ? { meta } : {}),
          scope: valueCount > 1 ? 'colgroup' : 'col'
        });
      });
      return { cells };
    }
    for (let index = 0; index < columns.length;) {
      const label = columns[index]?.displayValues?.[level] || columns[index]?.values[level] || 'Unassigned';
      const prefix = JSON.stringify(columns[index]?.values.slice(0, level + 1) ?? []);
      let end = index + 1;
      while (end < columns.length && JSON.stringify(columns[end]?.values.slice(0, level + 1) ?? []) === prefix) end += 1;
      const colspan = (end - index) * valueCount;
      const meta = matrixHeaderMetaPatch([label], fields[level] ?? '', rules, 'column')[0];
      cells.push({
        columnIndexes: range(index, end).flatMap(columnIndex => expandedColumnIndexes(columnIndex, valueCount)),
        colspan,
        depth: level,
        groupId: columnGroupId(fields, columns[index]?.values ?? [], level),
        hasChildren: level < fields.length - 1 && label !== 'Total',
        key: `${level}-${prefix || label}-${index}`,
        label,
        ...(meta ? { meta } : {}),
        scope: colspan > 1 ? 'colgroup' as const : 'col' as const
      });
      index = end;
    }
    return { cells };
  });
  if (!showValueHeaderRow) return rows;
  return [...rows, {
    cells: columns.flatMap((column, columnIndex) => valueHeaders.map((valueHeader, valueIndex) => ({
      columnIndexes: [columnIndex * valueCount + valueIndex],
      colspan: 1,
      depth,
      key: `value-${column.label}-${valueHeader.key}`,
      label: valueHeader.label,
      scope: 'col' as const
    })))
  }];
}

export function columnMatchesRow(column: MatrixColumn, row: Record<string, unknown>, fields: string[]): boolean {
  const count = column.subtotalDepth === undefined ? fields.length : column.subtotalDepth + 1;
  return fields.slice(0, count).every((field, index) => String(row[field] ?? '') === column.values[index]);
}

export function columnGroupIds(column: MatrixColumn, fields: string[]): string[] {
  return fields.map((_, depth) => columnGroupId(fields, column.values, depth));
}

export function columnSubtotalGroupId(column: MatrixColumn, fields: string[]): string | undefined {
  return column.subtotalDepth === undefined ? undefined : columnGroupId(fields, column.values, column.subtotalDepth);
}

export function compositeLabel(row: Record<string, unknown>, fields: string[]): string {
  return compositeValues(row, fields).join(' / ') || 'Unassigned';
}

export function rowHeaderCells(
  values: string[],
  fields: string[],
  groupStats: Map<string, number>,
  rules: MatrixConditionalRule[],
  isSubtotal: boolean
): DashboardMatrixRowHeaderCell[] {
  return fields.map((field, depth) => {
    const label = isSubtotal ? (depth === 0 ? values.join(' / ') : '') : values[depth] ?? 'Unassigned';
    const groupId = rowGroupId(fields, values, depth);
    const meta = matrixHeaderMetaPatch([label], field, rules, 'row')[0];
    return { depth, field, groupId, hasChildren: (groupStats.get(groupId) ?? 0) > 1, isGroupStart: true, label, ...(meta ? { meta } : {}) };
  });
}

export function matrixFlatColumnHeaderMeta(
  columns: MatrixColumn[],
  fields: string[],
  rules: MatrixConditionalRule[]
): Array<DashboardMatrixCellMeta | undefined> | undefined {
  if (rules.length === 0 || fields.length === 0) return undefined;
  const meta = columns.map(column => {
    for (let depth = fields.length - 1; depth >= 0; depth -= 1) {
      const field = fields[depth];
      const value = column.values[depth];
      const patch = field ? matrixHeaderMetaPatch([value ?? column.label], field, rules, 'column')[0] : undefined;
      if (patch) return patch;
    }
    return undefined;
  });
  return meta.some(Boolean) ? meta : undefined;
}

export function withRowHeaderStarts(rows: DashboardMatrixRow[]): DashboardMatrixRow[] {
  return rows.map((row, rowIndex) => row.rowHeaderCells ? {
    ...row,
    rowHeaderCells: row.rowHeaderCells.map((cell, cellIndex) => ({
      ...cell,
      isGroupStart: rows[rowIndex - 1]?.rowHeaderCells?.[cellIndex]?.groupId !== cell.groupId
    }))
  } : row);
}

export function rowHeaderGroupStats(groups: MatrixGroup[], fields: string[]): Map<string, number> {
  const childSets = new Map<string, Set<string>>();
  for (const group of groups) {
    for (let depth = 0; depth < fields.length - 1; depth += 1) {
      const parentId = rowGroupId(fields, group.values, depth);
      const childId = rowGroupId(fields, group.values, depth + 1);
      childSets.set(parentId, (childSets.get(parentId) ?? new Set()).add(childId));
    }
  }
  return new Map(Array.from(childSets, ([key, children]) => [key, children.size]));
}

function matchesFilterChain(row: Record<string, unknown>, filters: RuntimeFilter[]): boolean {
  const [first, ...rest] = filters;
  if (!first) return true;
  let previous = first;
  return rest.reduce((result, filter) => {
    const next = matchesFilter(row[filter.field], filter);
    const combined = String(previous.logicOperator ?? 'AND').toUpperCase() === 'OR'
      ? result || next
      : result && next;
    previous = filter;
    return combined;
  }, matchesFilter(row[first.field], first));
}

function isReadableDimensionValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && Number.isNaN(Number(value.trim()));
}

function formatDimensionValue(value: unknown, field: ConfiguredField): string {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (field.format !== 'date' && !field.dateFormat) return raw;
  const date = parseReportDate(value);
  if (!date) return raw;
  return formatTableDatePattern(date, field.dateFormat ?? 'DD/MM/YYYY');
}

function columnGroupId(fields: string[], values: string[], depth: number): string {
  return fields.slice(0, depth + 1).map((field, index) => `${field}:${values[index] || 'Unassigned'}`).join('|');
}

function rowGroupId(fields: string[], values: string[], depth: number): string {
  return fields.slice(0, depth + 1).map((field, index) => `${field}:${values[index] ?? 'Unassigned'}`).join('|');
}

function compositeValues(row: Record<string, unknown>, fields: string[]): string[] {
  return fields.map(field => String(row[field] ?? '')).filter(Boolean);
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, index) => start + index);
}

function expandedColumnIndexes(columnIndex: number, valueCount: number): number[] {
  return Array.from({ length: valueCount }, (_, index) => columnIndex * valueCount + index);
}
