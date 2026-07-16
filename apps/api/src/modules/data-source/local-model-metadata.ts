import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import {
  inputJson,
  isRecord,
  readString
} from './foundation-route-utils.js';
import {
  dataSources,
  findDataSource,
  toLabel,
  type DataSourceRecord,
  type FieldDefinition,
  type TableDefinition
} from './foundation-store.js';
import {
  canReadDataSourceTable,
  canWriteDataSource,
  scopedDataSourceForRead,
  scopedDataSourcesForRead,
  type DataSourceAccessPolicy
} from './source-access.js';

type MetadataAction = 'import' | 'test-question' | 'validate' | undefined;
type MetadataMode = 'merge' | 'replace';

interface NormalizedMetadataImport {
  fields: ModelFieldMetadata[];
  metadata: Record<string, unknown>;
  mode: MetadataMode;
  tableKey: string | null;
}

interface ModelFieldMetadata {
  aggregation?: string;
  aliases?: string[];
  analyzerHidden?: boolean;
  columnType?: string;
  defaultAggregation?: string;
  description?: string;
  dictionaryDescription?: string;
  format?: string;
  hiddenFromAnalyzer?: boolean;
  label?: string;
  name: string;
  role?: string;
  sampleQuestions?: string[];
  sampleValues?: unknown[];
  semanticRole?: string;
  synonyms?: string[];
  type?: string;
  valueAliases?: Record<string, string[]>;
  valueConcepts?: Array<Record<string, unknown>>;
}

interface ModelMetadataContext {
  access: DataSourceAccessPolicy;
  prismaClient: IntraQPrismaClient | null;
}

export async function handleModelMetadata(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  dataSourceId: string,
  action: MetadataAction,
  access: DataSourceAccessPolicy
): Promise<void> {
  const serviceContext = { access, prismaClient: context.prismaClient };
  try {
    if (!action && req.method === 'GET') {
      sendOk(res, listModelMetadata(dataSourceId, serviceContext, tableKeyFromUrl(url)));
      return;
    }

    if (action === 'validate' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body === null) {
        sendBadRequest(res, 'Request body must be valid JSON.');
        return;
      }
      sendOk(res, validateModelMetadata(dataSourceId, serviceContext, tableKeyFromInput(body, url)));
      return;
    }

    if (action === 'test-question' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!isRecord(body)) {
        sendBadRequest(res, 'Request body must be a JSON object.');
        return;
      }
      const question = readString(body.question);
      if (!question) {
        sendBadRequest(res, 'question is required.');
        return;
      }
      sendOk(res, testModelQuestion(dataSourceId, serviceContext, question, tableKeyFromInput(body, url)));
      return;
    }

    if (action === 'import' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!isRecord(body)) {
        sendBadRequest(res, 'Request body must be a JSON object.');
        return;
      }
      const result = await importModelMetadata(dataSourceId, serviceContext, body);
      sendOk(res, result);
      return;
    }

    sendJson(res, 405, fail('Method not allowed'));
  } catch (error) {
    sendMetadataError(res, error);
  }
}

export function listModelMetadata(
  dataSourceId: string,
  context: ModelMetadataContext,
  tableKey?: string | null
): Record<string, unknown> {
  const source = visibleSource(dataSourceId, context.access);
  if (!source) throw new Error('Data source not found.');
  if (tableKey) {
    const table = visibleTable(source, tableKey, context.access);
    if (!table) throw new Error('Data source table not found.');
    return {
      dataSourceId: source.id,
      dataSourceName: source.name,
      table: modelMetadataForTable(table)
    };
  }
  return {
    dataSourceId: source.id,
    dataSourceName: source.name,
    tables: source.tables
      .filter(table => canReadDataSourceTable(source, table, context.access))
      .map(modelMetadataForTable)
  };
}

