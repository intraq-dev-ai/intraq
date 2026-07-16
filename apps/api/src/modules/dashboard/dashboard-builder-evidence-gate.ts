import type {
  AgentDataField,
  AgentDataModel,
  BuilderAgentRequest,
  FieldEncoding,
  VisualizationKind
} from '@intraq/contracts';

type EvidenceFieldRole = FieldEncoding['role'] | 'identifier';

interface EvidenceField {
  aggregation?: FieldEncoding['aggregation'];
  aliases?: string[];
  field: string;
  format?: FieldEncoding['format'];
  label: string;
  role: EvidenceFieldRole;
}

interface DashboardBuilderEvidenceGate {
  fields: EvidenceField[];
  model: {
    businessName?: string;
    description?: string;
    id: string;
    name: string;
  } | null;
  readiness: {
    aiReady: boolean;
    hasSelectedModel: boolean;
    reason?: string;
  };
  recommendedVisualizations: VisualizationKind[];
  suggestedActions: string[];
}

export function buildDashboardBuilderEvidenceGate(request: BuilderAgentRequest): DashboardBuilderEvidenceGate {
  const model = request.dataModel;
  const fields = model ? evidenceFields(model) : [];
  const recommendedVisualizations = model ? recommendedVisualizationsFromModel(model) : [];
  const readiness = evidenceReadiness(model, fields);
  return {
    fields,
    model: model ? {
      id: model.id,
      name: model.name,
      ...(model.businessName ? { businessName: model.businessName } : {}),
      ...(model.description ? { description: model.description } : {})
    } : null,
    readiness,
    recommendedVisualizations,
    suggestedActions: suggestedDashboardBuilderActions(request, model, fields, readiness)
  };
}

export function suggestedDashboardBuilderActionsForRequest(request: BuilderAgentRequest): string[] {
  return buildDashboardBuilderEvidenceGate(request).suggestedActions;
}

function evidenceReadiness(
  model: AgentDataModel | undefined,
  fields: EvidenceField[]
): DashboardBuilderEvidenceGate['readiness'] {
  if (!model) {
    return {
      aiReady: false,
      hasSelectedModel: false,
      reason: 'Select a data model with model details before asking Dashboard AI to create or change components.'
    };
  }
  if (fields.length === 0) {
    return {
      aiReady: false,
      hasSelectedModel: true,
      reason: 'The selected data model does not include enough model details for Dashboard AI.'
    };
  }
  return {
    aiReady: true,
    hasSelectedModel: true
  };
}

function evidenceFields(model: AgentDataModel): EvidenceField[] {
  return model.fields.flatMap(field => {
    const metadata = fieldMetadata(model.dictionary, field.name);
    if (!hasFieldModelContext(field, metadata)) return [];
    const role = fieldRole(field, metadata);
    return [{
      field: field.name,
      label: fieldLabel(field, metadata),
      role,
      ...(fieldAliases(field, metadata).length > 0 ? { aliases: fieldAliases(field, metadata) } : {}),
      ...(role === 'measure' ? { aggregation: aggregationFor(metadata) } : {}),
      ...(formatFor(field, metadata) ? { format: formatFor(field, metadata) } : {})
    }];
  });
}

function fieldAliases(field: AgentDataField, metadata: Record<string, unknown>): string[] {
  const fieldRecord = field as unknown as Record<string, unknown>;
  return uniqueStrings([
    ...readStringArray(fieldRecord.aliases),
    ...readStringArray(fieldRecord.synonyms),
    ...readStringArray(metadata.aliases),
    ...readStringArray(metadata.synonyms)
  ]);
}

