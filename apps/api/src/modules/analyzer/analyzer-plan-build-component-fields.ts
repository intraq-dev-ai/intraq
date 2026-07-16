import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  defaultSummarizeForCalculatedField,
  defaultSummarizeForField
} from './analyzer-plan-column-summary.js';
import { derivedColumnsForTable } from './analyzer-plan-derived-columns.js';
import {
  analyzerFieldIsMeasure,
  analyzerFieldMetadata
} from './analyzer-plan-field-matching.js';
import { analyzerVisibleFieldNames } from './analyzer-plan-field-visibility.js';
import { analyzerParameterNamesForTable } from './analyzer-plan-parameter-values.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import type {
  AnalyzerActionStep,
  AnalyzerColumnReadResult
} from './analyzer-plan-build-component-types.js';

export function readCreateTableColumns(
  value: unknown,
  table: TableDefinition,
  calculatedFields: string[] = [],
  options: { preserveRawMeasures?: boolean } = {}
): AnalyzerColumnReadResult {
  if (!Array.isArray(value)) return { columns: [], invalidFields: [] };
  const visibleFieldNames = analyzerVisibleFieldNames(table);
  const hiddenFieldNames = new Set(table.fields
    .filter(field => !visibleFieldNames.has(field.name))
    .map(field => field.name));
  const validFields = new Set([
    ...visibleFieldNames,
    ...calculatedFields
  ]);
  const parameterNames = analyzerParameterNamesForTable(table);
  const columns: AnalyzerColumnReadResult['columns'] = [];
  const invalidFields: string[] = [];
  for (const item of value) {
    const record = typeof item === 'string' ? { field: item } : isRecord(item) ? item : null;
    const field = readString(record?.field) ?? readString(record?.name);
    if (!field) continue;
    if (hiddenFieldNames.has(field)) continue;
    if (!validFields.has(field)) {
      if (parameterNames.has(field)) continue;
      invalidFields.push(field);
      continue;
    }
    const fieldDefinition = table.fields.find(item => item.name === field);
    const summarize = normalizeSummarize(record?.summarize ?? record?.aggregation ?? record?.aggregationType);
    if (!summarize) {
      invalidFields.push(field);
      continue;
    }
    const safeSummarize = fieldDefinition
      ? safeSummarizeForActionField(table, fieldDefinition, summarize, options)
      : summarize;
    columns.push({
      ...record,
      field,
      summarize: safeSummarize === 'none'
        ? fieldDefinition ? defaultSummarizeForActionField(table, fieldDefinition, options) : defaultSummarizeForCalculatedField(field)
        : safeSummarize
    });
  }
  return { columns, invalidFields };
}

export function invalidFieldsFromActions(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  calculatedFields: string[] = calculatedFieldNames(actions)
): string[] {
  const validFields = new Set([
    ...analyzerVisibleFieldNames(table),
    ...calculatedFields,
    ...analyzerParameterNamesForTable(table)
  ]);
  const hiddenFieldNames = new Set(table.fields
    .filter(field => !validFields.has(field.name))
    .map(field => field.name));
  const fields = new Set<string>();
  for (const action of actions) {
    for (const field of fieldReferencesFromAction(action)) {
      if (hiddenFieldNames.has(field)) continue;
      if (!validFields.has(field)) fields.add(field);
    }
  }
  return Array.from(fields);
}

export function validCalculatedFieldNames(actions: AnalyzerActionStep[], table: TableDefinition): string[] {
  const metadataDerivedColumnNames = new Set(derivedColumnsForTable(table).map(column => column.name));
  return uniqueStrings([
    ...calculatedFieldNames(actions).filter(name => metadataDerivedColumnNames.has(name)),
    ...derivedColumnsForTable(table).map(column => column.name)
  ]);
}

function fieldReferencesFromAction(action: AnalyzerActionStep): string[] {
  if (action.action === 'add_calculated_field') return [];
  const params = action.params;
  return [
    readString(params.field),
    readString(params.valueField),
    readString(params.xField),
    readString(params.yField),
    readString(params.groupByField),
    ...readStringArray(params.fields),
    ...readStringArray(params.yFields),
    ...readStringArray(params.series)
  ].filter((field): field is string => Boolean(field));
}

