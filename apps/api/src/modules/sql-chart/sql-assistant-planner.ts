import { findDataSource, type DataSourceRecord, type TableDefinition } from '../data-source/foundation-store.js';
import {
  isRecord,
  normalizeForSearch,
  readBoolean,
  readString,
  readStringArray,
  routingRecordsFor,
  unique,
  weightedTermsFor
} from '../analyzer/analyzer-planning-utils.js';
import { dateFilterClauseForPrompt } from '../data-source/sql-dialect.js';
import type { SqlEditorDataSource, SqlEditorTable } from './sql-editor-data.js';

type SqlFieldRole = 'dimension' | 'identifier' | 'measure' | 'time';

interface WeightedSearchTerm {
  value: string;
  weight: number;
}

interface SqlAssistantField {
  label: string;
  metadata: Record<string, unknown>;
  name: string;
  role: SqlFieldRole;
}

interface SqlAssistantPlan {
  dimension: SqlAssistantField | null;
  measure: SqlAssistantField;
  measures: SqlAssistantField[];
  sourceType: string;
  table: SqlEditorTable;
  tableDefinition: TableDefinition | null;
  timeField: SqlAssistantField | null;
}

const CURRENT_QUERY_TABLE_BONUS = 8;
const IGNORED_SINGLE_SEARCH_TERMS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'at',
  'be',
  'been',
  'being',
  'by',
  'did',
  'do',
  'does',
  'doing',
  'for',
  'from',
  'give',
  'how',
  'in',
  'is',
  'list',
  'me',
  'my',
  'of',
  'on',
  'our',
  'show',
  'that',
  'the',
  'these',
  'this',
  'those',
  'to',
  'us',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with'
]);

export function suggestedQueries(source: SqlEditorDataSource): Array<{ title: string; query: string; description: string }> {
  return source.tables
    .flatMap(table => suggestionsForTable(source, table))
    .slice(0, 4);
}

export function buildSqlAssistance(message: string, currentQuery: string | null, source: SqlEditorDataSource): string {
  const plan = planForPrompt(source, message, currentQuery);
  if (!plan) {
    return [
      'I need this data source to include at least one business measure and one business dimension before I can safely write SQL for that request.',
      'Review the data source details, then ask the SQL assistant again.'
    ].join('\n');
  }

  const prefix = currentQuery ? '<!-- SQL_REPLACEMENT_TYPE: full -->\n' : '';
  return [
    `${prefix}\`\`\`sql`,
    ...sqlLinesForPlan(plan, message),
    '```'
  ].join('\n');
}

function suggestionsForTable(source: SqlEditorDataSource, table: SqlEditorTable): Array<{ title: string; query: string; description: string }> {
  const plan = planForTable(source, table, '');
  if (!plan) return [];
  const suggestions = [{
    title: sampleQuestionForPlan(plan) ?? `${plan.measure.label} Trend`,
    query: sqlLinesForPlan({ ...plan, dimension: null }, `${plan.measure.label} trend`).join('\n'),
    description: `Shows ${plan.measure.label.toLowerCase()} over time.`
  }];
  if (plan.dimension) {
    suggestions.push({
      title: `${plan.measure.label} By ${plan.dimension.label}`,
      query: sqlLinesForPlan(plan, `${plan.measure.label} by ${plan.dimension.label}`).join('\n'),
      description: `Compares ${plan.measure.label.toLowerCase()} by ${plan.dimension.label.toLowerCase()}.`
    });
  }
  return suggestions;
}

function sampleQuestionForPlan(plan: SqlAssistantPlan): string | null {
  const dictionary = plan.tableDefinition?.dictionary ?? {};
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  return readStringArray(dictionary.sampleQuestions)[0]
    ?? readStringArray(ai.sampleQuestions)[0]
    ?? null;
}

function isRankingQuery(prompt: string): boolean {
  return /\b(top|best|most|highest|largest|leading|worst|lowest|least|bottom)\b/i.test(prompt);
}

function sqlLinesForPlan(plan: SqlAssistantPlan, prompt: string): string[] {
  const ranking = isRankingQuery(prompt);
  // For ranking queries, exclude timeField from GROUP BY — we want totals across the date range
  const groupFields = unique([
    ranking ? null : plan.timeField?.name,
    plan.dimension?.name
  ].filter((field): field is string => Boolean(field)));
  const aggregation = aggregationForMeasure(plan.measure);
  const selectedColumns = [
    ...groupFields,
    ...plan.measures.map(measure => {
      const measureAggregation = aggregationForMeasure(measure);
      return `${aggregateExpression(measureAggregation, measure.name)} AS ${measure.name}_${aggregationAlias(measureAggregation)}`;
    })
  ];
  const orderAlias = `${plan.measure.name}_${aggregationAlias(aggregation)}`;
  const whereClause = plan.timeField ? dateFilterClauseForPrompt(plan.sourceType, prompt, plan.timeField.name) : null;
  const limit = ranking ? 'LIMIT 10;' : 'LIMIT 50;';
  return [
    `SELECT ${selectedColumns.join(', ')}`,
    `FROM ${plan.table.name}`,
    ...(whereClause ? [whereClause] : []),
    ...(groupFields.length ? [`GROUP BY ${groupFields.join(', ')}`] : []),
    `ORDER BY ${orderByClause(prompt, ranking ? null : plan.timeField?.name ?? null, orderAlias)}`,
    limit
  ];
}

