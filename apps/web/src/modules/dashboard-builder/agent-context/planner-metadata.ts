import type {
  BuilderDataField,
  BuilderDataTable
} from '../types';

export type FieldRole = 'dimension' | 'filter' | 'measure' | 'time' | 'unknown';

export interface FieldCandidate {
  field: BuilderDataField;
  metadata: Record<string, unknown>;
  role: FieldRole;
}

export function candidateForField(
  table: BuilderDataTable | null,
  field: BuilderDataField | undefined
): FieldCandidate[] {
  if (!field) return [];
  const metadata = fieldMetadata(table, field.name);
  return [{ field, metadata, role: fieldRole(table, field) }];
}

export function fieldRole(
  table: BuilderDataTable | null,
  field: BuilderDataField
): FieldRole {
  const metadata = fieldMetadata(table, field.name);
  const explicit = readString(metadata.columnType)
    ?? readString(metadata.role)
    ?? readString(metadata.semanticRole)
    ?? field.columnType
    ?? field.role
    ?? field.semanticRole;
  if (explicit === 'time' || explicit === 'date') return 'time';
  if (explicit === 'measure' || explicit === 'metric') return 'measure';
  if (explicit === 'filter') return 'filter';
  if (explicit === 'dimension' || explicit === 'attribute') return 'dimension';
  if (field.type === 'date' || field.type === 'datetime' || field.type === 'timestamp') return 'time';
  if (field.type === 'number' || field.type === 'integer' || field.type === 'decimal') return 'measure';
  if (field.type === 'string' || field.type === 'boolean') return 'dimension';
  return 'unknown';
}

export function fieldMetadata(table: BuilderDataTable | null, fieldName: string): Record<string, unknown> {
  const dictionary = table?.dictionary;
  const candidates = [
    dictionary?.fields,
    dictionary?.columns,
    dictionary?.ai?.fields,
    dictionary?.ai?.columns
  ];
  for (const candidate of candidates) {
    const metadata = metadataFromCollection(candidate, fieldName);
    if (metadata) return metadata;
  }
  const field = table?.fields.find(item => item.name === fieldName);
  return field ? { ...field } : {};
}

export function fieldTermsFromMetadata(metadata: Record<string, unknown>): string[] {
  return [
    readString(metadata.label),
    readString(metadata.businessName),
    readString(metadata.description),
    readString(metadata.dictionaryDescription),
    ...readStringArray(metadata.aliases),
    ...readStringArray(metadata.synonyms),
    ...readStringArray(metadata.sampleQuestions)
  ].filter((value): value is string => Boolean(value));
}

export function routingMetadata(table: BuilderDataTable | null): Record<string, unknown> {
  const dictionary = table?.dictionary;
  if (isRecord(dictionary?.ai?.routing)) return dictionary.ai.routing;
  if (isRecord(dictionary?.routing)) return dictionary.routing;
  return {};
}

export function readBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function metadataFromCollection(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const match = value.find(item => isRecord(item) && readString(item.name) === fieldName);
    return isRecord(match) ? match : null;
  }
  if (isRecord(value) && isRecord(value[fieldName])) return value[fieldName] as Record<string, unknown>;
  return null;
}