function calculatedFieldNames(actions: AnalyzerActionStep[]): string[] {
  return actions.flatMap(action => {
    if (action.action !== 'add_calculated_field') return [];
    const name = readString(action.params.name)
      ?? readString(action.params.field)
      ?? readString(action.params.key);
    return name ? [name] : [];
  });
}

function defaultSummarizeForActionField(
  table: TableDefinition,
  field: TableDefinition['fields'][number],
  options: { preserveRawMeasures?: boolean } = {}
): string {
  if (options.preserveRawMeasures) return 'none';
  if (!analyzerFieldIsMeasure(table, field)) return 'none';
  return metadataFieldSummarize(table, field, ['aggregation', 'defaultAggregation', 'summarize'])
    ?? defaultSummarizeForField(field);
}

function safeSummarizeForActionField(
  table: TableDefinition,
  field: TableDefinition['fields'][number],
  summarize: string,
  options: { preserveRawMeasures?: boolean } = {}
): string {
  if (summarize === 'none') return summarize;
  if (options.preserveRawMeasures) return 'none';
  if (fieldIsIdentifierLike(table, field) && ['sum', 'avg', 'min', 'max'].includes(summarize)) return 'none';
  return metadataFieldSummarize(table, field, ['aggregation']) ?? summarize;
}

function metadataFieldSummarize(
  table: TableDefinition,
  field: TableDefinition['fields'][number],
  keys: string[]
): string | null {
  const metadata = analyzerFieldMetadata(table, field.name);
  for (const key of keys) {
    const summarize = normalizeSummarize(metadata[key]);
    if (summarize && summarize !== 'none') return summarize;
  }
  return null;
}

function fieldIsIdentifierLike(table: TableDefinition, field: TableDefinition['fields'][number]): boolean {
  const metadata = analyzerFieldMetadata(table, field.name);
  const semanticValues = readStringArray([
    field.role,
    field.columnType,
    field.semanticRole,
    metadata.role,
    metadata.columnType,
    metadata.semanticRole,
    metadata.metricType
  ]);
  if (semanticValues.some(value => {
    const normalized = value.trim().toLowerCase().replace(/[\s-]/g, '_');
    return normalized === 'identifier'
      || normalized === 'foreign_key'
      || normalized === 'join_key'
      || normalized === 'primary_key';
  })) {
    return true;
  }
  const fieldText = `${field.name} ${field.description} ${field.dictionaryDescription}`.toLowerCase();
  return fieldText.includes('identifier')
    || fieldText.includes('join key')
    || /(^|_)(id|key)($|_)/i.test(field.name);
}

function normalizeSummarize(value: unknown): string | null {
  const summarize = readString(value) ?? 'none';
  const normalized = summarize.trim().toLowerCase().replace(/[\s_-]/g, '');
  const aliases: Record<string, string> = {
    average: 'avg',
    avg: 'avg',
    count: 'count',
    countdistinct: 'countDistinct',
    dimension: 'none',
    distinct: 'countDistinct',
    distinctcount: 'countDistinct',
    first: 'first',
    groupby: 'none',
    last: 'last',
    max: 'max',
    maximum: 'max',
    mean: 'avg',
    min: 'min',
    minimum: 'min',
    none: 'none',
    raw: 'none',
    sum: 'sum',
    total: 'sum',
    unique: 'countDistinct',
    uniquecount: 'countDistinct'
  };
  const canonical = aliases[normalized] ?? summarize;
  if (
    canonical === 'none'
    || canonical === 'sum'
    || canonical === 'avg'
    || canonical === 'min'
    || canonical === 'max'
    || canonical === 'count'
    || canonical === 'countDistinct'
    || canonical === 'first'
    || canonical === 'last'
  ) {
    return canonical;
  }
  return null;
}
