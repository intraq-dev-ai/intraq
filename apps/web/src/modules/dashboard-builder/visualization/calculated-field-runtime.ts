import type { VisualizationSpec } from '../types';
import {
  compareCalculatedValues,
  dateValue,
  evaluateBooleanExpression,
  evaluateExpression,
  interpolateTemplate,
  numericValue
} from './calculated-field-expression';
import { measureEncodings } from './spec';

export interface CalculatedField {
  aggregation?: string | undefined;
  analyticsFunction?: string | undefined;
  caseExpression?: string | undefined;
  conditions?: Array<Record<string, unknown>> | undefined;
  dateField?: string | undefined;
  defaultValue?: unknown;
  expression?: string | undefined;
  filterExpression?: string | undefined;
  filterField?: string | undefined;
  filterOperator?: string | undefined;
  filterValue?: unknown;
  fiscalStartMonth?: number | undefined;
  format?: string | undefined;
  grouping?: string | undefined;
  measure?: string | undefined;
  name: string;
  overwrite?: boolean | undefined;
  periods?: PeriodConfig[] | undefined;
  rankAscending?: boolean | undefined;
  sourceField?: string | undefined;
  template?: string | undefined;
  type: string;
  value?: unknown;
  valueField?: string | undefined;
  windowSize?: number | undefined;
  yearOffset?: number | undefined;
  yearType?: string | undefined;
}

interface PeriodConfig {
  end?: unknown;
  label?: string | undefined;
  start?: unknown;
}

export function aggregateCalculatedRows(rows: Array<Record<string, unknown>>, field: string, aggregation: string): number {
  const values = rows.map(row => Number(row[field])).filter(Number.isFinite);
  if (aggregation === 'count') return rows.length;
  if (values.length === 0) return 0;
  if (aggregation === 'avg' || aggregation === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === 'min') return Math.min(...values);
  if (aggregation === 'max') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

export function applyCalculatedFields(
  row: Record<string, unknown>,
  fields: CalculatedField[],
  index: number,
  rows: Array<Record<string, unknown>>
): Record<string, unknown> {
  const next = { ...row };
  for (const field of fields) {
    if (field.overwrite === false && hasPresentValue(next[field.name])) continue;
    next[field.name] = evaluateCalculatedField(field, next, index, rows);
  }
  return next;
}

export function readCalculatedFields(value: unknown): CalculatedField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = readString(record.name) ?? readString(record.field) ?? readString(record.key) ?? readString(record.id);
    const type = readString(record.type) ?? (readString(record.expression) || readString(record.formula) || readString(record.calculation) ? 'expression' : 'conditional');
    return name ? [{
      name,
      type,
      aggregation: readString(record.aggregation),
      analyticsFunction: readString(record.analyticsFunction ?? record.function ?? record.operation),
      caseExpression: readString(record.caseExpression),
      conditions: readConditions(record.conditions),
      dateField: readString(record.dateField),
      defaultValue: record.defaultValue,
      expression: readString(record.expression) ?? readString(record.formula) ?? readString(record.calculation),
      filterExpression: readString(record.filterExpression),
      filterField: readString(record.filterField),
      filterOperator: readString(record.filterOperator ?? record.operator),
      filterValue: record.filterValue,
      fiscalStartMonth: readFiniteNumber(record.fiscalStartMonth),
      format: readString(record.format),
      grouping: readString(record.grouping),
      measure: readString(record.measure ?? record.metric),
      overwrite: typeof record.overwrite === 'boolean' ? record.overwrite : undefined,
      periods: readPeriods(record.periods),
      rankAscending: typeof record.rankAscending === 'boolean' ? record.rankAscending : undefined,
      sourceField: readString(record.sourceField),
      template: readString(record.template),
      value: record.value,
      valueField: readString(record.valueField),
      windowSize: readFiniteNumber(record.windowSize),
      yearOffset: readFiniteNumber(record.yearOffset),
      yearType: readString(record.yearType)
    }] : [];
  });
}

export function usesCalculatedMeasure(spec: VisualizationSpec, fields: CalculatedField[]): boolean {
  const names = new Set(fields.map(field => field.name));
  return measureEncodings(spec).some(measure => names.has(measure.field));
}

function evaluateCalculatedField(
  field: CalculatedField,
  row: Record<string, unknown>,
  index: number,
  rows: Array<Record<string, unknown>>
): unknown {
  const type = field.type.toLowerCase();
  if (type === 'conditional') return evaluateConditional(field, row);
  if (type === 'text' || type === 'text_template') return interpolateTemplate(field.template ?? '', row);
  if (type === 'case_when') return evaluateCaseWhen(field.caseExpression ?? '', row, field.defaultValue);
  if (type === 'analytics') return evaluateAnalytics(field, row, index, rows);
  if (type === 'filter') return evaluateFilter(field, row);
  if (type === 'time_filter') return evaluateTimeFilter(field, row);
  if (type === 'dategrouping' || type === 'date_grouping') return evaluateDateGrouping(field, row);
  if (type === 'datetimeformat' || type === 'date_time_format') return evaluateDateTimeFormat(field, row);
  if (type === 'parameter_period_comparison') return evaluateParameterPeriodComparison(field, row);
  if (field.expression) return evaluateExpression(field.expression, row);
  return field.defaultValue ?? null;
}

