import type { FieldDefinition, TableDefinition } from '../data-source/foundation-store.js';
import {
  type AnalyzerDerivedColumn,
  derivedColumnsForTable
} from './analyzer-plan-derived-columns.js';
import {
  analyzerFieldMetadata,
  analyzerTokensFromText
} from './analyzer-plan-field-matching.js';
import {
  analyzerVisibleFieldNames,
  analyzerVisibleFields
} from './analyzer-plan-field-visibility.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

type AnalyzerActionStep = AnalyzerActionPlanResponse['actions'][number];

const FIELD_REFERENCE_KEYS = ['field', 'valueField', 'xField', 'yField', 'groupByField'];
const FIELD_ARRAY_REFERENCE_KEYS = ['fields', 'yFields', 'series'];
const FIELD_REFERENCE_MODIFIER_TOKENS = new Set([
  'average',
  'avg',
  'count',
  'maximum',
  'max',
  'minimum',
  'min',
  'number',
  'sum',
  'total'
]);

const FIELD_REFERENCE_SHARE_TOKENS = new Set([
  'breakdown',
  'mix',
  'percent',
  'percentage',
  'share',
  'split'
]);

export function normalizeAnalyzerFieldReferences(
  actions: AnalyzerActionStep[],
  table: TableDefinition
): AnalyzerActionStep[] {
  return actions.map(action => ({
    action: action.action,
    params: normalizeParams(action.params, table)
  }));
}

function normalizeParams(
  params: AnalyzerActionStep['params'],
  table: TableDefinition
): AnalyzerActionStep['params'] {
  const next = { ...params };
  const hiddenFieldNames = hiddenAnalyzerFieldNames(table);
  for (const key of FIELD_REFERENCE_KEYS) {
    const value = readString(next[key]);
    const normalized = value ? fieldNameForReference(table, value) : null;
    if (normalized) next[key] = normalized;
    const finalValue = readString(next[key]);
    if (finalValue && hiddenFieldNames.has(finalValue)) delete next[key];
  }
  for (const key of FIELD_ARRAY_REFERENCE_KEYS) {
    next[key] = normalizeStringArrayReferences(next[key], table, hiddenFieldNames);
  }
  if (Array.isArray(next.columns)) {
    next.columns = next.columns
      .map(column => normalizeColumnReference(column, table))
      .filter(column => !hiddenFieldNames.has(readColumnField(column)));
  }
  return next;
}

function normalizeStringArrayReferences(
  value: unknown,
  table: TableDefinition,
  hiddenFieldNames: Set<string>
): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(item => {
    const reference = readString(item);
    return reference ? fieldNameForReference(table, reference) ?? item : item;
  }).filter(item => !hiddenFieldNames.has(readString(item) ?? ''));
}

function normalizeColumnReference(value: unknown, table: TableDefinition): unknown {
  if (typeof value === 'string') return fieldNameForReference(table, value) ?? value;
  if (!isRecord(value)) return value;
  const reference = readString(value.field) ?? readString(value.name);
  const field = reference ? fieldNameForReference(table, reference) : null;
  return field ? { ...value, field } : value;
}

function readColumnField(value: unknown): string {
  const record = typeof value === 'string' ? { field: value } : isRecord(value) ? value : null;
  return readString(record?.field) ?? readString(record?.name) ?? '';
}

function hiddenAnalyzerFieldNames(table: TableDefinition): Set<string> {
  const visibleFieldNames = analyzerVisibleFieldNames(table);
  return new Set(table.fields
    .filter(field => !visibleFieldNames.has(field.name))
    .map(field => field.name));
}

function fieldNameForReference(table: TableDefinition, reference: string): string | null {
  const fields = analyzerVisibleFields(table);
  if (fields.some(field => field.name === reference)) return reference;
  const derivedColumns = derivedColumnsForTable(table);
  if (derivedColumns.some(column => column.name === reference)) return reference;
  for (const referenceKey of fieldReferenceKeys(reference)) {
    const matches = fields.filter(field => fieldCandidateKeys(table, field).includes(referenceKey));
    const derivedMatches = derivedColumns.filter(column => derivedFieldCandidateKeys(column).includes(referenceKey));
    const names = uniqueStrings([
      ...matches.map(field => field.name),
      ...derivedMatches.map(column => column.name)
    ]);
    const fieldName = names[0] ?? null;
    if (names.length === 1 && fieldName) return fieldName;
  }
  return null;
}

function fieldCandidateKeys(table: TableDefinition, field: FieldDefinition): string[] {
  const metadata = analyzerFieldMetadata(table, field.name);
  return uniqueStrings([
    field.name,
    field.description,
    field.dictionaryDescription,
    readString(metadata.name),
    readString(metadata.businessName),
    readString(metadata.label),
    ...readStringArray(metadata.aliases),
    ...readStringArray(metadata.synonyms)
  ].flatMap(value => value ? fieldReferenceKeys(value) : []).filter(Boolean));
}

function derivedFieldCandidateKeys(column: AnalyzerDerivedColumn): string[] {
  return uniqueStrings([
    column.name,
    column.businessName,
    column.description,
    ...column.synonyms
  ].flatMap(value => value ? fieldReferenceKeys(value) : []));
}

function fieldReferenceKey(value: string): string {
  return analyzerTokensFromText(value).join(' ');
}

function fieldReferenceKeys(value: string): string[] {
  const tokens = analyzerTokensFromText(value);
  const baseKey = tokens.join(' ');
  const conceptKey = tokens.filter(token => !FIELD_REFERENCE_MODIFIER_TOKENS.has(token)).join(' ');
  const shareStrippedKey = tokens.filter(token => !FIELD_REFERENCE_SHARE_TOKENS.has(token)).join(' ');
  const shareConceptKey = tokens
    .filter(token => !FIELD_REFERENCE_MODIFIER_TOKENS.has(token) && !FIELD_REFERENCE_SHARE_TOKENS.has(token))
    .join(' ');
  return uniqueStrings([baseKey, conceptKey, shareStrippedKey, shareConceptKey].filter(Boolean));
}