function aggregationForMeasure(field: SqlAssistantField): string {
  const configured = readString(field.metadata.aggregation)
    ?? readString(field.metadata.defaultAggregation)
    ?? readString(field.metadata.aggregationType)
    ?? readString(field.metadata.summarize);
  return ['avg', 'average'].includes(configured ?? '') ? 'avg'
    : ['count', 'count_distinct', 'countDistinct', 'min', 'max'].includes(configured ?? '') ? configured ?? 'sum'
    : 'sum';
}

function aggregateExpression(aggregation: string, fieldName: string): string {
  if (aggregation === 'avg' || aggregation === 'average') return `AVG(${fieldName})`;
  if (aggregation === 'count') return `COUNT(${fieldName})`;
  if (aggregation === 'countDistinct' || aggregation === 'count_distinct') return `COUNT(DISTINCT ${fieldName})`;
  if (aggregation === 'min') return `MIN(${fieldName})`;
  if (aggregation === 'max') return `MAX(${fieldName})`;
  return `SUM(${fieldName})`;
}

function aggregationAlias(aggregation: string): string {
  if (aggregation === 'avg' || aggregation === 'average') return 'avg';
  if (aggregation === 'countDistinct' || aggregation === 'count_distinct') return 'count_distinct';
  return aggregation === 'sum' ? 'total' : aggregation;
}

function orderByClause(prompt: string, timeField: string | null, measureAlias: string): string {
  const normalized = normalizeForSearch(prompt);
  if (/\b(top|best|most|highest|largest|leading)\b/.test(normalized)) return `${measureAlias} DESC`;
  if (/\b(low|lowest|underperform|not doing good|drop|dropped|decline)\b/.test(normalized)) return `${measureAlias} ASC`;
  return timeField ? `${timeField} DESC` : `${measureAlias} DESC`;
}

