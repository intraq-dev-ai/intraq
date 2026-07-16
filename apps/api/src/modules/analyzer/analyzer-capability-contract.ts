import type {
  DataSourceRecord,
  FieldDefinition,
  TableDefinition
} from '../data-source/foundation-store.js';
import {
  analyzerFieldIsDimension,
  analyzerFieldIsMeasure,
  analyzerFieldMetadata
} from './analyzer-plan-field-matching.js';
import { analyzerVisibleFields } from './analyzer-plan-field-visibility.js';
import { derivedColumnsForTable } from './analyzer-plan-derived-columns.js';
import {
  businessNameForTable,
  firstRoutingRecord
} from './analyzer-plan-table-context.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { fieldValueResolutionForTable } from './analyzer-value-resolver.js';

export type AnalyzerCapabilityOperation =
  | 'list'
  | 'aggregate'
  | 'top_n'
  | 'trend'
  | 'compare'
  | 'bucket';

export type AnalyzerCapabilityFieldRole =
  | 'dimension'
  | 'identifier'
  | 'measure'
  | 'time'
  | 'unknown';

export type AnalyzerCapabilityFilterOperator =
  | 'between'
  | 'contains'
  | 'ends_with'
  | 'equals'
  | 'gt'
  | 'gte'
  | 'in'
  | 'is_not_null'
  | 'is_null'
  | 'lt'
  | 'lte'
  | 'not_contains'
  | 'not_equals'
  | 'not_in'
  | 'starts_with';

export interface AnalyzerCapabilityField {
  description?: string;
  format?: string;
  label?: string;
  name: string;
  role: AnalyzerCapabilityFieldRole;
  source: 'column' | 'derived';
  synonyms: string[];
  type: string;
}

export interface AnalyzerCapabilityFilterField extends AnalyzerCapabilityField {
  operators: AnalyzerCapabilityFilterOperator[];
}

export interface AnalyzerCapabilityBucketField extends AnalyzerCapabilityField {
  minimumBucketSize: number;
}

export interface AnalyzerModelCapabilityManifest {
  bucketableFields: AnalyzerCapabilityBucketField[];
  dataSourceId: string;
  dataSourceName: string;
  description?: string;
  dimensions: AnalyzerCapabilityField[];
  filterableFields: AnalyzerCapabilityFilterField[];
  grain?: string;
  groupableFields: AnalyzerCapabilityField[];
  measures: AnalyzerCapabilityField[];
  modelId: string;
  modelName: string;
  operations: AnalyzerCapabilityOperation[];
  primaryTimeField?: string;
  sampleQuestions: string[];
  timeFields: AnalyzerCapabilityField[];
}

export interface AnalyzerModelCapabilityPromptContract {
  bucketable: string[];
  dataSourceId: string;
  fields: Array<{
    label?: string;
    name: string;
    role: AnalyzerCapabilityFieldRole;
    synonyms?: string[];
    type: string;
  }>;
  filterOperators: Record<string, AnalyzerCapabilityFilterOperator[]>;
  grain?: string;
  groupable: string[];
  measures: string[];
  modelId: string;
  modelName: string;
  operations: AnalyzerCapabilityOperation[];
  primaryTimeField?: string;
  sampleQuestions?: string[];
  timeFields: string[];
}

export interface AnalyzerCapabilityFilterInvocation {
  field: string;
  operator: string;
  requestedText?: string;
  resolution?: Record<string, unknown>;
  value?: unknown;
}

export interface AnalyzerCapabilityBucketInvocation {
  field: string;
  size: number;
}

export interface AnalyzerCapabilityInvocation {
  bucket?: AnalyzerCapabilityBucketInvocation;
  filters?: AnalyzerCapabilityFilterInvocation[];
  groupBy?: string[];
  limit?: number;
  measure?: string;
  measures?: string[];
  operation: AnalyzerCapabilityOperation;
  orderBy?: Array<{ direction?: 'asc' | 'desc'; field: string }>;
}

