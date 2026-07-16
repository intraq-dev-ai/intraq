import { formatMetric } from './formatting';
import type { TableGroupRenderOptions } from './table-group-config';
import type { DashboardTableCell, DashboardTableColumn, DashboardTableGroupRow, DashboardTableGroupTotalRow, DashboardTableRow } from './view-model-types';
export {
  readTableGroupDefaultCollapsed,
  readTableGroupFields,
  readTableGroupHideColumns,
  readTableGroupTotalsEnabled,
  type TableGroupRenderOptions
} from './table-group-config';

export interface TableFilterState {
  caseSensitive?: boolean;
  columnKey: string;
  operator?: TableFilterOperator;
  query?: string;
  secondaryQuery?: string;
  selectedValues?: string[];
}

export type TableFilterOperator =
  | 'between'
  | 'contains'
  | 'ends_with'
  | 'equals'
  | 'greater_equal'
  | 'greater_than'
  | 'is_empty'
  | 'is_not_empty'
  | 'less_equal'
  | 'less_than'
  | 'not_equals'
  | 'starts_with'
  | 'in_list';

export interface TableFilterOption {
  count: number;
  label: string;
  value: string;
}

export interface TableSortState {
  direction: 'asc' | 'desc';
  key: string;
}

export function filterTableRows(
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[],
  filters: TableFilterState | TableFilterState[] | null | undefined
): DashboardTableRow[] {
  const activeFilters = normalizeTableFilters(filters);
  if (activeFilters.length === 0) return rows;
  const compiled = activeFilters
    .map(filter => compileTableFilter(columns, filter))
    .filter((filter): filter is CompiledTableFilter => filter !== null);
  if (compiled.length === 0) return rows;
  return rows.filter(row => compiled.every(filter => cellMatchesFilter(row, filter.columnIndex, filter)));
}

export function normalizeTableFilters(
  filters: TableFilterState | TableFilterState[] | null | undefined
): TableFilterState[] {
  const items = Array.isArray(filters) ? filters : filters ? [filters] : [];
  const active = items
    .flatMap(filter => normalizeTableFilter(filter))
    .filter(filter => tableFilterIsActive(filter));
  const byColumn = new Map<string, TableFilterState>();
  active.forEach(filter => byColumn.set(filter.columnKey, filter));
  return Array.from(byColumn.values());
}

export function tableFilterOptions(
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[],
  columnKey: string
): TableFilterOption[] {
  const columnIndex = columns.findIndex(column => column.key === columnKey);
  if (columnIndex < 0) return [];
  const counts = new Map<string, TableFilterOption>();
  rows.forEach(row => {
    const cell = row.cells[columnIndex];
    if (!cell) return;
    const value = tableFilterOptionValue(cell);
    const existing = counts.get(value);
    if (existing) {
      existing.count += 1;
      return;
    }
    counts.set(value, { count: 1, label: value.length > 0 ? value : '(Blank)', value });
  });
  return Array.from(counts.values()).sort((left, right) => compareFilterOptions(left, right));
}

export function sortTableRows(
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[],
  sorts: TableSortState | TableSortState[] | null | undefined
): DashboardTableRow[] {
  const activeSorts = normalizeTableSorts(sorts);
  if (activeSorts.length === 0) return rows;
  return [...rows].sort((left, right) => compareTableRows(left, right, columns, activeSorts));
}

export function normalizeTableSorts(
  sorts: TableSortState | TableSortState[] | null | undefined
): TableSortState[] {
  const items = Array.isArray(sorts) ? sorts : sorts ? [sorts] : [];
  const deduped = new Map<string, TableSortState>();
  items.forEach(sort => {
    if (!sort || typeof sort.key !== 'string' || !sort.key.trim()) return;
    deduped.set(sort.key, { direction: sort.direction === 'desc' ? 'desc' : 'asc', key: sort.key.trim() });
  });
  return Array.from(deduped.values());
}

export function dashboardTableRowKey(row: Pick<DashboardTableRow, 'key'>, fallbackIndex: number): string {
  return row.key || String(fallbackIndex);
}

export function tableCellSearchText(display: string, raw: unknown): string {
  return normalizedCellValues(display, raw).join(' ');
}

export function tablePageSizeOptions(pageSize: number, configured: unknown): number[] {
  const source = Array.isArray(configured) ? configured : [10, 25, 50, 100, 200];
  return Array.from(new Set([...source.flatMap(positiveInteger), pageSize])).sort((left, right) => left - right);
}

