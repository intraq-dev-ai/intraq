import type { IncomingMessage } from 'node:http';
import { readJsonBody } from '../../http.js';
import {
  findTableInDataSource,
  tablePathSlug
} from './foundation-store.js';
import {
  asNonNegativeInteger,
  asPositiveInteger,
  asString,
  isRecord,
  stringArray
} from './data-source-table-common.js';

export async function readTableDataRequestOptions(
  req: IncomingMessage,
  dataSourceId: string,
  tableName: string,
  targetAliases: string[] = [dataSourceId, tableName]
): Promise<{
  defaultLimit?: number;
  includePaginationProbe?: boolean;
  maxLimit?: number;
  offset?: number;
  page?: number;
  pageSize?: number;
  parameterValues?: Record<string, unknown>;
  selectFields?: string[];
}> {
  const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
  const record = isRecord(body) ? body : {};
  const requestedLimit = asPositiveInteger(record.limit)
    ?? asPositiveInteger(record.defaultLimit)
    ?? asPositiveInteger(record.pageSize)
    ?? asPositiveInteger(record.take);
  const requestedMaxLimit = asPositiveInteger(record.maxLimit);
  const requestedOffset = asNonNegativeInteger(record.offset) ?? asNonNegativeInteger(record.skip);
  const requestedPage = asPositiveInteger(record.page);
  const parameterValues = readParameterValues(record, targetAliases);
  const selectFields = stringArray(record.selectFields);
  const requestOptions = {
    includePaginationProbe: true,
    ...(requestedOffset !== undefined ? { offset: requestedOffset } : {}),
    ...(requestedPage !== undefined ? { page: requestedPage } : {}),
    ...(Object.keys(parameterValues).length > 0 ? { parameterValues } : {}),
    ...(selectFields.length > 0 ? { selectFields } : {})
  };
  if (requestedLimit && requestedMaxLimit) {
    return { ...requestOptions, defaultLimit: requestedLimit, pageSize: requestedLimit, maxLimit: requestedMaxLimit };
  }
  if (requestedLimit) {
    return { ...requestOptions, defaultLimit: requestedLimit, pageSize: requestedLimit, maxLimit: requestedLimit };
  }
  return { ...requestOptions, defaultLimit: 100, pageSize: 100 };
}

export function parameterTargetAliases(dataSourceId: string, tableName: string): string[] {
  const lookup = findTableInDataSource(dataSourceId, tableName);
  return Array.from(new Set([
    dataSourceId,
    tableName,
    ...(lookup ? [lookup.table.id, lookup.table.name, tablePathSlug(lookup.table)] : [])
  ].filter(Boolean)));
}

export function readParameterValues(
  body: Record<string, unknown>,
  targetAliases: string[]
): Record<string, unknown> {
  const explicit = isRecord(body.parameterValues)
    ? body.parameterValues
    : isRecord(body.parameters)
      ? body.parameters
      : {};
  const fromDashboardFilters = dashboardFilterParameterValues(body.dashboardFilters, targetAliases);
  return { ...fromDashboardFilters, ...explicit };
}

function dashboardFilterParameterValues(
  value: unknown,
  targetAliases: string[]
): Record<string, unknown> {
  if (!Array.isArray(value)) return {};
  const entries: Array<[string, unknown]> = [];
  for (const item of value) {
    if (!isRecord(item) || item.isActive === false) continue;
    const config = isRecord(item.config) ? item.config : {};
    if (config.isParameter !== true && !isRecord(config.parameterConfig)) continue;
    entries.push(...dashboardFilterParameterEntries(item, config, targetAliases));
  }
  return Object.fromEntries(entries);
}