export async function importModelMetadata(
  dataSourceId: string,
  context: ModelMetadataContext,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const source = visibleSource(dataSourceId, context.access);
  if (!source) throw new Error('Data source not found.');
  if (!canWriteDataSource(source, context.access)) throw new Error('Data source access is denied.');

  const imports = normalizeMetadataImports(body);
  if (imports.length === 0) throw new Error('metadata, fields, csv, or tables is required.');

  const results: Array<Record<string, unknown>> = [];
  for (const item of imports) {
    const table = resolveMetadataTable(source, item.tableKey, context.access);
    if (!table) {
      results.push({ skipped: true, table: item.tableKey, reason: 'Data source table not found.' });
      continue;
    }
    const result = applyMetadataImport(table, item);
    await persistTableMetadata(context.prismaClient, table);
    results.push({
      ...result,
      tableId: table.id,
      tableName: table.name,
      validation: readinessForTable(table)
    });
  }

  return {
    dataSourceId: source.id,
    dataSourceName: source.name,
    results,
    updated: results.filter(item => item.skipped !== true).length
  };
}

export function validateModelMetadata(
  dataSourceId: string,
  context: ModelMetadataContext,
  tableKey?: string | null
): Record<string, unknown> {
  const source = visibleSource(dataSourceId, context.access);
  if (!source) throw new Error('Data source not found.');
  if (tableKey) {
    const table = visibleTable(source, tableKey, context.access);
    if (!table) throw new Error('Data source table not found.');
    return {
      dataSourceId: source.id,
      dataSourceName: source.name,
      table: readinessForTable(table)
    };
  }
  const tables = source.tables
    .filter(table => canReadDataSourceTable(source, table, context.access))
    .map(readinessForTable);
  return {
    dataSourceId: source.id,
    dataSourceName: source.name,
    ready: tables.some(table => table.ready),
    tables
  };
}

export function testModelQuestion(
  dataSourceId: string,
  context: ModelMetadataContext,
  question: string,
  tableKey?: string | null
): Record<string, unknown> {
  const source = visibleSource(dataSourceId, context.access);
  if (!source) throw new Error('Data source not found.');
  const table = tableKey
    ? visibleTable(source, tableKey, context.access)
    : bestTableForQuestion(source, question, context.access);
  if (!table) throw new Error('Data source table not found.');
  const matches = scoredFieldsForQuestion(table, question);
  const measures = matches.filter(match => isMeasureField(match.field));
  const dimensions = matches.filter(match => !isMeasureField(match.field));
  return {
    confidence: Math.min(100, matches.slice(0, 5).reduce((score, match) => score + match.score, 0)),
    dimensions: dimensions.slice(0, 5).map(match => questionFieldMatch(match.field, match.score, table, question)),
    filters: filtersForQuestion(table, dimensions.map(match => match.field), question),
    measures: measures.slice(0, 5).map(match => questionFieldMatch(match.field, match.score, table, question)),
    question,
    table: {
      businessName: businessNameForTable(table),
      id: table.id,
      name: table.name
    },
    warnings: matches.length === 0 ? ['No fields matched the question. Add aliases, sample questions, or value aliases.'] : []
  };
}

export function listVisibleModelMetadata(
  context: ModelMetadataContext,
  limit: number
): Record<string, unknown> {
  const sources = scopedDataSourcesForRead(dataSources, context.access).slice(0, limit);
  return {
    dataSources: sources.map(source => ({
      id: source.id,
      name: source.name,
      tables: source.tables.map(table => ({
        id: table.id,
        name: table.name,
        readiness: readinessForTable(table)
      }))
    })),
    total: sources.length
  };
}

function visibleSource(dataSourceId: string, access: DataSourceAccessPolicy): DataSourceRecord | null {
  const source = findDataSource(dataSourceId);
  return source ? scopedDataSourceForRead(source, access) : null;
}