export function groupedTableRows(
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[],
  showTotals: boolean,
  options: TableGroupRenderOptions = {}
): Array<DashboardTableRow | DashboardTableGroupRow | DashboardTableGroupTotalRow> {
  const maxDepth = Math.max(...rows.map(row => normalizedGroupValues(row, options).length), 0);
  if (maxDepth === 0) return rows;
  return groupedTableRowsAtDepth(rows, columns, showTotals, options.showHeaderTotals ?? showTotals, 0, [], options);
}

interface CompiledTableFilter extends TableFilterState {
  columnIndex: number;
  operator: TableFilterOperator;
  query: string;
  secondaryQuery: string;
}

function normalizeTableFilter(filter: TableFilterState): TableFilterState[] {
  if (!filter || typeof filter.columnKey !== 'string' || filter.columnKey.trim().length === 0) return [];
  return [{
    ...filter,
    columnKey: filter.columnKey.trim(),
    query: String(filter.query ?? ''),
    secondaryQuery: String(filter.secondaryQuery ?? ''),
    ...(Array.isArray(filter.selectedValues)
      ? { selectedValues: filter.selectedValues.map(value => String(value)) }
      : {})
  }];
}

function tableFilterIsActive(filter: TableFilterState): boolean {
  if (Array.isArray(filter.selectedValues)) return true;
  const operator = filter.operator ?? 'contains';
  const query = String(filter.query ?? '').trim();
  const secondaryQuery = String(filter.secondaryQuery ?? '').trim();
  return filterHasRequiredQuery(operator, query, secondaryQuery);
}

function compileTableFilter(columns: DashboardTableColumn[], filter: TableFilterState): CompiledTableFilter | null {
  const columnIndex = columns.findIndex(column => column.key === filter.columnKey);
  if (columnIndex < 0) return null;
  return {
    ...filter,
    columnIndex,
    operator: filter.operator ?? 'contains',
    query: String(filter.query ?? '').trim(),
    secondaryQuery: String(filter.secondaryQuery ?? '').trim()
  };
}

function cellMatchesFilter(row: DashboardTableRow, columnIndex: number, filter: CompiledTableFilter): boolean {
  const cell = row.cells[columnIndex];
  if (!cell) return false;
  if (Array.isArray(filter.selectedValues)) {
    const value = tableFilterOptionValue(cell);
    return filter.selectedValues.includes(value);
  }
  const values = normalizedCellValues(cell.display, cell.raw, filter.caseSensitive === true);
  const normalizedQuery = normalizeText(filter.query, filter.caseSensitive === true);
  switch (filter.operator) {
    case 'equals':
      return values.some(value => value === normalizedQuery);
    case 'not_equals':
      return values.every(value => value !== normalizedQuery);
    case 'greater_than':
      return compareNumericCell(cell, filter.query, value => value > 0);
    case 'less_than':
      return compareNumericCell(cell, filter.query, value => value < 0);
    case 'greater_equal':
      return compareNumericCell(cell, filter.query, value => value >= 0);
    case 'less_equal':
      return compareNumericCell(cell, filter.query, value => value <= 0);
    case 'between':
      return compareNumericCellBetween(cell, filter.query, filter.secondaryQuery ?? '');
    case 'in_list':
      return listValues(filter.query, filter.caseSensitive === true).some(value => values.includes(value));
    case 'starts_with':
      return values.some(value => value.startsWith(normalizedQuery));
    case 'ends_with':
      return values.some(value => value.endsWith(normalizedQuery));
    case 'is_empty':
      return values.every(value => value.trim().length === 0);
    case 'is_not_empty':
      return values.some(value => value.trim().length > 0);
    case 'contains':
      return values.some(value => value.includes(normalizedQuery));
  }
}

function tableFilterOptionValue(cell: DashboardTableCell): string {
  const display = String(cell.display ?? '').trim();
  if (display.length > 0) return display;
  if (cell.raw === null || cell.raw === undefined) return '';
  if (typeof cell.raw === 'object') return safeJson(cell.raw).trim();
  return String(cell.raw).trim();
}

function normalizedCellValues(display: string, raw: unknown, caseSensitive = false): string[] {
  const rawValue = typeof raw === 'object' && raw !== null ? safeJson(raw) : String(raw ?? '');
  return [display, rawValue].map(value => normalizeText(value, caseSensitive));
}

function safeJson(value: object): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function filterHasRequiredQuery(operator: TableFilterOperator, query: string, secondaryQuery: string): boolean {
  if (operator === 'is_empty' || operator === 'is_not_empty') return true;
  if (operator === 'between') return query.length > 0 && secondaryQuery.length > 0;
  return query.length > 0;
}