export interface AnalyzerCapabilityValidationResult {
  errors: string[];
  normalized?: AnalyzerCapabilityNormalizedInvocation;
  ok: boolean;
}

interface AnalyzerCapabilityNormalizedInvocation {
  bucket?: AnalyzerCapabilityBucketInvocation;
  filters: Array<AnalyzerCapabilityFilterInvocation & { operator: AnalyzerCapabilityFilterOperator }>;
  groupBy: string[];
  measure?: string;
  measures?: string[];
  operation: AnalyzerCapabilityOperation;
}

const STRING_FILTER_OPERATORS: AnalyzerCapabilityFilterOperator[] = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_null',
  'is_not_null'
];

const NUMBER_FILTER_OPERATORS: AnalyzerCapabilityFilterOperator[] = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'is_null',
  'is_not_null'
];

const DATE_FILTER_OPERATORS: AnalyzerCapabilityFilterOperator[] = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'gte',
  'lte',
  'between',
  'is_null',
  'is_not_null'
];

const BOOLEAN_FILTER_OPERATORS: AnalyzerCapabilityFilterOperator[] = [
  'equals',
  'not_equals',
  'is_null',
  'is_not_null'
];

const CONTROLLED_VALUE_FILTER_OPERATORS: AnalyzerCapabilityFilterOperator[] = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'is_null',
  'is_not_null'
];

export function buildAnalyzerCapabilityManifest(
  source: DataSourceRecord,
  table: TableDefinition
): AnalyzerModelCapabilityManifest {
  const columnFields = analyzerVisibleFields(table).map(field => capabilityFieldForColumn(table, field));
  const derivedFields = derivedColumnsForTable(table).map(field => capabilityFieldForDerived(field));
  const fields = [...columnFields, ...derivedFields];
  const measures = fields.filter(field => field.role === 'measure');
  const dimensions = fields.filter(field => field.role === 'dimension' || field.role === 'identifier');
  const timeFields = fields.filter(field => field.role === 'time');
  const groupableFields = [...dimensions, ...timeFields];
  const filterableFields = fields.map(field => ({
    ...field,
    operators: operatorsForField(table, field)
  }));
  const bucketableFields = fields
    .filter(field => field.role === 'measure' && isNumericFieldType(field.type))
    .map(field => ({ ...field, minimumBucketSize: 1 }));
  const routing = firstRoutingRecord(table);
  const grain = readString(routing.grain);
  const primaryTimeField = readString(routing.primaryTimeField);
  return {
    bucketableFields,
    dataSourceId: source.id,
    dataSourceName: source.name,
    ...(table.description ? { description: table.description } : {}),
    dimensions,
    filterableFields,
    ...(grain ? { grain } : {}),
    groupableFields,
    measures,
    modelId: table.id,
    modelName: businessNameForTable(table),
    operations: operationsForFields({ bucketableFields, groupableFields, measures, timeFields }),
    ...(primaryTimeField ? { primaryTimeField } : {}),
    sampleQuestions: uniqueStrings([
      ...readStringArray(table.dictionary.sampleQuestions),
      ...readStringArray(isRecord(table.dictionary.ai) ? table.dictionary.ai.sampleQuestions : undefined),
      ...readStringArray(routing.exampleQuestions)
    ]),
    timeFields
  };
}