function planForPrompt(source: SqlEditorDataSource, prompt: string, currentQuery: string | null): SqlAssistantPlan | null {
  const sourceRecord = findDataSource(source.id);
  const referencedTableNames = tableNamesReferencedByQuery(source.tables, currentQuery);
  const scoredTables = source.tables
    .map((table, index) => {
      const promptScore = scoreTable(table, tableDefinitionFor(sourceRecord, table), prompt);
      return {
        index,
        score: promptScore > 0 ? promptScore + currentQueryScore(table, referencedTableNames) : 0,
        table
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const matched = scoredTables.find(item => item.score > 0);
  return matched ? planForTable(source, matched.table, prompt) : null;
}

function planForTable(source: SqlEditorDataSource, table: SqlEditorTable, prompt: string): SqlAssistantPlan | null {
  const tableDefinition = tableDefinitionFor(findDataSource(source.id), table);
  const fields = metadataFields(table, tableDefinition);
  const measures = fields.filter(field => field.role === 'measure');
  const dimensions = fields.filter(field => field.role === 'dimension');
  const measure = bestFieldForPrompt(measures, prompt)
    ?? measures.find(field => readBoolean(field.metadata.isDefault))
    ?? measures.find(hasReadableFieldMetadata)
    ?? null;
  if (!measure) return null;
  const selectedMeasures = measuresForPrompt(measure, measures, prompt);

  const timeField = primaryTimeFieldFor(tableDefinition, fields);
  const dimension = bestFieldForPrompt(dimensions, prompt)
    ?? dimensions.find(field => field.name !== timeField?.name && hasReadableFieldMetadata(field))
    ?? null;
  if (!timeField && !dimension) return null;
  return { dimension, measure, measures: selectedMeasures, sourceType: source.type, table, tableDefinition, timeField };
}

function scoreTable(table: SqlEditorTable, tableDefinition: TableDefinition | null, prompt: string): number {
  const normalizedPrompt = normalizeForSearch(prompt);
  if (!normalizedPrompt) return tableDefinition?.settings?.isDataModel === true ? 1 : 0;
  const dictionary = tableDefinition?.dictionary ?? {};
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const routing = routingRecordsFor(dictionary);
  const weightedTerms = distinctWeightedTerms([
    ...weightedTermsFor(4, [
      dictionary.businessName,
      dictionary.businessPurpose,
      ai.whenToUse,
      ...readStringArray(dictionary.sampleQuestions),
      ...readStringArray(ai.sampleQuestions),
      ...routing.flatMap(record => [
        record.domain,
        ...readStringArray(record.triggerKeywords),
        ...readStringArray(record.useFor),
        ...readStringArray(record.exampleQuestions)
      ])
    ]),
    ...weightedTermsFor(2, [
      dictionary.description,
      table.description,
      ...routing.flatMap(record => [record.grain])
    ]),
    ...weightedTermsFor(1, [
      table.name,
      ...metadataFields(table, tableDefinition).flatMap(field => [
        field.name.replaceAll('_', ' '),
        field.label,
        field.metadata.description,
        field.metadata.dictionaryDescription,
        ...readStringArray(field.metadata.synonyms),
        ...readStringArray(field.metadata.aliases)
      ])
    ])
  ]);
  return weightedTerms.reduce((score, term) => score + sqlAssistantTermScore(normalizedPrompt, term.value, term.weight), 0);
}

function metadataFields(table: SqlEditorTable, tableDefinition: TableDefinition | null): SqlAssistantField[] {
  return table.columns.map(column => {
    const metadata = {
      ...fieldDefinitionMetadata(tableDefinition, column.name),
      ...dictionaryFieldMetadata(tableDefinition?.dictionary ?? {}, column.name)
    };
    return {
      label: readString(metadata.businessName) ?? readString(metadata.label) ?? column.label,
      metadata,
      name: column.name,
      role: fieldRole(column.type, metadata)
    };
  });
}

function fieldRole(columnType: SqlEditorTable['columns'][number]['type'], metadata: Record<string, unknown>): SqlFieldRole {
  const explicit = readString(metadata.columnType) ?? readString(metadata.role) ?? readString(metadata.semanticRole);
  if (explicit === 'measure' || explicit === 'metric') return 'measure';
  if (explicit === 'time' || explicit === 'date') return 'time';
  if (explicit === 'identifier') return 'identifier';
  if (explicit === 'dimension' || explicit === 'filter') return 'dimension';
  if (!hasReadableMetadata(metadata)) return 'identifier';
  if (columnType === 'number') return 'measure';
  if (columnType === 'date') return 'time';
  return 'dimension';
}

function bestFieldForPrompt(fields: SqlAssistantField[], prompt: string): SqlAssistantField | null {
  const scored = fields
    .map((field, index) => ({ field, index, score: scoreField(field, prompt) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = scored[0];
  return best && best.score > 0 ? best.field : null;
}

function measuresForPrompt(
  primaryMeasure: SqlAssistantField,
  measures: SqlAssistantField[],
  prompt: string
): SqlAssistantField[] {
  if (!isComparisonPrompt(prompt)) return [primaryMeasure];
  const scored = measures
    .map((field, index) => ({ field, index, score: scoreField(field, prompt) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return unique([
    primaryMeasure,
    ...scored
      .filter(item => item.field.name !== primaryMeasure.name && item.score >= 2)
      .map(item => item.field)
  ]).slice(0, 4);
}

function isComparisonPrompt(prompt: string): boolean {
  const normalized = normalizeForSearch(prompt);
  return /\b(vs|versus|compare|compared|against|between)\b/.test(normalized);
}

function scoreField(field: SqlAssistantField, prompt: string): number {
  const terms: unknown[] = [
    field.name.replaceAll('_', ' '),
    field.label,
    field.metadata.businessName,
    field.metadata.businessDefinition,
    field.metadata.description,
    field.metadata.dictionaryDescription,
    field.metadata.semanticType,
    field.metadata.metricType,
    ...readStringArray(field.metadata.aliases),
    ...readStringArray(field.metadata.synonyms),
    ...readStringArray(field.metadata.sampleQuestions)
  ];
  return terms.reduce<number>((score, term) => score + sqlAssistantTermScore(prompt, typeof term === 'string' ? term : '', 1), 0);
}

function currentQueryScore(table: SqlEditorTable, referencedTableNames: Set<string>): number {
  return referencedTableNames.has(table.name) ? CURRENT_QUERY_TABLE_BONUS : 0;
}

function tableNamesReferencedByQuery(tables: SqlEditorTable[], currentQuery: string | null): Set<string> {
  const normalizedQuery = normalizeForSearch(currentQuery ?? '');
  if (!normalizedQuery) return new Set();
  return new Set(
    tables
      .filter(table => containsNormalizedTerm(normalizedQuery, normalizeForSearch(table.name)))
      .map(table => table.name)
  );
}

function distinctWeightedTerms(terms: WeightedSearchTerm[]): WeightedSearchTerm[] {
  const seen = new Set<string>();
  return terms.filter(term => {
    const normalized = normalizeForSearch(term.value);
    if (!isMeaningfulSearchTerm(normalized)) return false;
    const key = `${term.weight}:${normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sqlAssistantTermScore(question: string, term: string, weight: number): number {
  const normalizedQuestion = normalizeForSearch(question);
  const normalizedTerm = normalizeForSearch(term);
  const tokens = significantSqlAssistantTokens(normalizedTerm);
  if (!normalizedQuestion || tokens.length === 0) return 0;
  if (searchTermsFor(normalizedTerm).some(searchTerm => containsNormalizedTerm(normalizedQuestion, searchTerm))) {
    return weight * (normalizedTerm.includes(' ') ? 3 : 2);
  }

  const questionTokens = new Set(significantSqlAssistantTokens(normalizedQuestion));
  const matched = tokens.filter(token => questionTokens.has(token)).length;
  if (matched === 0) return 0;
  if (tokens.length === 1) return weight;
  if (matched === tokens.length) return weight * 2;
  if (tokens.length <= 4) return weight;
  return matched >= Math.ceil(tokens.length * 0.6) ? weight : 0;
}

function searchTermsFor(normalizedTerm: string): string[] {
  if (!normalizedTerm) return [];
  const terms = new Set([normalizedTerm]);
  if (normalizedTerm.endsWith('ies')) terms.add(`${normalizedTerm.slice(0, -3)}y`);
  if (normalizedTerm.endsWith('s')) terms.add(normalizedTerm.slice(0, -1));
  return Array.from(terms);
}

function containsNormalizedTerm(normalizedValue: string, normalizedTerm: string): boolean {
  if (!normalizedTerm) return false;
  return new RegExp(`(^| )${escapeRegExp(normalizedTerm)}( |$)`).test(normalizedValue);
}

function significantSqlAssistantTokens(value: string): string[] {
  return normalizeForSearch(value)
    .split(/\s+/)
    .filter(token => token.length > 2 && !IGNORED_SINGLE_SEARCH_TERMS.has(token));
}

function isMeaningfulSearchTerm(normalizedTerm: string): boolean {
  return significantSqlAssistantTokens(normalizedTerm).length > 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function primaryTimeFieldFor(tableDefinition: TableDefinition | null, fields: SqlAssistantField[]): SqlAssistantField | null {
  const routing = routingRecordsFor(tableDefinition?.dictionary ?? {}).find(record => typeof record.primaryTimeField === 'string') ?? {};
  const routedField = readString(routing.primaryTimeField);
  return fields.find(field => field.name === routedField) ?? fields.find(field => field.role === 'time') ?? null;
}

function tableDefinitionFor(source: DataSourceRecord | undefined, table: SqlEditorTable): TableDefinition | null {
  return source?.tables.find(item => item.name === table.name || item.id === table.name) ?? null;
}

function fieldDefinitionMetadata(tableDefinition: TableDefinition | null, fieldName: string): Record<string, unknown> {
  const field = tableDefinition?.fields.find(item => item.name === fieldName);
  if (!field) return {};
  return {
    description: field.description,
    dictionaryDescription: field.dictionaryDescription
  };
}

function dictionaryFieldMetadata(dictionary: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  return {
    ...metadataRecord(dictionary.fields, fieldName),
    ...metadataRecord(dictionary.columns, fieldName),
    ...metadataRecord(ai.fields, fieldName),
    ...metadataRecord(ai.columns, fieldName)
  };
}

function metadataRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (isRecord(value) && isRecord(value[fieldName])) return value[fieldName];
  if (!Array.isArray(value)) return {};
  const item = value.find(candidate => isRecord(candidate) && (candidate.name === fieldName || candidate.field === fieldName));
  return isRecord(item) ? item : {};
}

function hasReadableFieldMetadata(field: SqlAssistantField): boolean {
  return hasReadableMetadata(field.metadata);
}

function hasReadableMetadata(metadata: Record<string, unknown>): boolean {
  return [
    metadata.label,
    metadata.businessName,
    metadata.businessDefinition,
    metadata.description,
    metadata.dictionaryDescription,
    metadata.semanticType,
    metadata.metricType,
    metadata.role,
    metadata.columnType,
    metadata.semanticRole,
    ...readStringArray(metadata.aliases),
    ...readStringArray(metadata.synonyms),
    ...readStringArray(metadata.sampleQuestions)
  ].some(value => typeof value === 'string' && value.trim().length > 0);
}