function visibleTable(
  source: DataSourceRecord,
  tableKey: string,
  access: DataSourceAccessPolicy
): TableDefinition | null {
  const table = source.tables.find(item => item.id === tableKey || item.name === tableKey);
  return canReadDataSourceTable(source, table, access) ? table ?? null : null;
}

function resolveMetadataTable(
  source: DataSourceRecord,
  tableKey: string | null,
  access: DataSourceAccessPolicy
): TableDefinition | null {
  if (tableKey) return visibleTable(source, tableKey, access);
  const readableTables = source.tables.filter(table => canReadDataSourceTable(source, table, access));
  if (readableTables.length === 1) return readableTables[0] ?? null;
  return readableTables.find(table => table.settings?.isDataModel === true) ?? readableTables[0] ?? null;
}

function normalizeMetadataImports(body: Record<string, unknown>): NormalizedMetadataImport[] {
  if (isRecord(body.tables)) {
    return Object.entries(body.tables).flatMap(([tableKey, value]) => {
      if (!isRecord(value)) return [];
      return [normalizeMetadataImport(value, tableKey)];
    });
  }
  return [normalizeMetadataImport(body, tableKeyFromInput(body, null))];
}

function normalizeMetadataImport(body: Record<string, unknown>, fallbackTableKey: string | null): NormalizedMetadataImport {
  const mode = body.mode === 'replace' ? 'replace' : 'merge';
  const metadata = readRecord(body.metadata ?? body.dictionary ?? body.modelMetadata);
  const directFields = normalizeFields(body.fields ?? body.columns);
  const csvFields = typeof body.csv === 'string' ? fieldsFromCsv(body.csv) : [];
  return {
    fields: [...directFields, ...csvFields],
    metadata,
    mode,
    tableKey: tableKeyFromInput(body, null) ?? fallbackTableKey
  };
}

function applyMetadataImport(table: TableDefinition, input: NormalizedMetadataImport): Record<string, unknown> {
  const fieldsByName = new Map(table.fields.map(field => [field.name, field]));
  const importedByName = new Map<string, ModelFieldMetadata>();
  const skipped: string[] = [];

  for (const field of input.fields) {
    if (!fieldsByName.has(field.name)) {
      skipped.push(field.name);
      continue;
    }
    importedByName.set(field.name, { ...(importedByName.get(field.name) ?? { name: field.name }), ...field });
  }

  table.fields = table.fields.map(field => {
    const patch = importedByName.get(field.name);
    return patch ? mergeFieldMetadata(field, patch, input.mode) : field;
  });

  applyTableMetadata(table, input.metadata, input.mode);
  syncDictionaryFieldMetadata(table, input.mode);

  return {
    importedFields: importedByName.size,
    skippedFields: skipped,
    tableMetadataUpdated: Object.keys(input.metadata).length > 0
  };
}

function applyTableMetadata(table: TableDefinition, metadata: Record<string, unknown>, mode: MetadataMode): void {
  const preservedDictionary = mode === 'replace' ? {} : table.dictionary;
  const nextDictionary: Record<string, unknown> = { ...preservedDictionary };
  const nextSettings: Record<string, unknown> = { ...(table.settings ?? {}) };
  const businessName = readString(metadata.businessName ?? metadata.name ?? metadata.label);
  const description = readString(metadata.description ?? metadata.tableDescription ?? metadata.businessPurpose);
  if (businessName) nextDictionary.businessName = businessName;
  if (description) {
    nextDictionary.description = description;
    table.description = description;
  }
  for (const key of ['aliases', 'grain', 'primaryDateField', 'routing', 'sampleQuestions', 'valueConcepts']) {
    if (metadata[key] !== undefined) nextDictionary[key] = metadata[key];
  }
  const ai = isRecord(nextDictionary.ai) && mode !== 'replace' ? { ...nextDictionary.ai } : {};
  if (Array.isArray(metadata.sampleQuestions)) ai.sampleQuestions = metadata.sampleQuestions;
  if (isRecord(metadata.ai)) Object.assign(ai, metadata.ai);
  if (Object.keys(ai).length > 0) nextDictionary.ai = ai;
  nextSettings.isDataModel = true;
  nextSettings.targetType = 'data_model';
  table.dictionary = nextDictionary;
  table.settings = nextSettings;
  table.isSelected = true;
}