function dashboardFilterParameterEntries(
  filter: Record<string, unknown>,
  config: Record<string, unknown>,
  targetAliases: string[]
): Array<[string, unknown]> {
  const mapped = targetAliases
    .map(alias => mappedParameterMapping(config.parameterMappings, alias))
    .find((value): value is ParameterMapping => value !== null && value !== undefined) ?? null;
  if (isPeriodFilter(filter, config) && isObjectParameterMapping(mapped)) {
    const derived = dashboardFilterPeriodDerivedValues(filter, config);
    return Object.entries(mapped).flatMap(([role, parameterName]) => {
      const value = periodParameterValue(role, derived);
      return parameterName && value !== undefined && value !== '' ? [[parameterName, value] as [string, unknown]] : [];
    });
  }
  if (isRangeParameterMapping(mapped)) {
    const range = dashboardFilterRangeValue(filter) ?? dashboardFilterSingleDateRangeValue(filter, config);
    if (!range) return [];
    return [
      ...(mapped.start ? [[mapped.start, range.start] as [string, unknown]] : []),
      ...(mapped.end ? [[mapped.end, range.end] as [string, unknown]] : [])
    ];
  }

  const parameterName = typeof mapped === 'string' ? mapped : dashboardFilterParameterName(filter, config, targetAliases);
  if (!parameterName || filter.value === undefined) return [];
  return [[parameterName, filter.value]];
}

function dashboardFilterParameterName(
  filter: Record<string, unknown>,
  config: Record<string, unknown>,
  targetAliases: string[]
): string | null {
  const mapped = targetAliases
    .map(alias => mappedParameterName(config.parameterMappings, alias))
    .find((value): value is string => Boolean(value));
  if (mapped) return mapped;

  const targetTable = asString(config.tableName) ?? asString(config.dataSourceId);
  const targets = new Set([
    ...stringArray(config.targetDataSources),
    ...stringArray(config.selectedDataSources),
    ...(targetTable ? [targetTable] : [])
  ]);
  const filterAppliesToRequest = targets.size === 0
    || targetAliases.some(alias => targets.has(alias))
    || (targetTable ? targetAliases.includes(targetTable) : false);
  if (!filterAppliesToRequest) return null;

  const parameterConfig = isRecord(config.parameterConfig) ? config.parameterConfig : {};
  return asString(parameterConfig.name)
    ?? asString(config.mappedField)
    ?? asString(filter.field)
    ?? asString(filter.name);
}

function mappedParameterName(value: unknown, key: string): string | null {
  const mapped = mappedParameterMapping(value, key);
  return typeof mapped === 'string' ? mapped : null;
}

type ParameterMapping = string | Record<string, string>;

