import type {
  AgentDataModel,
  DashboardComponentType,
  FieldEncoding,
  VisualizationKind,
  VisualizationSpec
} from '@intraq/contracts';
import {
  createFilterVisualizationSpec
} from './builder-agent-filter-planning.js';
import { visualizationKindFromRouting } from './builder-agent-visualization-routing.js';
import {
  aggregationFor,
  fieldLabel,
  formatFor,
  routingMetadata,
  modelFields
} from './builder-agent-model.js';
import type { FieldRole, ModelField } from './builder-agent-types.js';
import {
  normalizeText,
  readBoolean,
  readString,
  readStringArray,
  slugify,
  termScore,
  toLabel
} from './builder-agent-text.js';

export function createVisualizationSpecFromDataModel(
  prompt: string,
  model: AgentDataModel,
  requestedComponentType?: DashboardComponentType,
  requestedVisualizationKind?: VisualizationKind
): VisualizationSpec | null {
  const fields = modelFields(model).filter(field => field.hasModelContext);
  const routing = routingMetadata(model.dictionary);
  const kind = visualizationKindFromRouting(routing, requestedComponentType, requestedVisualizationKind);
  if (!kind) return null;
  const title = model.businessName ?? readString(model.dictionary?.businessName) ?? toLabel(model.name);
  if (kind === 'text') {
    const description = readString(model.dictionary?.description) ?? model.description ?? `${title} dashboard insight`;
    return {
      id: `viz-${slugify(model.id || model.name)}-text`,
      schemaVersion: 1,
      kind,
      title,
      description,
      encodings: [],
      interactions: { tooltip: false, legend: false, crossFilter: false, drilldown: false },
      accessibility: { label: `${title} dashboard insight`, summary: description },
      rendererHints: { requiredCapabilities: [], fallback: 'text' }
    };
  }
  const measures = fields.filter(field => field.role === 'measure');
  if (kind === 'filter') {
    return createFilterVisualizationSpec({ fields, model, prompt, routing, title });
  }
  if (measures.length === 0) return null;
  const selectedFields = kind === 'table' || kind === 'matrix'
    ? fieldsForTabularPrompt(prompt, fields)
    : [];
  const selectedMeasures = selectedFields.some(field => field.role === 'measure')
    ? selectedFields.filter(field => field.role === 'measure')
    : measuresForPrompt(prompt, measures);
  const dimension = kind === 'card' || selectedFields.length > 0
    ? null
    : dimensionForVisualization(prompt, fields, routing, kind);
  if (selectedMeasures.length === 0) return null;
  if (kind !== 'card' && selectedFields.length === 0 && !dimension) return null;
  const encodings = selectedFields.length > 0
    ? selectedFields.map(field => encodingFromModelField(field))
    : visualizationEncodings(dimension, selectedMeasures);

  return {
    id: `viz-${slugify(model.id || model.name)}`,
    schemaVersion: 1,
    kind,
    title,
    description: readString(model.dictionary?.description) ?? model.description ?? `${title} visualization`,
    dataRef: { tableId: model.id, tableName: model.name },
    encodings,
    interactions: {
      tooltip: true,
      legend: kind === 'pie',
      crossFilter: kind !== 'card',
      drilldown: readBoolean(routing.drilldown)
    },
    accessibility: {
      label: `${title} visualization`,
      summary: readString(routing.nanoCard) ?? readString(model.dictionary?.businessPurpose) ?? `${title} generated from model context.`
    },
    rendererHints: rendererHintsFor(kind)
  };
}

function visualizationEncodings(
  dimension: ModelField | null,
  selectedMeasures: ModelField[]
): FieldEncoding[] {
  const dimensionEncoding: FieldEncoding | null = dimension ? {
    field: dimension.field.name,
    label: fieldLabel(dimension),
    role: dimension.role === 'time' ? 'time' as const : 'dimension' as const,
    ...(dimension.role === 'time' ? { format: 'date' as const } : {})
  } : null;
  return [
    ...(dimensionEncoding ? [dimensionEncoding] : []),
    ...selectedMeasures.map(measureField => {
      const measureFormat = formatFor(measureField);
      return {
        field: measureField.field.name,
        label: fieldLabel(measureField),
        role: 'measure' as const,
        aggregation: aggregationFor(measureField),
        ...(measureFormat ? { format: measureFormat } : {})
      };
    })
  ];
}

function dimensionForVisualization(
  prompt: string,
  fields: ModelField[],
  routing: Record<string, unknown>,
  kind: VisualizationSpec['kind']
): ModelField | null {
  const routedTimeField = readString(routing.primaryTimeField);
  const routedTime = routedTimeField
    ? fields.find(field => field.field.name === routedTimeField && field.role === 'time')
    : undefined;
  const dimensions = fields.filter(field => field.role === 'time' || field.role === 'dimension');
  if (kind === 'line') {
    const timeDimensions = dimensions.filter(field => field.role === 'time');
    return bestFieldForPrompt(prompt, timeDimensions) ?? routedTime ?? null;
  }
  return bestFieldForPrompt(prompt, dimensions) ?? routedTime ?? dimensions.find(field => field.role === 'dimension') ?? null;
}