function syncDictionaryFieldMetadata(table: TableDefinition, mode: MetadataMode): void {
  const existing = mode === 'replace' ? new Map<string, Record<string, unknown>>() : dictionaryFieldMap(table.dictionary.fields);
  const nextFields = table.fields.map(field => ({
    ...existing.get(field.name),
    ...fieldMetadataRecord(field)
  }));
  const ai = isRecord(table.dictionary.ai) ? { ...table.dictionary.ai } : {};
  ai.fields = Object.fromEntries(nextFields.map(field => [String(field.name), field]));
  table.dictionary = {
    ...table.dictionary,
    ai,
    fields: nextFields
  };
}

function mergeFieldMetadata(field: FieldDefinition, patch: ModelFieldMetadata, mode: MetadataMode): FieldDefinition {
  const base = mode === 'replace'
    ? {
        name: field.name,
        type: field.type,
        description: '',
        dictionaryDescription: ''
      }
    : field;
  const description = patch.description ?? patch.dictionaryDescription;
  const next: FieldDefinition = {
    ...base,
    ...(patch.type ? { type: patch.type } : {}),
    ...(description ? { description } : {}),
    ...(patch.dictionaryDescription ?? description ? { dictionaryDescription: patch.dictionaryDescription ?? description ?? '' } : {})
  };
  for (const key of [
    'aggregation',
    'aliases',
    'analyzerHidden',
    'columnType',
    'defaultAggregation',
    'format',
    'hiddenFromAnalyzer',
    'label',
    'role',
    'sampleQuestions',
    'sampleValues',
    'semanticRole',
    'synonyms',
    'valueAliases',
    'valueConcepts'
  ] as const) {
    const value = patch[key];
    if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
  }
  return next;
}

function modelMetadataForTable(table: TableDefinition): Record<string, unknown> {
  return {
    businessName: businessNameForTable(table),
    description: table.dictionary.description ?? table.description,
    fields: table.fields.map(fieldMetadataRecord),
    id: table.id,
    name: table.name,
    readiness: readinessForTable(table),
    sampleQuestions: stringArray(table.dictionary.sampleQuestions),
    settings: {
      isDataModel: table.settings?.isDataModel === true,
      targetType: table.settings?.targetType ?? table.dictionary.targetType
    }
  };
}

function readinessForTable(table: TableDefinition): Record<string, unknown> {
  const fields = table.fields;
  const describedFields = fields.filter(field =>
    Boolean(field.label || field.description || field.dictionaryDescription || field.aliases?.length || field.synonyms?.length)
  ).length;
  const measures = fields.filter(isMeasureField).length;
  const dimensions = fields.filter(field => !isMeasureField(field)).length;
  const sampleQuestions = stringArray(table.dictionary.sampleQuestions).length
    + stringArray(isRecord(table.dictionary.ai) ? table.dictionary.ai.sampleQuestions : undefined).length
    + fields.reduce((count, field) => count + (field.sampleQuestions?.length ?? 0), 0);
  const valueAliasCount = fields.reduce((count, field) => count + valueAliasCountForField(field), 0);
  const issues: string[] = [];
  const warnings: string[] = [];
  if (table.isSelected !== true) issues.push('Table is not selected.');
  if (table.settings?.isDataModel !== true) issues.push('Table is not marked as a data model.');
  if (fields.length === 0) issues.push('No fields are available.');
  if (measures === 0) issues.push('No measure fields were identified.');
  if (dimensions === 0) issues.push('No dimension fields were identified.');
  if (describedFields < Math.ceil(fields.length * 0.5)) warnings.push('Less than half of the fields have labels, descriptions, aliases, or synonyms.');
  if (sampleQuestions === 0) warnings.push('No sample questions are configured.');
  if (valueAliasCount === 0) warnings.push('No value aliases are configured for business wording such as direct, online, or partner.');
  const score = Math.max(0, Math.min(100,
    (table.isSelected === true ? 10 : 0)
    + (table.settings?.isDataModel === true ? 15 : 0)
    + (fields.length > 0 ? 10 : 0)
    + Math.min(25, describedFields * 5)
    + (measures > 0 ? 15 : 0)
    + (dimensions > 0 ? 10 : 0)
    + Math.min(10, sampleQuestions * 2)
    + Math.min(5, valueAliasCount)
  ));
  return {
    describedFields,
    dimensionFields: dimensions,
    fieldCount: fields.length,
    issues,
    measureFields: measures,
    ready: issues.length === 0 && score >= 65,
    score,
    tableId: table.id,
    tableName: table.name,
    valueAliasCount,
    warnings
  };
}