function suggestedDashboardBuilderActions(
  request: BuilderAgentRequest,
  model: AgentDataModel | undefined,
  fields: EvidenceField[],
  readiness: DashboardBuilderEvidenceGate['readiness']
): string[] {
  if (isSelectedComponentUpdateRequest(request)) {
    return suggestedSelectedComponentActions(request, fields, readiness);
  }
  if (!readiness.aiReady) return [readiness.reason ?? 'Select a data model.'];
  const modelLabel = modelLabelFor(model);
  const measure = fields.find(field => field.role === 'measure');
  const breakdown = fields.find(field => field.role === 'time')
    ?? fields.find(field => field.role === 'dimension');
  return [
    measure ? `Create a KPI card for ${measure.label}` : '',
    measure && breakdown ? `Show ${measure.label} by ${breakdown.label}` : '',
    modelLabel ? `Build a table for ${modelLabel}` : ''
  ].filter(Boolean);
}

function suggestedSelectedComponentActions(
  request: BuilderAgentRequest,
  fields: EvidenceField[],
  readiness: DashboardBuilderEvidenceGate['readiness']
): string[] {
  const component = selectedComponentLabel(request);
  const measure = fields.find(field => field.role === 'measure');
  const breakdown = fields.find(field => field.role === 'time')
    ?? fields.find(field => field.role === 'dimension');
  return [
    `Rename selected ${component}`,
    request.componentType === 'chart' || request.componentType === 'pie'
      ? `Change selected ${component} to a bar chart`
      : `Update selected ${component} formatting`,
    readiness.aiReady && measure && breakdown
      ? `Remap selected ${component} to ${measure.label} by ${breakdown.label}`
      : `Update selected ${component} fields`
  ];
}

function selectedComponentLabel(request: BuilderAgentRequest): string {
  if (request.componentType === 'card') return 'card';
  if (request.componentType === 'table') return 'table';
  if (request.componentType === 'matrix') return 'matrix';
  if (request.componentType === 'filter') return 'filter';
  return 'chart';
}

function isSelectedComponentUpdateRequest(request: BuilderAgentRequest): boolean {
  return request.mode === 'update' && Boolean(request.elementId);
}

function recommendedVisualizationsFromModel(model: AgentDataModel): VisualizationKind[] {
  const routing = routingMetadata(model.dictionary);
  return readStringArray(routing.recommendedVisualizations).filter(isVisualizationKind);
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
    metadata.description,
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

function fieldRole(field: AgentDataField, metadata: Record<string, unknown>): EvidenceFieldRole {
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

function fieldLabel(field: AgentDataField, metadata: Record<string, unknown>): string {
  return readString(metadata.label)
    ?? readString(metadata.businessName)
    ?? readString(metadata.displayName)
    ?? toLabel(field.name);
}

function aggregationFor(metadata: Record<string, unknown>): NonNullable<FieldEncoding['aggregation']> {
  const aggregation = readString(metadata.aggregation) ?? readString(metadata.defaultAggregation);
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

function formatFor(field: AgentDataField, metadata: Record<string, unknown>): FieldEncoding['format'] {
  const format = readString(metadata.format) ?? readString(metadata.valueFormat) ?? readString(metadata.unit);
  if (format === 'currency' || format === 'number' || format === 'percentage' || format === 'date' || format === 'duration') return format;
  return field.type === 'number' ? 'number' : undefined;
}

function routingMetadata(dictionary: Record<string, unknown> | undefined): Record<string, unknown> {
  const ai = isRecord(dictionary?.ai) ? dictionary.ai : {};
  if (isRecord(ai.routing)) return ai.routing;
  if (isRecord(dictionary?.routing)) return dictionary.routing;
  return {};
}

function isVisualizationKind(value: string): value is VisualizationKind {
  return value === 'bar' || value === 'line' || value === 'pie' || value === 'table' || value === 'card' || value === 'matrix' || value === 'filter';
}

function modelLabelFor(model: AgentDataModel | undefined): string {
  return model?.businessName
    ?? readString(model?.dictionary?.businessName)
    ?? (model ? toLabel(model.name) : '');
}

function toLabel(value: string): string {
  return splitWords(value).map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
}

function splitWords(value: string): string[] {
  const words: string[] = [];
  let current = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLower = code >= 97 && code <= 122;
    const isUpper = code >= 65 && code <= 90;
    if (isDigit || isLower || isUpper) {
      current += char.toLowerCase();
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