export function analyzerCapabilityPromptContract(
  manifest: AnalyzerModelCapabilityManifest
): AnalyzerModelCapabilityPromptContract {
  const fields = uniqueCapabilityFields([
    ...manifest.measures,
    ...manifest.dimensions,
    ...manifest.timeFields
  ]).map(field => ({
    ...(field.label ? { label: field.label } : {}),
    name: field.name,
    role: field.role,
    ...(field.synonyms.length > 0 ? { synonyms: field.synonyms.slice(0, 4) } : {}),
    type: field.type
  }));
  return {
    bucketable: manifest.bucketableFields.map(field => field.name),
    dataSourceId: manifest.dataSourceId,
    fields,
    filterOperators: Object.fromEntries(manifest.filterableFields.map(field => [field.name, field.operators])),
    ...(manifest.grain ? { grain: manifest.grain } : {}),
    groupable: manifest.groupableFields.map(field => field.name),
    measures: manifest.measures.map(field => field.name),
    modelId: manifest.modelId,
    modelName: manifest.modelName,
    operations: manifest.operations,
    ...(manifest.primaryTimeField ? { primaryTimeField: manifest.primaryTimeField } : {}),
    ...(manifest.sampleQuestions.length > 0 ? { sampleQuestions: manifest.sampleQuestions.slice(0, 3) } : {}),
    timeFields: manifest.timeFields.map(field => field.name)
  };
}

export function validateAnalyzerCapabilityInvocation(
  manifest: AnalyzerModelCapabilityManifest,
  invocation: AnalyzerCapabilityInvocation
): AnalyzerCapabilityValidationResult {
  const errors: string[] = [];
  if (!manifest.operations.includes(invocation.operation)) {
    errors.push(`${manifest.modelName} does not support ${invocation.operation}.`);
  }

  const fieldIndex = capabilityFieldIndex(manifest);
  const measureNames = new Set(manifest.measures.map(field => field.name));
  const requestedMeasures = uniqueStrings([
    ...(invocation.measure ? [invocation.measure] : []),
    ...(invocation.measures ?? [])
  ]);
  const groupableNames = new Set(manifest.groupableFields.map(field => field.name));
  const filterableByName = new Map(manifest.filterableFields.map(field => [field.name, field]));
  const bucketableByName = new Map(manifest.bucketableFields.map(field => [field.name, field]));
  const normalizedFilters: AnalyzerCapabilityNormalizedInvocation['filters'] = [];

  if (requiresMeasure(invocation.operation)) {
    if (requestedMeasures.length === 0) {
      errors.push(`${invocation.operation} requires a measure.`);
    }
  }
  for (const measure of requestedMeasures) {
    if (!measureNames.has(measure)) errors.push(`${measure} is not a supported measure for ${manifest.modelName}.`);
  }

  const groupBy = invocation.groupBy ?? [];
  for (const field of groupBy) {
    if (!groupableNames.has(field)) {
      errors.push(`${field} cannot be used as a grouping field for ${manifest.modelName}.`);
    }
  }

  for (const rawFilter of invocation.filters ?? []) {
    const filterable = filterableByName.get(rawFilter.field);
    if (!filterable) {
      errors.push(`${rawFilter.field} cannot be used as a filter field for ${manifest.modelName}.`);
      continue;
    }
    const filter = normalizeSingleValueInFilter(rawFilter, filterable);
    const operator = normalizeCapabilityFilterOperator(filter.operator);
    if (!operator || !filterable.operators.includes(operator)) {
      errors.push(`${filter.operator || '(missing operator)'} is not supported for filter field ${filter.field}.`);
      continue;
    }
    normalizedFilters.push({ ...filter, operator });
  }

  if (invocation.bucket) {
    const bucketable = bucketableByName.get(invocation.bucket.field);
    if (!bucketable) {
      errors.push(`${invocation.bucket.field} cannot be bucketed for ${manifest.modelName}.`);
    } else if (!Number.isFinite(invocation.bucket.size) || invocation.bucket.size < bucketable.minimumBucketSize) {
      errors.push(`Bucket size for ${invocation.bucket.field} must be at least ${bucketable.minimumBucketSize}.`);
    }
  }

  for (const order of invocation.orderBy ?? []) {
    if (!fieldIndex.has(order.field)) {
      errors.push(`${order.field} cannot be used for sorting because it is not in ${manifest.modelName}.`);
    }
  }

  if (errors.length > 0) return { errors, ok: false };
  return {
    errors,
    normalized: {
      ...(invocation.bucket ? { bucket: invocation.bucket } : {}),
      filters: normalizedFilters,
      groupBy,
      ...(requestedMeasures[0] ? { measure: requestedMeasures[0] } : {}),
      ...(requestedMeasures.length > 0 ? { measures: requestedMeasures } : {}),
      operation: invocation.operation
    },
    ok: true
  };
}