function scoredFieldsForQuestion(table: TableDefinition, question: string): Array<{ field: FieldDefinition; score: number }> {
  const normalizedQuestion = normalize(question);
  return table.fields
    .map(field => ({ field, score: scoreFieldForQuestion(table, field, normalizedQuestion) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score);
}

function scoreFieldForQuestion(table: TableDefinition, field: FieldDefinition, normalizedQuestion: string): number {
  const terms = fieldQuestionTerms(table, field);
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (normalizedQuestion.includes(term)) score += term.length > 8 ? 10 : 5;
  }
  for (const value of valueAliasEntries(field)) {
    if (normalizedQuestion.includes(normalize(value.canonical))) score += 4;
    if (value.aliases.some(alias => normalizedQuestion.includes(normalize(alias)))) score += 8;
  }
  return score;
}

function questionFieldMatch(
  field: FieldDefinition,
  score: number,
  table: TableDefinition,
  question: string
): Record<string, unknown> {
  return {
    aliases: field.aliases ?? [],
    field: field.name,
    label: field.label ?? toLabel(field.name),
    matchedValues: filtersForQuestion(table, [field], question).flatMap(filter => Array.isArray(filter.value) ? filter.value : []),
    role: field.role ?? field.semanticRole ?? (isMeasureField(field) ? 'measure' : 'dimension'),
    score
  };
}

function filtersForQuestion(
  table: TableDefinition,
  fields: FieldDefinition[],
  question: string
): Array<Record<string, unknown>> {
  const normalizedQuestion = normalize(question);
  return fields.flatMap(field => {
    const values = valueAliasEntries(field).flatMap(entry => {
      const matchedAlias = entry.aliases.some(alias => normalizedQuestion.includes(normalize(alias)));
      const matchedCanonical = normalizedQuestion.includes(normalize(entry.canonical));
      return matchedAlias || matchedCanonical ? [sampleValueWithOriginalCase(field, entry.canonical)] : [];
    });
    const uniqueValues = uniqueStrings(values);
    return uniqueValues.length > 0 ? [{ field: field.name, operator: 'in', value: uniqueValues, table: table.name }] : [];
  });
}

function bestTableForQuestion(
  source: DataSourceRecord,
  question: string,
  access: DataSourceAccessPolicy
): TableDefinition | null {
  const tables = source.tables.filter(table => canReadDataSourceTable(source, table, access));
  let best: { score: number; table: TableDefinition } | null = null;
  for (const table of tables) {
    const score = scoredFieldsForQuestion(table, question).slice(0, 3).reduce((sum, item) => sum + item.score, 0)
      + stringArray(table.dictionary.sampleQuestions).filter(item => normalize(question).includes(normalize(item))).length * 10;
    if (!best || score > best.score) best = { score, table };
  }
  return best?.table ?? tables[0] ?? null;
}

function fieldQuestionTerms(table: TableDefinition, field: FieldDefinition): string[] {
  const metadata = dictionaryFieldMap(table.dictionary.fields).get(field.name) ?? {};
  const ai = isRecord(table.dictionary.ai) ? table.dictionary.ai : {};
  const aiMetadata = dictionaryFieldMap(ai.fields).get(field.name) ?? {};
  return uniqueStrings([
    field.name,
    field.label,
    field.description,
    field.dictionaryDescription,
    field.role,
    field.semanticRole,
    field.format,
    metadata.label,
    metadata.businessName,
    metadata.description,
    metadata.dictionaryDescription,
    metadata.aliases,
    metadata.synonyms,
    metadata.sampleQuestions,
    aiMetadata.label,
    aiMetadata.businessName,
    aiMetadata.description,
    aiMetadata.aliases,
    aiMetadata.synonyms,
    aiMetadata.sampleQuestions,
    field.aliases,
    field.synonyms,
    field.sampleQuestions,
    field.sampleValues
  ].flatMap(stringsFromUnknown).map(normalize).filter(Boolean));
}

function valueAliasEntries(field: FieldDefinition): Array<{ aliases: string[]; canonical: string }> {
  const entries: Array<{ aliases: string[]; canonical: string }> = [];
  if (field.valueAliases) {
    for (const [canonical, aliases] of Object.entries(field.valueAliases)) {
      if (canonical.trim()) entries.push({ canonical: canonical.trim(), aliases });
    }
  }
  if (Array.isArray(field.valueConcepts)) {
    for (const concept of field.valueConcepts) {
      const canonical = readString(concept.value ?? concept.canonical ?? concept.label ?? concept.conceptKey);
      const aliases = stringArray(concept.aliases ?? concept.synonyms);
      const matchValues = stringArray(concept.matchValues ?? concept.values ?? concept.sourceValues);
      for (const value of matchValues.length > 0 ? matchValues : canonical ? [canonical] : []) {
        entries.push({ canonical: value, aliases: uniqueStrings([canonical, ...aliases].filter(isNonEmptyString)) });
      }
    }
  }
  return entries;
}

async function persistTableMetadata(client: IntraQPrismaClient | null, table: TableDefinition): Promise<void> {
  if (!client) return;
  await client.dataSourceTable.update({
    where: { id: table.id },
    data: {
      description: table.description,
      dictionary: inputJson(table.dictionary),
      fields: inputJson(table.fields),
      settings: inputJson(table.settings ?? {})
    }
  });
}

function normalizeFields(value: unknown): ModelFieldMetadata[] {
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([name, item]) => normalizeFieldMetadata({ name, ...(isRecord(item) ? item : {}) }) ?? []);
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => normalizeFieldMetadata(item) ?? []);
}

