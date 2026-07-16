import type { AnalyzerPlanRequest } from '../../validation.js';
import type { DataSourceRecord, FieldDefinition, TableDefinition } from '../data-source/foundation-store.js';
import { buildComponentPlan } from './analyzer-plan-build-component.js';
import { isAnalyzerModel } from './analyzer-plan-table-context.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

interface ResolvedFallbackIntent {
  dimension: FieldDefinition;
  filters: Array<Record<string, unknown>>;
  measure: FieldDefinition;
  operation: 'aggregate' | 'compare' | 'trend';
  table: TableDefinition;
  title: string;
}

export function localAnalyzerFallbackPlan(
  request: AnalyzerPlanRequest,
  source: DataSourceRecord
): AnalyzerActionPlanResponse | null {
  const table = selectedFallbackTable(request, source);
  if (!table) return null;
  const intent = resolveFallbackIntent(request, table);
  if (!intent) return null;

  return buildComponentPlan(request, {
    actions: [{
      action: 'create_table',
      params: {
        _dataSourceId: source.id,
        _dataSourceTableId: intent.table.id,
        _tableName: intent.table.name,
        columns: [
          { field: intent.dimension.name, summarize: 'none' },
          { field: intent.measure.name, summarize: 'sum' }
        ],
        ...(intent.filters.length ? { filters: intent.filters } : {}),
        sort: [{ field: intent.measure.name, direction: 'desc' }],
        title: intent.title
      }
    }],
    capability: {
      filters: intent.filters,
      groupBy: [intent.dimension.name],
      measure: intent.measure.name,
      operation: intent.operation,
      orderBy: [{ field: intent.measure.name, direction: 'desc' }]
    },
    componentType: 'table',
    insightGuidance: [
      `Grouped ${labelForField(intent.measure)} by ${labelForField(intent.dimension)} from ${businessNameForTable(intent.table)}.`
    ],
    message: `I selected ${businessNameForTable(intent.table)} and grouped ${labelForField(intent.measure)} by ${labelForField(intent.dimension)}.`,
    mode: 'create',
    tableId: intent.table.id,
    tableName: intent.table.name,
    title: intent.title
  });
}

function selectedFallbackTable(request: AnalyzerPlanRequest, source: DataSourceRecord): TableDefinition | null {
  const requested = request.dataSourceTableId ?? request.tableName;
  if (requested) {
    const table = source.tables.find(item => item.id === requested || item.name === requested);
    return table && isAnalyzerModel(table) ? table : null;
  }
  return source.tables.find(isAnalyzerModel) ?? null;
}

function resolveFallbackIntent(request: AnalyzerPlanRequest, table: TableDefinition): ResolvedFallbackIntent | null {
  const question = normalize(request.question);
  const measures = table.fields.filter(isMeasureField);
  const dimensions = table.fields.filter(isDimensionField);
  const measure = bestField(question, measures, table, ['revenue', 'sales', 'amount', 'total'])
    ?? measures.find(field => normalizedTokens(field, table).includes('revenue'))
    ?? measures[0];
  const dimension = bestField(question, dimensions, table, ['channel', 'order type', 'category', 'location', 'date', 'day'])
    ?? dimensions.find(field => normalizedTokens(field, table).includes('channel'))
    ?? dimensions.find(field => normalizedTokens(field, table).includes('date'))
    ?? dimensions[0];
  if (!measure || !dimension) return null;

  const filters = fallbackFilters(question, dimension, table);
  const operation = isTimeField(dimension)
    ? 'trend'
    : filters.length > 0 || question.includes('compare')
      ? 'compare'
      : 'aggregate';
  return {
    dimension,
    filters,
    measure,
    operation,
    table,
    title: `${labelForField(measure)} by ${labelForField(dimension)}`
  };
}

function bestField(
  question: string,
  fields: FieldDefinition[],
  table: TableDefinition,
  fallbackTerms: string[]
): FieldDefinition | null {
  let best: { field: FieldDefinition; score: number } | null = null;
  for (const field of fields) {
    const score = scoreField(question, field, table, fallbackTerms);
    if (score > 0 && (!best || score > best.score)) best = { field, score };
  }
  return best?.field ?? null;
}

function scoreField(
  question: string,
  field: FieldDefinition,
  table: TableDefinition,
  fallbackTerms: string[]
): number {
  const terms = normalizedTokens(field, table);
  let score = 0;
  for (const term of terms) {
    if (term && question.includes(term)) score += term.length > 8 ? 4 : 2;
  }
  for (const term of fallbackTerms) {
    if (terms.includes(normalize(term)) && question.includes(normalize(term))) score += 3;
  }
  for (const entry of valueAliasEntries(field, table)) {
    if (question.includes(normalize(entry.canonical))) score += 2;
    if (entry.aliases.some(alias => question.includes(normalize(alias)))) score += 4;
  }
  return score;
}

