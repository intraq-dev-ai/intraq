import { uuidv7 } from '@intraq/contracts';
import type {
  SaveCustomQueryPayload,
  SqlEditorParameter,
  SqlEditorQueryResult,
  SqlEditorSchema,
  SqlEditorTab,
  SqlEditorTable
} from './types';

let nextTabNumber = 1;

export function createSqlTab(dataSourceId: string, query: string, dataSourceName = ''): SqlEditorTab {
  const tabNumber = nextTabNumber;
  nextTabNumber += 1;
  return {
    id: uuidv7(),
    name: `Query ${tabNumber}`,
    dataSourceId,
    dataSourceName,
    query,
    parameters: extractParameters(query),
    parameterValues: {},
    customSourceId: '',
    pivotDimension: '',
    pivotMetric: '',
    pivotConfig: null,
    currentPage: 1,
    result: null,
    error: ''
  };
}

export function setNextSqlTabNumber(value: number): void {
  nextTabNumber = Math.max(1, value);
}

export function defaultQuery(table: SqlEditorTable | undefined): string {
  if (!table) return '';
  const columnList = table.columns.map(column => column.name).join(', ');
  return `select ${columnList} from ${table.name} limit 25`;
}

export function extractParameters(query: string): SqlEditorParameter[] {
  const optionalNames = optionalParameterNames(query);
  const names = Array.from(new Set([
    ...[...query.matchAll(/:([a-z][a-z0-9_]*)/gi)].map(match => match[1] ?? ''),
    ...[...query.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi)].map(match => match[1] ?? '')
  ]));
  return names.filter(Boolean).map(name => {
    const dataType = inferParameterType(name);
    return {
      id: `parameter-${name}`,
      name,
      dataType,
      required: !optionalNames.has(name.toLowerCase()),
      defaultValue: '',
      description: `${name} query parameter.`,
      dateRole: inferredDateRole(name, dataType)
    };
  });
}

// Parameters wrapped in an optional block — `[[ ... {{name}} ... ]]` — are optional.
function optionalParameterNames(query: string): Set<string> {
  const optional = new Set<string>();
  for (const block of query.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
    const inner = block[1] ?? '';
    for (const match of inner.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi)) optional.add((match[1] ?? '').toLowerCase());
    for (const match of inner.matchAll(/:([a-z][a-z0-9_]*)/gi)) optional.add((match[1] ?? '').toLowerCase());
  }
  return optional;
}

// Returns the canonical query token for a parameter: required `{{name}}`, optional `[[{{name}}]]`.
export function parameterSyntax(parameter: SqlEditorParameter): string {
  return parameter.required ? `{{${parameter.name}}}` : `[[{{${parameter.name}}}]]`;
}

// Relative-date default token used when a required date parameter is left blank.
export function defaultDateTokenForParameter(parameter: Pick<SqlEditorParameter, 'name'>): string {
  return /^(to|end|end_date|to_date)$/i.test(parameter.name) ? 'TODAY' : 'START_OF_MONTH';
}

// Fills required date/datetime parameters that have no default with a relative-date token (legacy parity).
export function applyRequiredDateDefaults(parameters: SqlEditorParameter[]): SqlEditorParameter[] {
  return parameters.map(parameter => {
    const isDate = parameter.dataType === 'date' || parameter.dataType === 'datetime';
    if (!parameter.required || !isDate || parameter.defaultValue.trim()) return parameter;
    return { ...parameter, defaultValue: defaultDateTokenForParameter(parameter) };
  });
}

export function syncSqlParameters(
  query: string,
  previousParameters: SqlEditorParameter[],
  previousValues: Record<string, string>
): { parameters: SqlEditorParameter[]; parameterValues: Record<string, string> } {
  const parameters = extractParameters(query).map(param => {
    const previous = previousParameters.find(item => item.name === param.name);
    return previous ? { ...param, ...previous, id: param.id, name: param.name } : param;
  });
  return {
    parameters,
    parameterValues: Object.fromEntries(parameters.map(param => [
      param.name,
      previousValues[param.name] ?? param.defaultValue
    ]))
  };
}

export function canEditSavedSqlModel(sourceId: string): boolean {
  return sourceId.trim().length > 0;
}

