import type {
  SqlEditorSchema,
  SqlEditorSuggestion,
  SqlEditorTable,
  SqlEditorMetadataField,
  SqlEditorMetadataSource,
  SqlEditorMetadataTable
} from './types';

interface FieldCandidate {
  column: SqlEditorTable['columns'][number];
  metadata: Record<string, unknown>;
  role: 'dimension' | 'filter' | 'measure' | 'time' | 'unknown';
}

interface RecommendationCandidate {
  description: string;
  index: number;
  query: string;
  score: number;
  title: string;
}

export function sqlEditorSuggestionsFromMetadata(
  schema: SqlEditorSchema | null,
  source: SqlEditorMetadataSource | null,
  fallbackSuggestions: SqlEditorSuggestion[]
): SqlEditorSuggestion[] {
  const metadataSuggestions = source && schema ? buildMetadataSuggestions(schema, source) : [];
  return metadataSuggestions.length > 0 ? metadataSuggestions : fallbackSuggestions;
}

function buildMetadataSuggestions(schema: SqlEditorSchema, source: SqlEditorMetadataSource): SqlEditorSuggestion[] {
  return schema.tables
    .flatMap((table, index) => {
      const metadataTable = source.tables?.find(item => item.name === table.name);
      return metadataTable ? suggestionForTable(table, metadataTable, source, index) : [];
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 6)
    .map(({ description, query, title }) => ({ description, query, title }));
}

function suggestionForTable(
  table: SqlEditorTable,
  metadataTable: SqlEditorMetadataTable,
  source: SqlEditorMetadataSource,
  index: number
): RecommendationCandidate[] {
  const dictionary = metadataTable.dictionary ?? {};
  const routing = routingMetadata(dictionary);
  const fields = [...(metadataTable.fields ?? []), ...dictionaryFields(dictionary)];
  const candidates = table.columns.map(column => candidateForColumn(column, fields, dictionary));
  const primaryTime = readString(routing.primaryTimeField);
  const timeField = candidateByName(candidates, primaryTime)
    ?? firstByRole(candidates, ['time'])
    ?? candidates.find(candidate => candidate.column.type === 'date');
  const measures = candidates.filter(candidate => candidate.role === 'measure' || candidate.column.type === 'number');
  const dimensions = [
    ...defaultFilterNames(routing.defaultFilters).flatMap(name => candidateByName(candidates, name) ?? []),
    ...readStringArray(routing.filterFields).flatMap(name => candidateByName(candidates, name) ?? []),
    ...candidates.filter(candidate => candidate.role === 'filter' || candidate.role === 'dimension')
  ].filter(candidate => candidate.column.name !== timeField?.column.name);
  const measure = measures[0];
  if (!timeField && !measure) return [];

  const coverage = modelCoverageScore(metadataTable, dictionary, routing);
  const sampleQuestion = firstString([
    ...readStringArray(dictionary.sampleQuestions),
    ...readStringArray(recordValue(dictionary.ai)?.sampleQuestions),
    ...readStringArray(routing.exampleQuestions),
    ...readStringArray(routing.sampleQuestions)
  ]);
  const useFor = readStringArray(routing.useFor)[0];
  const grain = readString(routing.grain);
  const businessName = readString(dictionary.businessName) ?? labelFor(table.name);
  const defaultFilters = defaultFilterClauses(defaultFilterMetadata(routing, metadataTable, source, table.name), table);
  const selectedDimension = dimensions.find(hasExplicitFieldRole);
  const score = recommendationScore({
    coverage,
    defaultFilterCount: defaultFilters.length,
    grain,
    measure,
    routing,
    sampleQuestion,
    timeField
  });
  const query = measure
    ? aggregateQuery(table.name, timeField, selectedDimension, measure, defaultFilters)
    : conservativePreviewQuery(table.name, [timeField, selectedDimension], defaultFilters);
  return [{
    description: recommendationDescription(businessName, measure, selectedDimension, timeField, score),
    index,
    query,
    score,
    title: sampleQuestion ?? useFor ?? `${businessName} ${measure ? 'trend' : 'preview'}`
  }];
}

function recommendationDescription(
  businessName: string,
  measure: FieldCandidate | undefined,
  dimension: FieldCandidate | undefined,
  timeField: FieldCandidate | undefined,
  score: number
): string {
  if (!measure) return `Preview ${businessName}.`;
  const measureLabel = labelFor(measure.column.label || measure.column.name).toLowerCase();
  const dimensionLabel = dimension ? ` by ${labelFor(dimension.column.label || dimension.column.name).toLowerCase()}` : '';
  const timeLabel = timeField ? ' over time' : '';
  const confidence = score < 45 ? ' Review the query before using it in a dashboard.' : '';
  return `Shows ${measureLabel}${dimensionLabel}${timeLabel}.${confidence}`;
}

function aggregateQuery(
  tableName: string,
  timeField: FieldCandidate | undefined,
  dimension: FieldCandidate | undefined,
  measure: FieldCandidate,
  filters: SqlFilterClause[]
): string {
  const dimensions = uniqueValues([timeField?.column.name, dimension?.column.name]);
  const selectColumns = [
    ...dimensions,
    `SUM(${measure.column.name}) AS ${measure.column.name}_total`
  ];
  return [
    `SELECT ${selectColumns.join(', ')}`,
    `FROM ${tableName}`,
    whereClause(filters),
    dimensions.length ? `GROUP BY ${dimensions.join(', ')}` : '',
    timeField ? `ORDER BY ${timeField.column.name} DESC` : `ORDER BY ${measure.column.name}_total DESC`,
    'LIMIT 50'
  ].filter(Boolean).join('\n');
}

function conservativePreviewQuery(
  tableName: string,
  columns: Array<FieldCandidate | undefined>,
  filters: SqlFilterClause[]
): string {
  const selected = uniqueValues(columns.map(candidate => candidate?.column.name)).slice(0, 4);
  return [
    `SELECT ${selected.join(', ')}`,
    `FROM ${tableName}`,
    whereClause(filters),
    'LIMIT 25'
  ].filter(Boolean).join('\n');
}

interface SqlFilterClause {
  column: string;
  operator: string;
  value: unknown;
}

function defaultFilterClauses(values: unknown[], table: SqlEditorTable): SqlFilterClause[] {
  return values.flatMap(item => {
    const record = recordValue(item);
    if (!record) return [];
    const column = readString(record.column) ?? readString(record.field) ?? readString(record.name);
    if (!column || !columnByName(table, column) || record.value === undefined) return [];
    return [{ column, operator: readString(record.operator) ?? '=', value: record.value }];
  });
}

function defaultFilterMetadata(
  routing: Record<string, unknown>,
  metadataTable: SqlEditorMetadataTable,
  source: SqlEditorMetadataSource,
  tableName: string
): unknown[] {
  return [
    ...filterCollection(routing.defaultFilters, tableName),
    ...filterCollection(metadataTable.defaultFilters, tableName),
    ...filterCollection(metadataTable.settings?.defaultFilters, tableName),
    ...filterCollection(source.settings?.defaultFilters, tableName),
    ...filterCollection(source.dictionary?.defaultFilters, tableName)
  ];
}

function filterCollection(value: unknown, tableName: string): unknown[] {
  if (Array.isArray(value)) return value;
  const record = recordValue(value);
  const tableFilters = recordValue(record?.[tableName]) ?? recordValue(record?.[tableName.toLowerCase()]);
  if (Array.isArray(record?.[tableName])) return record[tableName] as unknown[];
  if (Array.isArray(record?.[tableName.toLowerCase()])) return record[tableName.toLowerCase()] as unknown[];
  return tableFilters ? [tableFilters] : [];
}

function whereClause(filters: SqlFilterClause[]): string {
  const clauses = filters.map(filter => `${filter.column} ${sqlOperator(filter.operator)} ${sqlValue(filter.value)}`);
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function sqlOperator(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === '!=' || normalized === '<>' || normalized === '>' || normalized === '>=' || normalized === '<' || normalized === '<=') return normalized;
  if (normalized === 'in') return 'IN';
  return '=';
}

function sqlValue(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `(${value.map(item => sqlValue(item)).join(', ')})`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

function recommendationScore(input: {
  coverage: number | null;
  defaultFilterCount: number;
  grain: string | undefined;
  measure: FieldCandidate | undefined;
  routing: Record<string, unknown>;
  sampleQuestion: string | undefined;
  timeField: FieldCandidate | undefined;
}): number {
  return [
    input.sampleQuestion ? 24 : 0,
    readStringArray(input.routing.useFor).length ? 18 : 0,
    readStringArray(input.routing.triggerKeywords).length ? 12 : 0,
    input.grain ? 12 : 0,
    input.timeField ? 10 : 0,
    input.measure ? 10 : 0,
    input.defaultFilterCount > 0 ? 6 : 0,
    input.coverage === null ? 0 : Math.min(18, Math.round(input.coverage / 6))
  ].reduce((total, value) => total + value, 0);
}

function modelCoverageScore(
  metadataTable: SqlEditorMetadataTable,
  dictionary: Record<string, unknown>,
  routing: Record<string, unknown>
): number | null {
  return readNumber(recordValue(metadataTable)?.modelCoverage)
    ?? readNumber(dictionary.modelCoverage)
    ?? readNumber(recordValue(dictionary.ai)?.modelCoverage)
    ?? readNumber(routing.modelCoverage);
}

function candidateForColumn(
  column: SqlEditorTable['columns'][number],
  fields: SqlEditorMetadataField[],
  dictionary: Record<string, unknown>
): FieldCandidate {
  const metadata = fieldMetadata(column.name, fields, dictionary);
  return { column, metadata, role: fieldRole(column, metadata) };
}

function fieldRole(
  column: SqlEditorTable['columns'][number],
  metadata: Record<string, unknown>
): FieldCandidate['role'] {
  const explicit = readString(metadata.columnType) ?? readString(metadata.role) ?? readString(metadata.semanticRole);
  if (explicit === 'time' || explicit === 'date') return 'time';
  if (explicit === 'measure' || explicit === 'metric') return 'measure';
  if (explicit === 'filter') return 'filter';
  if (explicit === 'dimension' || explicit === 'attribute') return 'dimension';
  if (column.type === 'date' || column.type === 'datetime' || column.type === 'timestamp') return 'time';
  if (column.type === 'number' || column.type === 'integer' || column.type === 'decimal') return 'measure';
  if (column.type === 'string' || column.type === 'boolean') return 'dimension';
  return 'unknown';
}

function fieldMetadata(
  fieldName: string,
  fields: SqlEditorMetadataField[],
  dictionary: Record<string, unknown>
): Record<string, unknown> {
  const directField = fields.find(field => field.name === fieldName);
  const collections = [dictionary.fields, dictionary.columns, recordValue(dictionary.ai)?.fields, recordValue(dictionary.ai)?.columns];
  for (const collection of collections) {
    const metadata = metadataFromCollection(collection, fieldName);
    if (metadata) return { ...directField, ...metadata };
  }
  return directField ? { ...directField } : {};
}

function metadataFromCollection(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const match = value.find(item => recordValue(item)?.name === fieldName);
    return recordValue(match);
  }
  if (recordValue(value) && recordValue(recordValue(value)?.[fieldName])) return recordValue(value)?.[fieldName] as Record<string, unknown>;
  return null;
}

function dictionaryFields(dictionary: Record<string, unknown>): SqlEditorMetadataField[] {
  const ai = recordValue(dictionary.ai) ?? {};
  return [
    ...fieldArray(dictionary.fields),
    ...fieldArray(dictionary.columns),
    ...fieldArray(ai.fields),
    ...fieldArray(ai.columns)
  ];
}

function fieldArray(value: unknown): SqlEditorMetadataField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const field = recordValue(item);
    if (!field || typeof field.name !== 'string') return [];
    return [{ ...field, name: field.name, type: readString(field.type) ?? 'string' } as SqlEditorMetadataField];
  });
}