function normalizeText(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function compareNumericCell(cell: DashboardTableCell, query: string, predicate: (comparison: number) => boolean): boolean {
  const left = numericCellValue(cell);
  const right = numericValue(query);
  return left !== null && right !== null && predicate(left - right);
}

function compareNumericCellBetween(cell: DashboardTableCell, minimumQuery: string, maximumQuery: string): boolean {
  const value = numericCellValue(cell);
  const minimum = numericValue(minimumQuery);
  const maximum = numericValue(maximumQuery);
  return value !== null && minimum !== null && maximum !== null && value >= Math.min(minimum, maximum) && value <= Math.max(minimum, maximum);
}

function listValues(query: string, caseSensitive: boolean): string[] {
  return query.split(',').map(value => normalizeText(value.trim(), caseSensitive)).filter(Boolean);
}

function numericCellValue(cell: DashboardTableCell): number | null {
  if (cell.numeric !== null && cell.numeric !== undefined && Number.isFinite(cell.numeric)) return cell.numeric;
  return numericValue(cell.raw) ?? numericValue(cell.display);
}

function numericValue(value: unknown): number | null {
  const candidate = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(/[$,%\s,]/g, ''));
  return Number.isFinite(candidate) ? candidate : null;
}

function compareFilterOptions(left: TableFilterOption, right: TableFilterOption): number {
  if (left.value.length === 0 && right.value.length > 0) return 1;
  if (right.value.length === 0 && left.value.length > 0) return -1;
  const leftNumeric = numericValue(left.value);
  const rightNumeric = numericValue(right.value);
  if (leftNumeric !== null && rightNumeric !== null) return leftNumeric - rightNumeric;
  return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' });
}