export function replaceParameters(query: string, values: Record<string, string>): string {
  const replaceValue = (_match: string, name: string): string => {
    const value = values[name] ?? '';
    if (/^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase();
    return Number.isFinite(Number(value)) && value.trim() !== '' ? value : `'${value.replace(/'/g, "''")}'`;
  };
  const hasValue = (name: string): boolean => String(values[name] ?? '').trim() !== '';
  // Resolve optional blocks first: keep the inner clause only when every
  // referenced parameter has a value, otherwise drop the whole `[[ ... ]]` block.
  const withOptionalResolved = query.replace(/\[\[([\s\S]*?)\]\]/g, (_full, inner: string) => {
    const names = [
      ...[...inner.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi)].map(match => match[1] ?? ''),
      ...[...inner.matchAll(/:([a-z][a-z0-9_]*)/gi)].map(match => match[1] ?? '')
    ].filter(Boolean);
    return names.length > 0 && names.some(name => !hasValue(name)) ? '' : inner;
  });
  return withOptionalResolved
    .replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, replaceValue)
    .replace(/:([a-z][a-z0-9_]*)/gi, replaceValue);
}

export function formatSql(query: string): string {
  return query
    .replace(/\s+/g, ' ')
    .replace(/\bfrom\b/gi, '\nfrom')
    .replace(/\bwhere\b/gi, '\nwhere')
    .replace(/\bgroup by\b/gi, '\ngroup by')
    .replace(/\border by\b/gi, '\norder by')
    .replace(/\blimit\b/gi, '\nlimit')
    .trim();
}

export function buildSavePayload(
  name: string,
  description: string,
  baseDataSourceId: string,
  query: string,
  parameters: SqlEditorParameter[],
  isTemplate: boolean,
  result: SqlEditorQueryResult | null = null
): SaveCustomQueryPayload {
  return {
    name: normalizeSqlModelName(name),
    description,
    baseDataSourceId,
    query,
    parameters,
    ...(result ? {
      fields: dataModelFieldsFromResult(result),
      sampleRows: result.rows.slice(0, 1000)
    } : {}),
    settings: { isTemplate, isDataModel: true },
    config: { query, columns: extractSelectedColumns(query) }
  };
}

export function normalizeParametersForSave(parameters: SqlEditorParameter[]): SqlEditorParameter[] {
  return parameters.map(param => {
    const lowerName = param.name.toLowerCase();
    const looksLikeStart = ['from', 'start', 'start_date', 'from_date'].includes(lowerName);
    const looksLikeEnd = ['to', 'end', 'end_date', 'to_date'].includes(lowerName);
    const isDate = param.dataType === 'date' || param.dataType === 'datetime';
    if (!isDate && !looksLikeStart && !looksLikeEnd) return { ...param };

    const defaultValue = param.required && !param.defaultValue.trim()
      ? looksLikeEnd ? 'TODAY' : 'START_OF_MONTH'
      : param.defaultValue;
    return {
      ...param,
      dataType: param.dataType === 'datetime' ? 'datetime' : 'date',
      dateRole: param.dateRole === 'none' ? inferredDateRole(param.name, 'date') : param.dateRole,
      defaultValue
    };
  });
}

export function validateRequiredDateRoleMapping(parameters: SqlEditorParameter[]): string | null {
  const requiredDateParams = parameters.filter(param =>
    param.required && (param.dataType === 'date' || param.dataType === 'datetime')
  );
  if (requiredDateParams.length < 2) return null;

  const mapped = requiredDateParams.filter(param => param.dateRole === 'start' || param.dateRole === 'end');
  const startCount = mapped.filter(param => param.dateRole === 'start').length;
  const endCount = mapped.filter(param => param.dateRole === 'end').length;
  if (startCount > 1 || endCount > 1) return 'Only one required date parameter can be Start date and only one can be End date.';
  if (startCount !== 1 || endCount !== 1) return 'Assign exactly one Start date and one End date for required date parameters.';
  if (mapped.length > 2) return 'Only two required date parameters can have date roles (one Start and one End).';
  return null;
}