function evaluateAnalytics(
  field: CalculatedField,
  row: Record<string, unknown>,
  index: number,
  rows: Array<Record<string, unknown>>
): unknown {
  const source = field.sourceField;
  if (!source) return field.defaultValue ?? null;
  const current = numericValue(row[source]);
  const fn = field.analyticsFunction ?? '';
  if (fn === 'running_total' || fn === 'running_column_total') {
    return rows.slice(0, index + 1).reduce((sum, item) => sum + numericValue(item[source]), 0);
  }
  if (fn === 'running_average') {
    const values = rows.slice(0, index + 1).map(item => numericValue(item[source]));
    return average(values);
  }
  if (fn === 'moving_average') {
    const windowSize = Math.max(1, field.windowSize ?? 7);
    return average(rows.slice(Math.max(0, index - windowSize + 1), index + 1).map(item => numericValue(item[source])));
  }
  if (fn === 'percent_of_total' || fn === 'percent_of_column') {
    const total = rows.reduce((sum, item) => sum + numericValue(item[source]), 0);
    return total === 0 ? 0 : current / total;
  }
  if (fn === 'percent_of_max') {
    const max = Math.max(...rows.map(item => numericValue(item[source])));
    return max === 0 ? 0 : current / max;
  }
  if (fn === 'percent_of_previous_row') return previousRatio(current, rows, index, source);
  if (fn === 'percent_change_from_previous_row' || fn === 'percent_change') return previousPercentChange(current, rows, index, source, field.defaultValue);
  if (fn === 'difference_from_previous_row') return previousDifference(current, rows, index, source, field.defaultValue);
  if (fn === 'year_over_year') return yearOverYearChange(field, current, row, rows);
  if (fn === 'rank' || fn === 'rank_of_column') {
    const sorted = [...rows].map(item => numericValue(item[source])).sort((a, b) => field.rankAscending ? a - b : b - a);
    return sorted.indexOf(current) + 1;
  }
  if (fn === 'lag') return offsetValue(rows, index, source, -Math.max(1, field.windowSize ?? 1), field.defaultValue);
  if (fn === 'lead') return offsetValue(rows, index, source, Math.max(1, field.windowSize ?? 1), field.defaultValue);
  return current;
}

function evaluateCaseWhen(expression: string, row: Record<string, unknown>, fallback: unknown): unknown {
  const matches = Array.from(expression.matchAll(/when\(([^,]+),\s*["']?([^"')]+)["']?\)/gi));
  for (const match of matches) {
    const condition = match[1]?.trim() ?? '';
    const result = match[2]?.trim() ?? '';
    if (evaluateBooleanExpression(condition, row)) return result;
  }
  const elseMatch = expression.match(/,\s*["']([^"']+)["']\s*\)\s*$/);
  return elseMatch?.[1] ?? fallback ?? null;
}

function evaluateConditional(field: CalculatedField, row: Record<string, unknown>): unknown {
  for (const condition of field.conditions ?? []) {
    const source = readString(condition.field);
    if (!source) continue;
    if (compareCalculatedValues(row[source], readString(condition.operator) ?? '==', condition.value)) {
      return condition.result ?? field.defaultValue ?? null;
    }
  }
  return field.defaultValue ?? null;
}

function evaluateDateGrouping(field: CalculatedField, row: Record<string, unknown>): unknown {
  const date = dateValue(field.sourceField ? row[field.sourceField] : undefined);
  if (!date) return field.defaultValue ?? null;
  const hour = date.getHours();
  if (field.grouping === 'timeOfDay') return hour < 6 ? 'Night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  if (field.grouping === 'mealPeriod') return hour < 11 ? 'Breakfast' : hour < 16 ? 'Lunch' : hour < 22 ? 'Dinner' : 'Late Night';
  if (field.grouping === 'dayOfWeek') return date.toLocaleDateString('en-US', { weekday: 'long' });
  if (field.grouping === 'weekdayWeekend') return date.getDay() === 0 || date.getDay() === 6 ? 'Weekend' : 'Weekday';
  if (field.grouping === 'dayOfWeekNumber') return date.getDay() === 0 ? 7 : date.getDay();
  if (field.grouping === 'month') return date.toLocaleDateString('en-US', { month: 'long' });
  return field.defaultValue ?? null;
}

function evaluateDateTimeFormat(field: CalculatedField, row: Record<string, unknown>): unknown {
  const date = dateValue(field.sourceField ? row[field.sourceField] : undefined);
  if (!date) return field.defaultValue ?? null;
  if (field.format === 'YYYY-MM-DD') return date.toISOString().slice(0, 10);
  if (field.format === 'MM/DD/YYYY') return date.toLocaleDateString('en-US');
  if (field.format === 'DD/MM/YYYY') return date.toLocaleDateString('en-GB');
  if (field.format === 'Month Name') return date.toLocaleDateString('en-US', { month: 'long' });
  if (field.format === 'Day of Week') return date.toLocaleDateString('en-US', { weekday: 'long' });
  if (field.format === 'Quarter') return `Q${Math.floor(date.getMonth() / 3) + 1}`;
  if (field.format === 'YYYY') return String(date.getFullYear());
  return date.toLocaleString();
}