function bestFieldForPrompt(prompt: string, fields: ModelField[]): ModelField | null {
  const scored = fields.map((field, index) => ({ field, index, score: fieldScore(prompt, field) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = scored[0];
  return best && best.score > 0 ? best.field : null;
}

function measuresForPrompt(prompt: string, measures: ModelField[]): ModelField[] {
  const scored = measures.map((field, index) => ({ field, index, score: fieldScore(prompt, field) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const matches = scored.filter(item => item.score > 0);
  const best = matches[0];
  if (!best) return [];
  if (!isMultiMeasurePrompt(prompt)) return [best.field];
  const identityMatches = matches.filter(item => fieldIdentityScore(prompt, item.field) > 0);
  return (identityMatches.length > 0 ? identityMatches : [best])
    .map(item => item.field)
    .slice(0, 4);
}

function isMultiMeasurePrompt(prompt: string): boolean {
  const normalized = ` ${normalizeText(prompt)} `;
  return normalized.includes(' vs ')
    || normalized.includes(' versus ')
    || normalized.includes(' compare ')
    || normalized.includes(' compared ')
    || normalized.includes(' against ');
}

function fieldsForTabularPrompt(prompt: string, fields: ModelField[]): ModelField[] {
  const normalizedPrompt = normalizeText(prompt);
  const scored = fields
    .map((field, index) => ({ field, index, position: fieldPromptPosition(normalizedPrompt, field), score: fieldIdentityScore(prompt, field) }))
    .filter(item => item.score > 0)
    .sort((left, right) => roleOrder(left.field.role) - roleOrder(right.field.role)
      || left.position - right.position
      || right.score - left.score
      || left.index - right.index);
  return uniqueFields(scored.map(item => item.field)).slice(0, 8);
}

function fieldPromptPosition(normalizedPrompt: string, field: ModelField): number {
  const terms = [
    field.field.name,
    field.metadata.label,
    field.metadata.businessName,
    ...readStringArray(field.metadata.aliases),
    ...readStringArray(field.metadata.synonyms)
  ];
  const positions = terms.flatMap(term => {
    const normalizedTerm = normalizeText(String(term ?? ''));
    if (!normalizedTerm) return [];
    const index = normalizedPrompt.indexOf(normalizedTerm);
    if (index >= 0) return [index];
    return normalizedTerm
      .split(' ')
      .filter(token => token.length > 2)
      .flatMap(token => {
        const tokenIndex = normalizedPrompt.indexOf(token);
        return tokenIndex >= 0 ? [tokenIndex] : [];
      });
  });
  return positions.length > 0 ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
}

function roleOrder(role: FieldRole): number {
  if (role === 'time') return 0;
  if (role === 'dimension' || role === 'identifier') return 1;
  if (role === 'measure') return 2;
  return 3;
}

function encodingFromModelField(field: ModelField): FieldEncoding {
  const fieldFormat = formatFor(field);
  return {
    field: field.field.name,
    label: fieldLabel(field),
    role: field.role === 'measure' ? 'measure' : field.role === 'time' ? 'time' : 'dimension',
    ...(field.role === 'measure' ? { aggregation: aggregationFor(field) } : {}),
    ...(field.role === 'time' ? { format: 'date' as const } : {}),
    ...(field.role !== 'time' && fieldFormat ? { format: fieldFormat } : {})
  };
}

function uniqueFields(fields: ModelField[]): ModelField[] {
  const seen = new Set<string>();
  return fields.filter(field => {
    if (seen.has(field.field.name)) return false;
    seen.add(field.field.name);
    return true;
  });
}

function fieldScore(prompt: string, field: ModelField): number {
  const fieldRecord = field.field as unknown as Record<string, unknown>;
  const terms: unknown[] = [
    field.hasModelContext ? field.field.name : undefined,
    field.field.description,
    field.field.dictionaryDescription,
    fieldRecord.label,
    fieldRecord.businessName,
    fieldRecord.businessDefinition,
    field.metadata.label,
    field.metadata.businessName,
    field.metadata.businessDefinition,
    field.metadata.semanticType,
    field.metadata.metricType,
    ...readStringArray(fieldRecord.aliases),
    ...readStringArray(fieldRecord.synonyms),
    ...readStringArray(fieldRecord.sampleQuestions),
    ...readStringArray(field.metadata.aliases),
    ...readStringArray(field.metadata.synonyms),
    ...readStringArray(field.metadata.sampleQuestions)
  ];
  return terms.reduce<number>((score, term) => score + termScore(prompt, term), 0);
}

function fieldIdentityScore(prompt: string, field: ModelField): number {
  const fieldRecord = field.field as unknown as Record<string, unknown>;
  const terms: unknown[] = [
    field.field.name,
    fieldRecord.label,
    fieldRecord.businessName,
    field.metadata.label,
    field.metadata.businessName,
    ...readStringArray(fieldRecord.aliases),
    ...readStringArray(fieldRecord.synonyms),
    ...readStringArray(field.metadata.aliases),
    ...readStringArray(field.metadata.synonyms)
  ];
  return terms.reduce<number>((score, term) => score + termScore(prompt, term), 0);
}

function rendererHintsFor(kind: VisualizationSpec['kind']): NonNullable<VisualizationSpec['rendererHints']> {
  if (kind === 'card') {
    return { requiredCapabilities: ['single-value'], fallback: 'card' };
  }
  if (kind === 'table' || kind === 'matrix') {
    return { requiredCapabilities: ['tabular'], fallback: 'table' };
  }
  if (kind === 'pie') {
    return { requiredCapabilities: ['categorical', 'legend', 'tooltip'], fallback: 'table' };
  }
  return { requiredCapabilities: ['cartesian', 'tooltip'], fallback: 'table' };
}