function routingMetadata(dictionary: Record<string, unknown>): Record<string, unknown> {
  const ai = recordValue(dictionary.ai);
  return recordValue(ai?.routing) ?? recordValue(dictionary.routing) ?? {};
}

function defaultFilterNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string') return [item];
    const record = recordValue(item);
    return record ? readString(record.column) ?? readString(record.field) ?? readString(record.name) ?? [] : [];
  });
}

function candidateByName(candidates: FieldCandidate[], name: string | undefined): FieldCandidate | undefined {
  return name ? candidates.find(candidate => candidate.column.name === name) : undefined;
}

function firstByRole(candidates: FieldCandidate[], roles: FieldCandidate['role'][]): FieldCandidate | undefined {
  return candidates.find(candidate => roles.includes(candidate.role));
}

function hasExplicitFieldRole(candidate: FieldCandidate): boolean {
  return Boolean(readString(candidate.metadata.columnType) ?? readString(candidate.metadata.role) ?? readString(candidate.metadata.semanticRole));
}

function columnByName(table: SqlEditorTable, name: string | undefined): SqlEditorTable['columns'][number] | undefined {
  return name ? table.columns.find(column => column.name === name) : undefined;
}

function firstString(values: string[]): string | undefined {
  return values.find(Boolean);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => readString(item) ?? []) : [];
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function labelFor(value: string): string {
  return value.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