function evaluateFilter(field: CalculatedField, row: Record<string, unknown>): unknown {
  if (field.filterExpression || field.expression) return evaluateBooleanExpression(field.filterExpression ?? field.expression ?? '', row);
  const source = field.filterField ?? field.sourceField;
  if (!source) return field.defaultValue ?? false;
  return compareCalculatedValues(row[source], field.filterOperator ?? 'equals', field.filterValue ?? field.value);
}

function evaluateParameterPeriodComparison(field: CalculatedField, row: Record<string, unknown>): unknown {
  const source = field.valueField ?? field.measure ?? field.sourceField;
  if (!source) return field.defaultValue ?? null;
  const rowDate = field.dateField ? dateValue(row[field.dateField]) : null;
  if (rowDate && field.periods?.length && !field.periods.some(period => dateInPeriod(rowDate, period))) {
    return field.defaultValue ?? null;
  }
  return row[source] ?? field.defaultValue ?? null;
}

function evaluateTimeFilter(field: CalculatedField, row: Record<string, unknown>): unknown {
  const date = dateValue(field.dateField ? row[field.dateField] : undefined);
  if (!date || !field.valueField) return field.defaultValue ?? null;
  const now = new Date();
  const offset = field.yearOffset ?? 0;
  const targetYear = field.yearType === 'fiscal'
    ? fiscalYear(now, field.fiscalStartMonth ?? 1) - offset
    : now.getFullYear() - offset;
  const rowYear = field.yearType === 'fiscal'
    ? fiscalYear(date, field.fiscalStartMonth ?? 1)
    : date.getFullYear();
  return rowYear === targetYear ? row[field.valueField] : field.defaultValue ?? null;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function dateInPeriod(date: Date, period: PeriodConfig): boolean {
  const start = dateValue(period.start);
  const end = dateValue(period.end);
  return (!start || date >= start) && (!end || date <= end);
}

function fiscalYear(date: Date, startMonth: number): number {
  const month = date.getMonth() + 1;
  return month >= startMonth ? date.getFullYear() : date.getFullYear() - 1;
}

function hasPresentValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function offsetValue(rows: Array<Record<string, unknown>>, index: number, source: string, offset: number, fallback: unknown): unknown {
  const target = rows[index + offset];
  return target ? numericValue(target[source]) : fallback ?? null;
}

function previousDifference(current: number, rows: Array<Record<string, unknown>>, index: number, source: string, fallback: unknown): unknown {
  if (index === 0) return fallback ?? 0;
  return current - numericValue(rows[index - 1]?.[source]);
}

function previousPercentChange(current: number, rows: Array<Record<string, unknown>>, index: number, source: string, fallback: unknown): unknown {
  if (index === 0) return fallback ?? 0;
  const previous = numericValue(rows[index - 1]?.[source]);
  return previous === 0 ? 0 : (current - previous) / Math.abs(previous);
}

function previousRatio(current: number, rows: Array<Record<string, unknown>>, index: number, source: string): number {
  if (index === 0) return 0;
  const previous = numericValue(rows[index - 1]?.[source]);
  return previous === 0 ? 0 : current / previous;
}

function readConditions(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const conditions = value.flatMap(condition =>
    condition && typeof condition === 'object' && !Array.isArray(condition) ? [condition as Record<string, unknown>] : []
  );
  return conditions.length > 0 ? conditions : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readPeriods(value: unknown): PeriodConfig[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const periods = value.flatMap(period => {
    if (!period || typeof period !== 'object' || Array.isArray(period)) return [];
    const record = period as Record<string, unknown>;
    return [{ end: record.end ?? record.to ?? record.endDate, label: readString(record.label), start: record.start ?? record.from ?? record.startDate }];
  });
  return periods.length > 0 ? periods : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function yearOverYearChange(
  field: CalculatedField,
  current: number,
  row: Record<string, unknown>,
  rows: Array<Record<string, unknown>>
): unknown {
  if (!field.sourceField) return field.defaultValue ?? null;
  const rowDate = field.dateField ? dateValue(row[field.dateField]) : null;
  const compareRow = rowDate
    ? rows.find(candidate => {
      const candidateDate = field.dateField ? dateValue(candidate[field.dateField]) : null;
      return candidateDate
        && candidateDate.getFullYear() === rowDate.getFullYear() - Math.max(1, field.yearOffset ?? 1)
        && candidateDate.getMonth() === rowDate.getMonth()
        && candidateDate.getDate() === rowDate.getDate();
    })
    : undefined;
  const previous = compareRow ? numericValue(compareRow[field.sourceField]) : 0;
  return previous === 0 ? field.defaultValue ?? 0 : (current - previous) / Math.abs(previous);
}