function normalizeFieldMetadata(value: unknown): ModelFieldMetadata | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name ?? value.field ?? value.column);
  if (!name) return null;
  const description = readString(value.description);
  const dictionaryDescription = readString(value.dictionaryDescription ?? value.definition ?? value.businessDefinition);
  return {
    name,
    ...(readString(value.aggregation) ? { aggregation: readString(value.aggregation)! } : {}),
    ...(stringArray(value.aliases).length ? { aliases: stringArray(value.aliases) } : {}),
    ...(value.analyzerHidden === true ? { analyzerHidden: true } : {}),
    ...(readString(value.columnType) ? { columnType: readString(value.columnType)! } : {}),
    ...(readString(value.defaultAggregation) ? { defaultAggregation: readString(value.defaultAggregation)! } : {}),
    ...(description ? { description } : {}),
    ...(dictionaryDescription ? { dictionaryDescription } : {}),
    ...(readString(value.format) ? { format: readString(value.format)! } : {}),
    ...(value.hiddenFromAnalyzer === true ? { hiddenFromAnalyzer: true } : {}),
    ...(readString(value.label ?? value.businessName) ? { label: readString(value.label ?? value.businessName)! } : {}),
    ...(readString(value.role) ? { role: readString(value.role)! } : {}),
    ...(stringArray(value.sampleQuestions).length ? { sampleQuestions: stringArray(value.sampleQuestions) } : {}),
    ...(sampleValues(value.sampleValues).length ? { sampleValues: sampleValues(value.sampleValues) } : {}),
    ...(readString(value.semanticRole) ? { semanticRole: readString(value.semanticRole)! } : {}),
    ...(stringArray(value.synonyms).length ? { synonyms: stringArray(value.synonyms) } : {}),
    ...(readString(value.type) ? { type: readString(value.type)! } : {}),
    ...(Object.keys(valueAliases(value.valueAliases ?? value.valueMap)).length ? { valueAliases: valueAliases(value.valueAliases ?? value.valueMap) } : {}),
    ...(recordArray(value.valueConcepts).length ? { valueConcepts: recordArray(value.valueConcepts) } : {})
  };
}