function fallbackFilters(question: string, dimension: FieldDefinition, table: TableDefinition): Array<Record<string, unknown>> {
  const requestedTexts: string[] = [];
  const matches = unique([
    ...sampleValuesForField(dimension).filter(value => {
      const matched = question.includes(normalize(value));
      if (matched) requestedTexts.push(value);
      return matched;
    }),
    ...valueAliasEntries(dimension, table).flatMap(entry => {
      const canonical = normalize(entry.canonical);
      const matchedAliases = entry.aliases.filter(alias => question.includes(normalize(alias)));
      const canonicalMatched = question.includes(canonical);
      if (canonicalMatched) requestedTexts.push(entry.canonical);
      requestedTexts.push(...matchedAliases);
      return canonicalMatched || matchedAliases.length > 0
        ? [sampleValueWithOriginalCase(dimension, entry.canonical)]
        : [];
    })
  ]);
  if (matches.length === 0) return [];
  return [{
    field: dimension.name,
    operator: 'in',
    requestedTexts: unique(requestedTexts),
    value: matches
  }];
}

function normalizedTokens(field: FieldDefinition, table: TableDefinition): string[] {
  const metadata = fieldMetadata(table, field.name);
  return unique([
    field.name,
    field.label,
    field.description,
    field.dictionaryDescription,
    field.role,
    field.semanticRole,
    field.format,
    field.sampleQuestions,
    metadata.label,
    metadata.businessName,
    metadata.description,
    metadata.dictionaryDescription,
    metadata.aliases,
    metadata.synonyms,
    metadata.sampleQuestions,
    ...(field.aliases ?? []),
    ...(field.synonyms ?? []),
    ...sampleValuesForField(field)
  ].flatMap(stringsFromUnknown).map(value => normalize(value)).filter(Boolean));
}

function sampleValuesForField(field: FieldDefinition): string[] {
  return (field.sampleValues ?? []).flatMap(value => typeof value === 'string' && value.trim() ? [value.trim()] : []);
}

function isMeasureField(field: FieldDefinition): boolean {
  const role = normalize(`${field.role ?? ''} ${field.semanticRole ?? ''} ${field.format ?? ''} ${field.type}`);
  return role.includes('measure') || role.includes('currency') || field.type === 'number';
}

function isDimensionField(field: FieldDefinition): boolean {
  return !isMeasureField(field) || isTimeField(field);
}

function isTimeField(field: FieldDefinition): boolean {
  const text = normalize(`${field.name} ${field.label ?? ''} ${field.role ?? ''} ${field.semanticRole ?? ''} ${field.type}`);
  return text.includes('date') || text.includes('time');
}

function businessNameForTable(table: TableDefinition): string {
  const value = table.dictionary.businessName;
  return typeof value === 'string' && value.trim() ? value.trim() : table.name;
}

function labelForField(field: FieldDefinition): string {
  return field.label?.trim() || field.name.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function valueAliasEntries(field: FieldDefinition, table: TableDefinition): Array<{ aliases: string[]; canonical: string }> {
  const metadata = fieldMetadata(table, field.name);
  return [
    ...entriesFromValueAliases(field.valueAliases),
    ...entriesFromValueAliases(metadata.valueAliases),
    ...entriesFromValueConcepts(field.valueConcepts),
    ...entriesFromValueConcepts(metadata.valueConcepts)
  ];
}

function entriesFromValueAliases(value: unknown): Array<{ aliases: string[]; canonical: string }> {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([canonical, aliases]) => {
    const aliasList = stringsFromUnknown(aliases);
    return canonical.trim() && aliasList.length > 0 ? [{ canonical: canonical.trim(), aliases: aliasList }] : [];
  });
}

function entriesFromValueConcepts(value: unknown): Array<{ aliases: string[]; canonical: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const canonical = readString(item.value ?? item.canonical ?? item.label ?? item.conceptKey);
    const aliases = stringsFromUnknown(item.aliases ?? item.synonyms);
    const values = stringsFromUnknown(item.matchValues ?? item.values ?? item.sourceValues);
    return (values.length > 0 ? values : canonical ? [canonical] : [])
      .map(value => ({ canonical: value, aliases: unique([canonical, ...aliases].filter(isNonEmptyString)) }));
  });
}

function sampleValueWithOriginalCase(field: FieldDefinition, value: string): string {
  const normalizedValue = normalize(value);
  const match = sampleValuesForField(field).find(item => normalize(item) === normalizedValue);
  return match ?? value;
}

function fieldMetadata(table: TableDefinition, fieldName: string): Record<string, unknown> {
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  for (const source of [dictionary.columns, dictionary.fields, ai.columns, ai.fields]) {
    const metadata = metadataFromSource(source, fieldName);
    if (metadata) return metadata;
  }
  return {};
}

function metadataFromSource(source: unknown, fieldName: string): Record<string, unknown> | null {
  if (Array.isArray(source)) {
    const match = source.find(item => isRecord(item) && readString(item.name ?? item.field) === fieldName);
    return isRecord(match) ? match : null;
  }
  if (isRecord(source) && isRecord(source[fieldName])) return source[fieldName];
  return null;
}

function stringsFromUnknown(value: unknown): string[] {
  const direct = readString(value);
  if (direct) return [direct];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(stringsFromUnknown);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}