function compareTableRows(
  left: DashboardTableRow,
  right: DashboardTableRow,
  columns: DashboardTableColumn[],
  sorts: TableSortState[]
): number {
  for (const sort of sorts) {
    const comparison = compareTableRowForSort(left, right, columns, sort);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function compareTableRowForSort(
  left: DashboardTableRow,
  right: DashboardTableRow,
  columns: DashboardTableColumn[],
  sort: TableSortState
): number {
  const columnIndex = columns.findIndex(column => column.key === sort.key);
  if (columnIndex < 0) return compareRawValues(left.raw?.[sort.key], right.raw?.[sort.key], sort.direction);
  const multiplier = sort.direction === 'desc' ? -1 : 1;
  const leftCell = left.cells[columnIndex];
  const rightCell = right.cells[columnIndex];
  if (leftCell?.numeric !== null && leftCell?.numeric !== undefined && rightCell?.numeric !== null && rightCell?.numeric !== undefined) {
    return multiplier * ((leftCell.numeric ?? 0) - (rightCell.numeric ?? 0));
  }
  return multiplier * String(leftCell?.raw ?? '').localeCompare(String(rightCell?.raw ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function compareRawValues(left: unknown, right: unknown, direction: 'asc' | 'desc'): number {
  const multiplier = direction === 'desc' ? -1 : 1;
  const leftNumber = typeof left === 'number' && Number.isFinite(left) ? left : Number(left);
  const rightNumber = typeof right === 'number' && Number.isFinite(right) ? right : Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return multiplier * (leftNumber - rightNumber);
  return multiplier * String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function groupRow(
  label: string,
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[],
  showTotals: boolean,
  depth: number,
  path: string[]
): DashboardTableGroupRow {
  return {
    cells: columns.map((column, index) => groupCell(label, rows, column, index, showTotals && column.cellType !== 'actions')),
    count: rows.length,
    depth,
    isGroup: true,
    key: groupKey(path),
    label,
    path,
    ...(showTotals ? groupTotalSummary(rows, columns) : {})
  };
}

function groupTotalRow(
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[],
  depth: number,
  path: string[],
  options: TableGroupRenderOptions
): DashboardTableGroupTotalRow {
  const groupRowKey = groupKey(path);
  const firstNumericIndex = columns.findIndex((column, index) => column.cellType !== 'actions' && numericGroupValues(rows, index).length > 0);
  const label = options.subtotalLabel ?? `${path.at(-1) ?? options.emptyGroupLabel ?? 'Ungrouped'} subtotal`;
  return {
    cells: columns.map((column, index) => groupTotalCell(rows, column, index, firstNumericIndex, label)),
    depth,
    groupKey: groupRowKey,
    isGroupTotal: true,
    key: `${groupRowKey}:total`,
    label,
    path
  };
}

function groupCell(label: string, rows: DashboardTableRow[], column: DashboardTableColumn, index: number, showTotal: boolean): DashboardTableCell {
  if (index === 0) return { display: label, numeric: null, ratio: null, raw: label, sparkline: [], tone: 'neutral' };
  const values = numericGroupValues(rows, index);
  const total = showTotal && values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  return { display: total === null ? '' : formatGroupTotal(total, column), numeric: total, ratio: null, raw: total, sparkline: [], tone: 'neutral' };
}

function groupTotalCell(
  rows: DashboardTableRow[],
  column: DashboardTableColumn,
  index: number,
  firstNumericIndex: number,
  subtotalLabel: string
): DashboardTableCell {
  if (column.cellType === 'actions') return tableTotalCell('', null);
  const values = numericGroupValues(rows, index);
  if (values.length > 0) {
    const total = values.reduce((sum, value) => sum + value, 0);
    return tableTotalCell(formatGroupTotal(total, column), total);
  }
  return tableTotalCell(index === 0 || (firstNumericIndex > 0 && index < firstNumericIndex) ? subtotalLabel : '', null);
}

function tableTotalCell(display: string, raw: unknown): DashboardTableCell {
  return { display, isTotal: true, numeric: typeof raw === 'number' ? raw : null, ratio: null, raw, sparkline: [], tone: 'neutral' };
}

function groupTotalSummary(
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[]
): Pick<DashboardTableGroupRow, 'totalSummary'> {
  const summary = columns
    .flatMap((column, index) => {
      if (column.cellType === 'actions') return [];
      const values = rows.map(row => row.cells[index]?.numeric).filter((value): value is number => value !== null && value !== undefined);
      if (values.length === 0) return [];
      const total = values.reduce((sum, value) => sum + value, 0);
      return [`${column.label}: ${formatGroupTotal(total, column)}`];
    });
  return summary.length > 0 ? { totalSummary: summary.join(' · ') } : {};
}

function numericGroupValues(rows: DashboardTableRow[], columnIndex: number): number[] {
  return rows.map(row => row.cells[columnIndex]?.numeric).filter((value): value is number => value !== null && value !== undefined);
}

function formatGroupTotal(total: number, column: DashboardTableColumn): string {
  const config = column.displayConfig;
  return column.format
    ? formatMetric(total, column.format, {
      ...(config?.currencySymbol ? { currencySymbol: config.currencySymbol } : {}),
      ...(config?.maximumFractionDigits !== undefined ? { maximumFractionDigits: config.maximumFractionDigits } : {}),
      ...(config?.minimumFractionDigits !== undefined ? { minimumFractionDigits: config.minimumFractionDigits } : {}),
      ...(config?.precision !== undefined ? { precision: config.precision } : {}),
      ...(config?.prefix ? { prefix: config.prefix } : {}),
      ...(config?.suffix ? { suffix: config.suffix } : {}),
      ...(config?.thousandsSeparator ? { thousandsSeparator: config.thousandsSeparator } : {})
    })
    : String(total);
}

function positiveInteger(value: unknown): number[] {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? [Math.floor(value)] : [];
}

function groupedTableRowsAtDepth(
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[],
  showTotals: boolean,
  showHeaderTotals: boolean,
  depth: number,
  parentPath: string[],
  options: TableGroupRenderOptions
): Array<DashboardTableRow | DashboardTableGroupRow | DashboardTableGroupTotalRow> {
  const groups = new Map<string, DashboardTableRow[]>();
  const flatRows: DashboardTableRow[] = [];
  rows.forEach(row => {
    const values = normalizedGroupValues(row, options);
    const label = values[depth] ?? '';
    if (!label && options.emptyGroupBehavior === 'flatten') {
      flatRows.push(row);
      return;
    }
    groups.set(label, [...(groups.get(label) ?? []), row]);
  });
  return [
    ...flatRows,
    ...Array.from(groups.entries()).flatMap(([label, groupRows]) => {
    const path = [...parentPath, label];
    const hasNestedGroups = groupRows.some(row => normalizedGroupValues(row, options).length > depth + 1);
    return [
      groupRow(label, groupRows, columns, showHeaderTotals, depth, path),
      ...(hasNestedGroups ? groupedTableRowsAtDepth(groupRows, columns, showTotals, showHeaderTotals, depth + 1, path, options) : groupRows),
      ...(showTotals ? [groupTotalRow(groupRows, columns, depth, path, options)] : [])
    ];
    })
  ];
}

function normalizedGroupValues(row: DashboardTableRow, options: TableGroupRenderOptions = {}): string[] {
  const values = row.groupValues?.map(value => value.trim()).filter(Boolean) ?? [];
  if (values.length === 0 && options.emptyGroupBehavior === 'flatten') return [];
  return values.length > 0 ? values : [options.emptyGroupLabel ?? 'Ungrouped'];
}

function groupKey(path: string[]): string {
  return `group:${path.join(' / ')}`;
}