function fieldsFromCsv(csv: string): ModelFieldMetadata[] {
  const rows = parseCsv(csv);
  const headers = rows[0]?.map(header => normalizeHeader(header)) ?? [];
  if (headers.length === 0) return [];
  return rows.slice(1).flatMap(row => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const value = row[index]?.trim() ?? '';
      if (value) record[header] = value;
    });
    return normalizeFieldMetadata(record) ?? [];
  });
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(current);
      current = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      current = '';
      continue;
    }
    current += char;
  }
  row.push(current);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  const compact = value.trim().replace(/[^A-Za-z0-9]+(.)/g, (_match, char: string) => char.toUpperCase());
  if (compact === 'field' || compact === 'column') return 'name';
  if (compact === 'dictionarydescription' || compact === 'businessdefinition') return 'dictionaryDescription';
  if (compact === 'defaultaggregation') return 'defaultAggregation';
  if (compact === 'samplequestions') return 'sampleQuestions';
  if (compact === 'samplevalues') return 'sampleValues';
  if (compact === 'semanticrole') return 'semanticRole';
  if (compact === 'valuealiases' || compact === 'valuemap') return 'valueAliases';
  if (compact === 'valueconcepts') return 'valueConcepts';
  return compact.charAt(0).toLowerCase() + compact.slice(1);
}

function fieldMetadataRecord(field: FieldDefinition): Record<string, unknown> {
  return {
    name: field.name,
    type: field.type,
    ...(field.aggregation ? { aggregation: field.aggregation } : {}),
    ...(field.aliases?.length ? { aliases: field.aliases } : {}),
    ...(field.analyzerHidden === true ? { analyzerHidden: true } : {}),
    ...(field.columnType ? { columnType: field.columnType } : {}),
    ...(field.defaultAggregation ? { defaultAggregation: field.defaultAggregation } : {}),
    ...(field.description ? { description: field.description } : {}),
    ...(field.dictionaryDescription ? { dictionaryDescription: field.dictionaryDescription } : {}),
    ...(field.format ? { format: field.format } : {}),
    ...(field.hiddenFromAnalyzer === true ? { hiddenFromAnalyzer: true } : {}),
    ...(field.label ? { label: field.label } : {}),
    ...(field.role ? { role: field.role } : {}),
    ...(field.sampleQuestions?.length ? { sampleQuestions: field.sampleQuestions } : {}),
    ...(field.sampleValues?.length ? { sampleValues: field.sampleValues } : {}),
    ...(field.semanticRole ? { semanticRole: field.semanticRole } : {}),
    ...(field.synonyms?.length ? { synonyms: field.synonyms } : {}),
    ...(field.valueAliases && Object.keys(field.valueAliases).length ? { valueAliases: field.valueAliases } : {}),
    ...(field.valueConcepts?.length ? { valueConcepts: field.valueConcepts } : {})
  };
}

