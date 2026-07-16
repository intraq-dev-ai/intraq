import type { AgentDataField, AgentDataModel, FieldEncoding } from '@intraq/contracts';
import type { FieldRole, ModelField } from './builder-agent-types.js';
import {
  isRecord,
  listScore,
  readString,
  readStringArray,
  termScore,
  toLabel
} from './builder-agent-text.js';

export function selectDataModel(prompt: string, models: AgentDataModel[]): AgentDataModel | null {
  const scored = models.map((model, index) => ({ model, index, score: modelScore(prompt, model) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = scored[0];
  return best && best.score > 0 ? best.model : null;
}

export function modelFields(model: AgentDataModel): ModelField[] {
  return model.fields.map(field => {
    const metadata = fieldMetadata(model.dictionary, field.name);
    return { field, hasModelContext: hasFieldModelContext(field, metadata), metadata, role: fieldRole(field, metadata) };
  });
}

export function routingMetadata(dictionary: Record<string, unknown> | undefined): Record<string, unknown> {
  const ai = isRecord(dictionary?.ai) ? dictionary.ai : {};
  if (isRecord(ai.routing)) return ai.routing;
  if (isRecord(dictionary?.routing)) return dictionary.routing;
  return {};
}

export function aggregationFor(field: ModelField): NonNullable<FieldEncoding['aggregation']> {
  const aggregation = readString(field.metadata.aggregation) ?? readString(field.metadata.defaultAggregation);
  if (
    aggregation === 'sum' ||
    aggregation === 'avg' ||
    aggregation === 'min' ||
    aggregation === 'max' ||
    aggregation === 'count' ||
    aggregation === 'countDistinct'
  ) {
    return aggregation;
  }
  return 'sum';
}

export function formatFor(field: ModelField): FieldEncoding['format'] {
  const format = readString(field.metadata.format) ?? readString(field.metadata.valueFormat) ?? readString(field.metadata.unit);
  if (format === 'currency' || format === 'number' || format === 'percentage' || format === 'date' || format === 'duration') return format;
  return field.field.type === 'number' ? 'number' : undefined;
}

export function fieldLabel(field: ModelField): string {
  return readString(field.metadata.label)
    ?? readString(field.metadata.businessName)
    ?? readString(field.metadata.displayName)
    ?? toLabel(field.field.name);
}

function modelScore(prompt: string, model: AgentDataModel): number {
  const dictionary = model.dictionary ?? {};
  const routing = routingMetadata(dictionary);
  const terms: unknown[] = [
    model.businessName,
    model.name,
    model.description,
    dictionary.businessName,
    dictionary.businessPurpose,
    dictionary.description,
    routing.domain,
    routing.grain,
    routing.nanoCard,
    ...readStringArray(dictionary.sampleQuestions),
    ...readStringArray(isRecord(dictionary.ai) ? dictionary.ai.sampleQuestions : undefined),
    ...readStringArray(routing.triggerKeywords),
    ...readStringArray(routing.useFor),
    ...readStringArray(routing.exampleQuestions),
    ...model.fields.flatMap(field => [
      field.description,
      field.dictionaryDescription,
      fieldMetadata(model.dictionary, field.name).label,
      fieldMetadata(model.dictionary, field.name).businessName,
      ...readStringArray(fieldMetadata(model.dictionary, field.name).aliases),
      ...readStringArray(fieldMetadata(model.dictionary, field.name).synonyms)
    ])
  ];
  const exclusions: unknown[] = [
    dictionary.notFor,
    isRecord(dictionary.ai) ? dictionary.ai.notFor : undefined,
    routing.notFor
  ];
  const positiveScore = terms.reduce<number>((score, term) => score + termScore(prompt, term), 0);
  const exclusionScore = exclusions.reduce<number>((score, term) => score + listScore(prompt, term), 0);
  return positiveScore - (exclusionScore * 3);
}

function hasFieldModelContext(field: AgentDataField, metadata: Record<string, unknown>): boolean {
  const fieldRecord = field as unknown as Record<string, unknown>;
  const terms: unknown[] = [
    field.description,
    field.dictionaryDescription,
    fieldRecord.label,
    fieldRecord.businessName,
    fieldRecord.businessDefinition,
    fieldRecord.semanticType,
    fieldRecord.metricType,
    fieldRecord.columnType,
    fieldRecord.role,
    fieldRecord.semanticRole,
    metadata.label,
    metadata.businessName,
    metadata.businessDefinition,
    metadata.semanticType,
    metadata.metricType,
    metadata.columnType,
    metadata.role,
    metadata.semanticRole,
    ...readStringArray(fieldRecord.aliases),
    ...readStringArray(fieldRecord.synonyms),
    ...readStringArray(fieldRecord.sampleQuestions),
    ...readStringArray(metadata.aliases),
    ...readStringArray(metadata.synonyms),
    ...readStringArray(metadata.sampleQuestions)
  ];
  return terms.some(term => readString(term) !== null);
}

function fieldRole(field: AgentDataField, metadata: Record<string, unknown>): FieldRole {
  const fieldRecord = field as unknown as Record<string, unknown>;
  const explicit = readString(metadata.columnType)
    ?? readString(metadata.role)
    ?? readString(metadata.semanticRole)
    ?? readString(fieldRecord.columnType)
    ?? readString(fieldRecord.role)
    ?? readString(fieldRecord.semanticRole);
  if (explicit === 'measure' || explicit === 'metric') return 'measure';
  if (explicit === 'time' || explicit === 'date') return 'time';
  if (explicit === 'identifier') return 'identifier';
  if ((field.type === 'date' || field.type === 'datetime' || field.type === 'timestamp')
    && (explicit === 'dimension' || explicit === 'filter')) return 'time';
  if (explicit === 'dimension' || explicit === 'filter') return 'dimension';
  if (field.type === 'number') return 'measure';
  if (field.type === 'date' || field.type === 'datetime' || field.type === 'timestamp') return 'time';
  return 'dimension';
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