function normalizeSingleValueInFilter(
  filter: AnalyzerCapabilityFilterInvocation,
  field: AnalyzerCapabilityFilterField
): AnalyzerCapabilityFilterInvocation {
  const operator = normalizeCapabilityFilterOperator(filter.operator);
  if (operator !== 'in' || !field.operators.includes('equals')) return filter;
  const value = singleFilterValue(filter.value);
  if (value === undefined) return filter;
  return { ...filter, operator: 'equals', value };
}

function singleFilterValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const values = value.filter(item => item !== undefined);
  return values.length === 1 ? values[0] : undefined;
}

export function normalizeCapabilityFilterOperator(value: string): AnalyzerCapabilityFilterOperator | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases: Record<string, AnalyzerCapabilityFilterOperator> = {
    '': 'equals',
    '=': 'equals',
    '==': 'equals',
    '<>': 'not_equals',
    '!=': 'not_equals',
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
    equal: 'equals',
    equals: 'equals',
    is: 'equals',
    notequal: 'not_equals',
    notequals: 'not_equals',
    neq: 'not_equals',
    isnot: 'not_equals',
    in: 'in',
    inlist: 'in',
    notin: 'not_in',
    notinlist: 'not_in',
    greaterthan: 'gt',
    gt: 'gt',
    greaterthanorequal: 'gte',
    greaterthanorequals: 'gte',
    gte: 'gte',
    lessthan: 'lt',
    lt: 'lt',
    lessthanorequal: 'lte',
    lessthanorequals: 'lte',
    lte: 'lte',
    between: 'between',
    contains: 'contains',
    notcontains: 'not_contains',
    startswith: 'starts_with',
    endswith: 'ends_with',
    isnull: 'is_null',
    isempty: 'is_null',
    isnotnull: 'is_not_null',
    isnotempty: 'is_not_null'
  };
  return aliases[normalized] ?? null;
}

function capabilityFieldForColumn(table: TableDefinition, field: FieldDefinition): AnalyzerCapabilityField {
  const metadata = analyzerFieldMetadata(table, field.name);
  const role = roleForColumn(table, field, metadata);
  const description = field.description || field.dictionaryDescription || readString(metadata.description);
  const format = field.format ?? readString(metadata.format) ?? readString(metadata.unit);
  const label = field.label ?? readString(metadata.label) ?? readString(metadata.businessName);
  return {
    ...(description ? { description } : {}),
    ...(format ? { format } : {}),
    ...(label ? { label } : {}),
    name: field.name,
    role,
    source: 'column',
    synonyms: uniqueStrings([
      ...(field.aliases ?? []),
      ...(field.synonyms ?? []),
      ...readStringArray(metadata.aliases),
      ...readStringArray(metadata.synonyms)
    ]),
    type: field.type
  };
}

function capabilityFieldForDerived(field: ReturnType<typeof derivedColumnsForTable>[number]): AnalyzerCapabilityField {
  return {
    ...(field.description ? { description: field.description } : {}),
    ...(field.outputFormat ? { format: field.outputFormat } : {}),
    ...(field.businessName ? { label: field.businessName } : {}),
    name: field.name,
    role: roleForDerivedField(field),
    source: 'derived',
    synonyms: field.synonyms,
    type: field.type || 'number'
  };
}