function dictionaryFieldMap(value: unknown): Map<string, Record<string, unknown>> {
  if (Array.isArray(value)) {
    return new Map(value.flatMap(item => {
      if (!isRecord(item)) return [];
      const name = readString(item.name ?? item.field);
      return name ? [[name, item] as const] : [];
    }));
  }
  if (isRecord(value)) {
    return new Map(Object.entries(value).flatMap(([name, item]) =>
      isRecord(item) ? [[name, { name, ...item }] as const] : []
    ));
  }
  return new Map();
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(item => ({ ...item }));
}

function sampleValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return splitList(value);
  return [];
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(isNonEmptyString).map(item => item.trim());
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return stringArray(parsed);
    } catch {
      return splitList(value);
    }
  }
  return [];
}

function valueAliases(value: unknown): Record<string, string[]> {
  if (typeof value === 'string') {
    try {
      return valueAliases(JSON.parse(value) as unknown);
    } catch {
      return valueAliasesFromText(value);
    }
  }
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const aliases = stringArray(item);
    return key.trim() && aliases.length > 0 ? [[key.trim(), aliases]] : [];
  }));
}

function valueAliasesFromText(value: string): Record<string, string[]> {
  const entries = value.split(';').map(item => item.trim()).filter(Boolean);
  return Object.fromEntries(entries.flatMap(entry => {
    const separator = entry.includes(':') ? ':' : '=';
    const [rawKey, rawAliases] = entry.split(separator);
    const key = rawKey?.trim();
    const aliases = splitList(rawAliases ?? '');
    return key && aliases.length > 0 ? [[key, aliases]] : [];
  }));
}

function valueAliasCountForField(field: FieldDefinition): number {
  return valueAliasEntries(field).reduce((count, entry) => count + entry.aliases.length, 0);
}

function sampleValueWithOriginalCase(field: FieldDefinition, value: string): string {
  const normalizedValue = normalize(value);
  const match = (field.sampleValues ?? []).find(item => typeof item === 'string' && normalize(item) === normalizedValue);
  return typeof match === 'string' ? match : value;
}

function isMeasureField(field: FieldDefinition): boolean {
  const text = normalize(`${field.role ?? ''} ${field.semanticRole ?? ''} ${field.columnType ?? ''} ${field.format ?? ''} ${field.type}`);
  if (['string', 'date', 'datetime', 'timestamp', 'boolean'].includes(field.type.trim().toLowerCase()) && !text.includes('measure')) {
    return false;
  }
  return text.includes('measure') || text.includes('metric') || text.includes('currency') || field.type === 'number';
}

function businessNameForTable(table: TableDefinition): string {
  return readString(table.dictionary.businessName) ?? table.name;
}

function tableKeyFromInput(value: unknown, url: URL | null): string | null {
  if (isRecord(value)) {
    return readString(value.table)
      ?? readString(value.tableId)
      ?? readString(value.tableName)
      ?? readString(value.model)
      ?? null;
  }
  return tableKeyFromUrl(url);
}

function tableKeyFromUrl(url: URL | null): string | null {
  return url?.searchParams.get('table')
    ?? url?.searchParams.get('tableId')
    ?? url?.searchParams.get('tableName')
    ?? null;
}

function splitList(value: string): string[] {
  return value.split(/[|,\n]/).map(item => item.trim()).filter(Boolean);
}

function stringsFromUnknown(value: unknown): string[] {
  const direct = readString(value);
  if (direct) return [direct];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(stringsFromUnknown);
}

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sendMetadataError(res: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'AI model metadata request failed.';
  const statusCode = message.toLowerCase().includes('access is denied')
    ? 403
    : message.toLowerCase().includes('not found')
      ? 404
      : message.toLowerCase().includes('required')
        ? 400
        : 500;
  sendJson(res, statusCode, fail(message));
}
