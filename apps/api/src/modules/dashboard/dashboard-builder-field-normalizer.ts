import type {
  AgentDataField,
  AgentDataModel,
  BuilderAgentRequest
} from '@intraq/contracts';

interface FieldCandidate {
  field: AgentDataField;
  metadata: Record<string, unknown>;
}

export function normalizeDashboardBuilderFieldName(
  request: BuilderAgentRequest,
  value: string | null | undefined
): string | undefined {
  const term = readString(value);
  if (!term) return undefined;
  const referenceMatch = referenceFieldName(request, term);
  if (referenceMatch) return referenceMatch;
  const modelMatch = dataModelFieldName(request.dataModel, term);
  return modelMatch ?? term;
}

export function normalizeDashboardBuilderFieldNames(
  request: BuilderAgentRequest,
  values: string[]
): string[] {
  return values.map(value => normalizeDashboardBuilderFieldName(request, value) ?? value);
}

function referenceFieldName(request: BuilderAgentRequest, value: string): string | undefined {
  const normalized = normalizeFieldReference(value);
  return request.fieldReferences?.find(reference =>
    normalizeFieldReference(reference.field) === normalized
    || normalizeFieldReference(reference.token) === normalized
    || normalizeFieldReference(reference.label) === normalized
  )?.field;
}

function dataModelFieldName(model: AgentDataModel | undefined, value: string): string | undefined {
  if (!model) return undefined;
  const normalized = normalizeFieldReference(value);
  const candidates = model.fields
    .map(field => ({ field, metadata: fieldMetadata(model.dictionary, field.name) }))
    .filter(candidate => fieldTerms(candidate).some(term => normalizeFieldReference(term) === normalized));
  const candidate = candidates[0];
  return candidates.length === 1 && candidate ? candidate.field.name : undefined;
}

function fieldTerms(candidate: FieldCandidate): string[] {
  const record = candidate.field as unknown as Record<string, unknown>;
  return [
    candidate.field.name,
    candidate.field.description,
    candidate.field.dictionaryDescription,
    record.label,
    record.businessName,
    candidate.metadata.label,
    candidate.metadata.businessName,
    candidate.metadata.displayName,
    ...readStringArray(record.aliases),
    ...readStringArray(record.synonyms),
    ...readStringArray(candidate.metadata.aliases),
    ...readStringArray(candidate.metadata.synonyms)
  ].flatMap(term => {
    const item = readString(term);
    return item ? [item] : [];
  });
}

function normalizeFieldReference(value: unknown): string {
  const raw = readString(value);
  if (!raw) return '';
  const withoutMention = raw.startsWith('@') ? raw.slice(1) : raw;
  return splitWords(withoutMention.replaceAll('_', ' ')).join(' ');
}

function fieldMetadata(dictionary: Record<string, unknown> | undefined, fieldName: string): Record<string, unknown> {
  const sources = [
    dictionary?.columns,
    dictionary?.fields,
    isRecord(dictionary?.ai) ? dictionary.ai.columns : undefined,
    isRecord(dictionary?.ai) ? dictionary.ai.fields : undefined
  ];
  for (const source of sources) {
    const match = metadataFromSource(source, fieldName);
    if (match) return match;
  }
  return {};
}

function metadataFromSource(source: unknown, fieldName: string): Record<string, unknown> | null {
  if (Array.isArray(source)) {
    return source.find(item => isRecord(item) && item.name === fieldName) as Record<string, unknown> | undefined ?? null;
  }
  if (isRecord(source) && isRecord(source[fieldName])) return source[fieldName] as Record<string, unknown>;
  return null;
}

function splitWords(value: string): string[] {
  const words: string[] = [];
  let current = '';
  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLower = code >= 97 && code <= 122;
    if (isDigit || isLower) {
      current += char;
    } else if (current) {
      words.push(current);
      current = '';
    }
  }
  if (current) words.push(current);
  return words;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