function roleForColumn(
  table: TableDefinition,
  field: FieldDefinition,
  metadata: Record<string, unknown>
): AnalyzerCapabilityFieldRole {
  const explicitRole = [
    field.role,
    field.columnType,
    field.semanticRole,
    readString(metadata.role),
    readString(metadata.columnType),
    readString(metadata.semanticRole),
    readString(metadata.metricType)
  ]
    .filter((item): item is string => Boolean(item))
    .map(item => item.toLowerCase().replace(/[\s_-]+/g, ''));
  if (explicitRole.some(item => item === 'time' || item === 'date')) return 'time';
  if (isDateFieldType(field.type)) return 'time';
  if (explicitRole.some(item => item === 'identifier' || item === 'primarykey' || item === 'foreignkey' || item === 'joinkey')) {
    return 'identifier';
  }
  if (analyzerFieldIsMeasure(table, field)) return 'measure';
  if (analyzerFieldIsDimension(table, field)) return 'dimension';
  return 'unknown';
}

function roleForDerivedField(field: ReturnType<typeof derivedColumnsForTable>[number]): AnalyzerCapabilityFieldRole {
  const role = [field.columnType, field.type].join(' ').toLowerCase();
  if (role.includes('time') || role.includes('date')) return 'time';
  if (role.includes('dimension')) return 'dimension';
  if (role.includes('identifier')) return 'identifier';
  if (role.includes('measure') || isNumericFieldType(field.type || 'number')) return 'measure';
  return 'unknown';
}

function operatorsForField(table: TableDefinition, field: AnalyzerCapabilityField): AnalyzerCapabilityFilterOperator[] {
  if (field.role === 'time' || isDateFieldType(field.type)) return DATE_FILTER_OPERATORS;
  if (isBooleanFieldType(field.type)) return BOOLEAN_FILTER_OPERATORS;
  if (isNumericFieldType(field.type)) return NUMBER_FILTER_OPERATORS;
  const sourceField = table.fields.find(item => item.name === field.name);
  if (sourceField && fieldValueResolutionForTable(table, sourceField).mode === 'catalog') {
    return CONTROLLED_VALUE_FILTER_OPERATORS;
  }
  return STRING_FILTER_OPERATORS;
}

function operationsForFields(input: {
  bucketableFields: AnalyzerCapabilityBucketField[];
  groupableFields: AnalyzerCapabilityField[];
  measures: AnalyzerCapabilityField[];
  timeFields: AnalyzerCapabilityField[];
}): AnalyzerCapabilityOperation[] {
  const operations: AnalyzerCapabilityOperation[] = ['list'];
  if (input.measures.length > 0) operations.push('aggregate');
  if (input.measures.length > 0 && input.groupableFields.length > 0) operations.push('top_n');
  if (input.measures.length > 0 && input.timeFields.length > 0) operations.push('trend', 'compare');
  if (input.bucketableFields.length > 0) operations.push('bucket');
  return operations;
}

function capabilityFieldIndex(manifest: AnalyzerModelCapabilityManifest): Map<string, AnalyzerCapabilityField> {
  return new Map([
    ...manifest.measures,
    ...manifest.dimensions,
    ...manifest.timeFields,
    ...manifest.filterableFields,
    ...manifest.bucketableFields
  ].map(field => [field.name, field]));
}

function uniqueCapabilityFields(fields: AnalyzerCapabilityField[]): AnalyzerCapabilityField[] {
  const seen = new Set<string>();
  const result: AnalyzerCapabilityField[] = [];
  for (const field of fields) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    result.push(field);
  }
  return result;
}

function requiresMeasure(operation: AnalyzerCapabilityOperation): boolean {
  return operation === 'aggregate'
    || operation === 'top_n'
    || operation === 'trend'
    || operation === 'compare'
    || operation === 'bucket';
}

function isNumericFieldType(value: string): boolean {
  return [
    'bigint',
    'decimal',
    'double',
    'float',
    'int',
    'integer',
    'money',
    'number',
    'numeric',
    'real',
    'smallint'
  ].includes(value.trim().toLowerCase());
}

function isDateFieldType(value: string): boolean {
  return ['date', 'datetime', 'datetime2', 'timestamp', 'time'].includes(value.trim().toLowerCase());
}

function isBooleanFieldType(value: string): boolean {
  return ['bit', 'bool', 'boolean'].includes(value.trim().toLowerCase());
}
