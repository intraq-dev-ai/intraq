import type { AdminDataSourceTable } from './types';

export type BulkDictionaryPayload = Record<string, Record<string, unknown>>;

export interface BulkDictionaryPreviewRow {
  businessName: string;
  category: string;
  fieldCount: number;
  isKnownTable: boolean;
  sampleQuestionCount: number;
  tableName: string;
}

export interface BulkDictionaryUploadResult {
  message: string;
  skipped: string[];
  updated: number;
}

export function parseBulkDictionaryJson(text: string): BulkDictionaryPayload {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Dictionary JSON is required.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error('Dictionary JSON could not be parsed.');
  }

  return normalizeBulkDictionaryPayload(parsed);
}

export function normalizeBulkDictionaryPayload(value: unknown): BulkDictionaryPayload {
  if (!isRecord(value)) {
    throw new Error('Dictionary JSON must be an object keyed by table name.');
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error('Dictionary JSON must include at least one table.');
  }

  const payload: BulkDictionaryPayload = {};
  for (const [key, dictionary] of entries) {
    const tableName = key.trim();
    if (!tableName) throw new Error('Every table entry must have a table name.');
    if (!isRecord(dictionary)) {
      throw new Error(`Dictionary entry for ${tableName} must be an object.`);
    }
    payload[tableName] = { ...dictionary };
  }

  return payload;
}

export function buildBulkDictionaryPreviewRows(
  payload: BulkDictionaryPayload,
  tables: AdminDataSourceTable[]
): BulkDictionaryPreviewRow[] {
  const knownTables = new Set(tables.flatMap(table => [table.id, table.name]));
  return Object.entries(payload).map(([tableName, dictionary]) => ({
    tableName,
    businessName: readString(dictionary.businessName) ?? tableName,
    category: readString(dictionary.category) ?? 'Uncategorized',
    fieldCount: readFieldCount(dictionary),
    sampleQuestionCount: readArrayLength(dictionary.sampleQuestions),
    isKnownTable: knownTables.has(tableName)
  }));
}

export function normalizeBulkDictionaryUploadResult(value: unknown): BulkDictionaryUploadResult {
  if (!isRecord(value)) {
    return { message: 'Bulk dictionary upload completed.', skipped: [], updated: 0 };
  }

  const results = isRecord(value.results) ? value.results : {};
  const updated = readNumber(results.updated) ?? 0;
  const skipped = readStringArray(results.skipped);
  return {
    message: readString(value.message) ?? `Updated ${updated} table dictionary${updated === 1 ? '' : ' entries'}.`,
    skipped,
    updated
  };
}

export function buildBulkDictionaryTemplate(tables: AdminDataSourceTable[]): BulkDictionaryPayload {
  const sourceTables = tables.length > 0 ? tables.slice(0, 2) : [
    { name: 'example_table', fields: [{ name: 'column_name', type: 'string', description: '', dictionaryDescription: '' }] }
  ];

  return Object.fromEntries(sourceTables.map(table => [
    table.name,
    {
      businessName: toTitle(table.name),
      category: 'Operations',
      sampleQuestions: [`Show ${toTitle(table.name)} trend`],
      columns: table.fields.slice(0, 4).map(field => ({
        name: field.name,
        description: field.description || `${toTitle(field.name)} column`,
        dictionaryDescription: field.dictionaryDescription || `${toTitle(field.name)} business definition`
      }))
    }
  ]));
}

function readFieldCount(dictionary: Record<string, unknown>): number {
  return readArrayLength(dictionary.columns) || readArrayLength(dictionary.fields);
}

function readArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const text = readString(item);
    return text ? [text] : [];
  });
}

function toTitle(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