function mappedParameterMapping(value: unknown, key: string): ParameterMapping | null {
  if (!isRecord(value)) return null;
  const mapping = value[key];
  if (typeof mapping === 'string') return asString(mapping);
  if (!isRecord(mapping)) return null;
  const entries = Object.entries(mapping).flatMap(([role, parameterName]) => {
    const normalizedParameter = asString(parameterName);
    return normalizedParameter ? [[role, normalizedParameter] as [string, string]] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function isRangeParameterMapping(value: ParameterMapping | null): value is { end?: string; start?: string } {
  return isRecord(value) && (asString(value.start) !== null || asString(value.end) !== null);
}

function isObjectParameterMapping(value: ParameterMapping | null): value is Record<string, string> {
  return isRecord(value);
}

function dashboardFilterRangeValue(
  filter: Record<string, unknown>
): { end: unknown; start: unknown } | null {
  const value = filter.value;
  if (Array.isArray(value) && value.length >= 2 && value[0] !== undefined && value[1] !== undefined) {
    return { start: value[0], end: value[1] };
  }
  if (isRecord(value)) {
    const range = isRecord(value.range) ? value.range : value;
    const start = range.start ?? range.from ?? range.startDate ?? range.fromDate ?? range.min;
    const end = range.end ?? range.to ?? range.endDate ?? range.toDate ?? range.max;
    if (start !== undefined || end !== undefined) return { start, end };
  }
  return null;
}

function dashboardFilterSingleDateRangeValue(
  filter: Record<string, unknown>,
  config: Record<string, unknown>
): { end: unknown; start: unknown } | null {
  if (!isDatePickerFilter(filter, config)) return null;
  if (filter.value === undefined || filter.value === null || filter.value === '') return null;
  return { start: filter.value, end: filter.value };
}

function isDatePickerFilter(filter: Record<string, unknown>, config: Record<string, unknown>): boolean {
  const rawType = asString(config.inputType)
    ?? asString(config.filterType)
    ?? asString(config.type)
    ?? asString(filter.type)
    ?? '';
  const normalized = rawType.trim().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return ['date', 'datepicker', 'date-picker', 'date_picker'].includes(normalized);
}

function isPeriodFilter(filter: Record<string, unknown>, config: Record<string, unknown>): boolean {
  const rawType = asString(config.inputType)
    ?? asString(config.filterType)
    ?? asString(config.type)
    ?? asString(filter.type)
    ?? '';
  const normalized = rawType.trim().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return ['period', 'periodfilter', 'period-filter', 'period_filter'].includes(normalized)
    || asString(filter.operator ?? config.operator)?.toLowerCase() === 'period';
}

interface PeriodDerivedValues {
  endDate: string;
  endDateOnly: string;
  period: string;
  periodLabel: string;
  rangeFrequency: string;
  rangeType: string | number;
  rangeTypeText: string;
  selectedDate: string;
  selectedDay: string;
  startDate: string;
  startDateOnly: string;
}

function dashboardFilterPeriodDerivedValues(
  filter: Record<string, unknown>,
  config: Record<string, unknown>
): PeriodDerivedValues {
  const value = isRecord(filter.value) ? filter.value : isRecord(config.value) ? config.value : {};
  const period = asString(value.period) ?? asString(config.period) ?? asString(config.defaultPeriod) ?? 'day';
  const startDate = asString(value.startDate ?? value.start ?? config.startDate) ?? '';
  const endDate = asString(value.endDate ?? value.end ?? config.endDate) ?? '';
  const selectedDate = asString(value.selectedDate ?? value.date ?? config.selectedDate) ?? datePart(startDate);
  const option = periodOptionForConfig(config, period);
  return {
    endDate,
    endDateOnly: datePart(endDate),
    period,
    periodLabel: asString(option.label) ?? period,
    rangeFrequency: asString(option.rangeFrequency) ?? '',
    rangeType: option.rangeType as string | number ?? period,
    rangeTypeText: asString(option.rangeTypeText) ?? asString(option.rangeType) ?? period,
    selectedDate,
    selectedDay: datePart(selectedDate) || datePart(startDate),
    startDate,
    startDateOnly: datePart(startDate)
  };
}

function periodOptionForConfig(config: Record<string, unknown>, period: string): Record<string, unknown> {
  const options = Array.isArray(config.periodOptions) ? config.periodOptions : [];
  return options.find(option => isRecord(option) && asString(option.id ?? option.value ?? option.key) === period) as Record<string, unknown> | undefined ?? {};
}

function periodParameterValue(role: string, derived: PeriodDerivedValues): unknown {
  const normalized = role.trim().replace(/[\s_-]+/g, '').toLowerCase();
  const values: Record<string, unknown> = {
    end: derived.endDate,
    enddate: derived.endDate,
    enddatetime: derived.endDate,
    enddateonly: derived.endDateOnly,
    from: derived.startDate,
    fromdate: derived.startDate,
    fromdateonly: derived.startDateOnly,
    period: derived.period,
    periodlabel: derived.periodLabel,
    rangefrequency: derived.rangeFrequency,
    rangetype: derived.rangeType,
    rangetypetext: derived.rangeTypeText,
    selected: derived.selectedDate,
    selecteddate: derived.selectedDate,
    selectedday: derived.selectedDay,
    start: derived.startDate,
    startdate: derived.startDate,
    startdatetime: derived.startDate,
    startdateonly: derived.startDateOnly,
    to: derived.endDate,
    todate: derived.endDate,
    todateonly: derived.endDateOnly
  };
  return values[normalized];
}

function datePart(value: string): string {
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
}
