import type { FieldDefinition, TableDefinition } from '../data-source/foundation-store.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';

export function analyzerTokensFromText(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const character of value.toLowerCase()) {
    if (isAnalyzerTokenCharacter(character)) {
      current += character;
    } else if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) tokens.push(current);
  return uniqueStrings(tokens.map(canonicalAnalyzerToken));
}

export function analyzerFieldTokens(table: TableDefinition, field: FieldDefinition): string[] {
  const metadata = analyzerFieldMetadata(table, field.name);
  return analyzerTokensFromUnknown([
    field.name,
    field.description,
    field.dictionaryDescription,
    metadata.name,
    metadata.businessName,
    metadata.label,
    metadata.aliases,
    metadata.synonyms,
    metadata.role,
    metadata.columnType,
    metadata.semanticRole,
    metadata.metricType,
    metadata.description,
    metadata.businessDefinition,
    metadata.format,
    metadata.unit,
    metadata.sampleQuestions,
    metadata.valueAliases,
    metadata.valueConcepts,
    metadata.valueGroups
  ]);
}

export function analyzerFieldValueTokens(table: TableDefinition, fieldName: string): string[] {
  return analyzerTokensFromUnknown(table.sampleRows?.map(row => row[fieldName]) ?? []);
}

export function analyzerQuestionMentionsField(
  question: string,
  table: TableDefinition,
  field: FieldDefinition
): boolean {
  const questionTokens = new Set(analyzerTokensFromText(question));
  const conceptTokens = [
    ...analyzerFieldTokens(table, field),
    ...analyzerFieldValueTokens(table, field.name)
  ];
  return conceptTokens.some(token => questionTokens.has(token));
}

export function analyzerFieldMetadata(table: TableDefinition, fieldName: string): Record<string, unknown> {
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const sources = [dictionary.columns, dictionary.fields, ai.columns, ai.fields];
  for (const source of sources) {
    const metadata = metadataFromSource(source, fieldName);
    if (metadata) return metadata;
  }
  return {};
}

export function analyzerFieldIsDimension(table: TableDefinition, field: FieldDefinition): boolean {
  if (field.type === 'date' || field.type === 'string') return true;
  const metadata = analyzerFieldMetadata(table, field.name);
  const semanticValues = readStringArray([
    metadata.role,
    metadata.columnType,
    metadata.semanticRole,
    metadata.metricType
  ]);
  return semanticValues.some(value => {
    const normalized = value.toLowerCase();
    return normalized === 'dimension' || normalized === 'time' || normalized === 'date';
  });
}

export function analyzerFieldIsMeasure(table: TableDefinition, field: FieldDefinition): boolean {
  if (isBooleanAnalyzerFieldType(field.type)) return false;
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
    const normalized = value.toLowerCase();
    return normalized === 'dimension'
      || normalized === 'time'
      || normalized === 'date'
      || normalized === 'foreign_key'
      || normalized === 'identifier'
      || normalized === 'join key'
      || normalized === 'join_key'
      || normalized === 'primary_key';
  })) {
    return false;
  }
  if (semanticValues.some(value => {
    const normalized = value.toLowerCase();
    return normalized === 'measure' || normalized === 'metric';
  })) {
    return true;
  }
  return isNumericAnalyzerFieldType(field.type);
}

export function analyzerTokensFromUnknown(value: unknown): string[] {
  return uniqueStrings(stringsFromUnknown(value).flatMap(analyzerTokensFromText));
}

function metadataFromSource(source: unknown, fieldName: string): Record<string, unknown> | null {
  if (Array.isArray(source)) {
    const match = source.find(item => isRecord(item) && readString(item.name) === fieldName);
    return isRecord(match) ? match : null;
  }
  if (isRecord(source) && isRecord(source[fieldName])) return source[fieldName];
  return null;
}

function stringsFromUnknown(value: unknown): string[] {
  const directString = readString(value);
  if (directString) return [directString];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(stringsFromUnknown);
}

function isAnalyzerTokenCharacter(character: string): boolean {
  return character >= 'a' && character <= 'z' || character >= '0' && character <= '9';
}

function canonicalAnalyzerToken(token: string): string {
  if (token === 'avg') return 'average';
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('oss')) return token;
  if (token.length > 4 && token.endsWith('ss')) return token;
  if (token.length > 5 && token.endsWith('tions')) return token.slice(0, -1);
  if (
    token.length > 5
    && (token.endsWith('ches') || token.endsWith('shes') || token.endsWith('xes') || token.endsWith('zes'))
  ) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function isNumericAnalyzerFieldType(value: string): boolean {
  return [
    'bigint',
    'decimal',
    'double',
    'float',
    'int',
    'integer',
    'number',
    'numeric',
    'smallint'
  ].includes(value.trim().toLowerCase());
}

function isBooleanAnalyzerFieldType(value: string): boolean {
  return ['bit', 'bool', 'boolean'].includes(value.trim().toLowerCase());
}