export function normalizeSqlModelName(value: string): string {
  const slug = value.trim().toLowerCase().replace(/^sql[_\s-]*/i, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `sql_${slug || 'data_model'}`;
}

export type AssistantSqlReplacementType = 'append' | 'full' | 'partial';
export type SqlAssistantQuickAction = 'add-comments' | 'analyze' | 'explain' | 'format' | 'optimize' | 'remove-aliases';

export interface AssistantSqlBlock {
  replacementType: AssistantSqlReplacementType;
  sql: string;
}

export function assistantSql(content: string): string {
  return assistantSqlBlocks(content)[0]?.sql ?? stripAssistantMetadata(content).trim();
}

export function assistantSqlBlocks(content: string): AssistantSqlBlock[] {
  const replacementType = assistantReplacementType(content);
  // Drop the OLD_CODE region so only the new SQL block is surfaced/rendered (legacy parity).
  const cleaned = removeOldCodeRegion(content);
  const blocks = Array.from(cleaned.matchAll(/```([a-z0-9_-]*)[ \t\r]*\n?([\s\S]*?)```/gi))
    .flatMap(match => {
      const language = (match[1] ?? '').trim().toLowerCase();
      const sql = normalizeAssistantSql(match[2] ?? '');
      // Partial replacements carry SQL fragments (e.g. a WHERE clause), so skip the full-statement check.
      if (!sql || (language && language !== 'sql') || (replacementType !== 'partial' && !looksLikeSql(sql))) return [];
      return [{ replacementType, sql }];
    });
  if (blocks.length > 0) return blocks;

  const sql = normalizeAssistantSql(cleaned);
  return looksLikeSql(sql) ? [{ replacementType, sql }] : [];
}

// Applies a partial replacement: swaps the OLD_CODE snippet for the new SQL inside
// the current query. Returns null when markers are absent or the old snippet can't be located.
export function assistantPartialReplacement(content: string, currentQuery: string): string | null {
  const oldMatch = /<!--\s*OLD_CODE\s*-->([\s\S]*?)<!--\s*END_OLD_CODE\s*-->/i.exec(content);
  if (!oldMatch?.[1] || !currentQuery.trim()) return null;
  const oldSql = fencedSqlOrText(oldMatch[1]);
  const newSql = assistantSqlBlocks(content)[0]?.sql ?? '';
  if (!oldSql || !newSql) return null;

  // Try an exact match first, then a whitespace-tolerant match against the current query.
  if (currentQuery.includes(oldSql)) return currentQuery.replace(oldSql, newSql);
  const flexible = new RegExp(oldSql.split(/\s+/).map(escapeRegExpToken).join('\\s+'), 'i');
  return flexible.test(currentQuery) ? currentQuery.replace(flexible, newSql) : null;
}

function fencedSqlOrText(region: string): string {
  const fenced = /```[a-z0-9_-]*[ \t\r]*\n?([\s\S]*?)```/i.exec(region);
  return normalizeAssistantSql(fenced?.[1] ?? region);
}

function escapeRegExpToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeOldCodeRegion(content: string): string {
  return content.replace(/<!--\s*OLD_CODE\s*-->[\s\S]*?<!--\s*END_OLD_CODE\s*-->/gi, '');
}

export function assistantNarrativeText(content: string): string {
  const narrative = stripAssistantMetadata(removeOldCodeRegion(content))
    .replace(/```[a-z0-9_-]*[ \t\r]*\n?[\s\S]*?```/gi, '')
    .split('\n')
    .map(line => sanitizeAssistantNarrativeLine(line.trim()))
    .filter(Boolean)
    .join('\n');
  return looksLikeSql(narrative) ? '' : narrative;
}

export function assistantQuickActionPrompt(action: SqlAssistantQuickAction, currentQuery: string): string {
  const queryBlock = ['```sql', currentQuery.trim(), '```'].join('\n');
  const instruction = {
    'add-comments': 'Add concise SQL comments that explain the important clauses without changing the query result.',
    analyze: 'Analyze this SQL query for business meaning, result shape, assumptions, and possible issues.',
    explain: 'Explain this SQL query in plain language for a dashboard builder user.',
    format: 'Format this SQL query with readable indentation and preserve the same selected fields, filters, grouping, and limits.',
    optimize: 'Optimize this SQL query while preserving the same selected fields, filters, grouping, and limits.',
    'remove-aliases': 'Remove unnecessary table aliases from this SQL query while preserving the same result.'
  } satisfies Record<SqlAssistantQuickAction, string>;
  return `${instruction[action]}\n\n${queryBlock}`;
}

export function csvFromResult(result: SqlEditorQueryResult): string {
  const rows = result.rows.map(row =>
    result.columns.map(column => csvCell(row[column])).join(',')
  );
  return [result.columns.join(','), ...rows].join('\n');
}

export function dataModelFieldsFromResult(result: SqlEditorQueryResult | null): Array<{
  name: string;
  type: string;
  description: string;
}> {
  if (!result) return [];
  return result.columns.map(name => ({
    name,
    type: result.columnTypes.find(column => column.name === name)?.type ?? inferFieldTypeFromRows(result.rows, name),
    description: `${name} returned by the saved SQL data model.`
  }));
}

export function pivotPreview(
  result: SqlEditorQueryResult | null,
  dimension: string,
  metric: string
): Array<{ key: string; value: number }> {
  if (!result || !dimension || !metric) return [];
  const groups = new Map<string, number>();
  for (const row of result.rows) {
    const key = String(row[dimension] ?? '(blank)');
    const next = Number(row[metric] ?? 0);
    groups.set(key, (groups.get(key) ?? 0) + (Number.isFinite(next) ? next : 0));
  }
  return Array.from(groups.entries()).map(([key, value]) => ({ key, value }));
}

export function metadataColumns(schema: SqlEditorSchema | null): Array<{
  name: string;
  type: string;
  columnType: string;
  dictionaryDescription: string;
}> {
  const table = schema?.tables[0];
  return (table?.columns ?? []).map(column => ({
    name: column.name,
    type: column.type,
    columnType: column.type === 'number' ? 'measure' : 'dimension',
    dictionaryDescription: column.description || `${column.name} field.`
  }));
}

export function metadataColumnsFromSavedFields(fields: Array<{
  name: string;
  type: string;
  description?: string;
  dictionaryDescription?: string;
}>): Array<{
  name: string;
  type: string;
  columnType: string;
  dictionaryDescription: string;
}> {
  return fields.map(field => ({
    name: field.name,
    type: field.type,
    columnType: field.type === 'number' ? 'measure' : 'dimension',
    dictionaryDescription: field.dictionaryDescription || field.description || `${field.name} returned by the saved SQL data model.`
  }));
}

function assistantReplacementType(content: string): AssistantSqlReplacementType {
  const match = /SQL_REPLACEMENT_TYPE:\s*(append|full|partial|replace)\b/i.exec(content);
  const value = match?.[1]?.toLowerCase();
  if (value === 'append') return 'append';
  if (value === 'partial' || /<!--\s*OLD_CODE\s*-->/i.test(content)) return 'partial';
  return 'full';
}

function normalizeAssistantSql(content: string): string {
  return stripAssistantMetadata(content).trim();
}

function stripAssistantMetadata(content: string): string {
  return content
    .replace(/<!--\s*SQL_REPLACEMENT_TYPE:\s*(?:append|full|partial|replace)\s*-->/gi, '')
    .replace(/^\s*(?:--|#)\s*SQL_REPLACEMENT_TYPE:\s*(?:append|full|partial|replace)\s*$/gim, '')
    .replace(/<!--\s*\/?(?:OLD_CODE|END_OLD_CODE)\s*-->/gi, '');
}

function sanitizeAssistantNarrativeLine(line: string): string {
  if (/^Restored SQL assistant session\b/i.test(line)) return '';
  if (/\b(?:conversation|session)\s+id\b/i.test(line)) return '';
  const customerFacing = line
    .replace(/\bmodel\s+metadata\b/gi, 'data source details')
    .replace(/\bmetadata\b/gi, 'details')
    .trim();
  return /^(?:I used|Uses) the .+ data source\b/i.test(customerFacing) ? '' : customerFacing;
}

function looksLikeSql(content: string): boolean {
  return /^(select|with)\b/i.test(content.trim());
}

function inferParameterType(name: string): SqlEditorParameter['dataType'] {
  if (/timestamp|datetime|created_at|updated_at/i.test(name)) return 'datetime';
  if (/date|day|month|year/i.test(name)) return 'date';
  if (/is_|has_|active|enabled|flag/i.test(name)) return 'boolean';
  if (/count|amount|sales|revenue|total|id/i.test(name)) return 'number';
  return 'string';
}

function inferredDateRole(name: string, dataType: SqlEditorParameter['dataType']): SqlEditorParameter['dateRole'] {
  if (dataType !== 'date' && dataType !== 'datetime') return 'none';
  if (/^(to|end|end_date|to_date)$/i.test(name)) return 'end';
  if (/^(as_of|asof)$/i.test(name)) return 'as_of';
  return 'start';
}

function extractSelectedColumns(query: string): string[] {
  const match = /select\s+(.+?)\s+from/i.exec(query);
  if (!match?.[1]) return [];
  if (match[1].trim() === '*') return ['*'];
  return match[1].split(',').map(column =>
    column.trim().replace(/^.*\./, '').replace(/\s+as\s+.*$/i, '').trim()
  );
}

function inferFieldTypeFromRows(rows: Array<Record<string, unknown>>, columnName: string): string {
  const sample = rows.map(row => row[columnName]).find(value => value !== null && value !== undefined && value !== '');
  if (sample === undefined) return 'string';
  if (typeof sample === 'number') return 'number';
  if (typeof sample === 'boolean') return 'boolean';
  if (sample instanceof Date) return 'date';
  const text = String(sample);
  if (/^-?\d+(\.\d+)?$/.test(text)) return 'number';
  if (/^\d{4}-\d{2}-\d{2}(?:$|[tT\s])/.test(text)) return 'date';
  return 'string';
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
