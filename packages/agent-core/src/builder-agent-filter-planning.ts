import type {
  AgentDataField,
  AgentDataModel,
  FieldEncoding,
  VisualizationSpec
} from '@intraq/contracts';

export type FilterPlanningRole = FieldEncoding['role'] | 'identifier';

export interface FilterPlanningField {
  field: AgentDataField;
  metadata: Record<string, unknown>;
  role: FilterPlanningRole;
}

export function createFilterVisualizationSpec(input: {
  fields: FilterPlanningField[];
  model: AgentDataModel;
  prompt: string;
  routing: Record<string, unknown>;
  title: string;
}): VisualizationSpec | null {
  const filterField = filterFieldForModel(input.prompt, input.fields, input.routing);
  if (!filterField) return null;
  return {
    id: `viz-${slugify(input.model.id || input.model.name)}-filter`,
    schemaVersion: 1,
    kind: 'filter',
    title: input.title,
    description: readString(input.model.dictionary?.description) ?? input.model.description ?? `${input.title} filter`,
    dataRef: { tableId: input.model.id, tableName: input.model.name },
    encodings: [filterEncodingFromField(filterField)],
    interactions: { tooltip: false, legend: false, crossFilter: true, drilldown: false },
    accessibility: {
      label: `${input.title} filter`,
      summary: `${input.title} dashboard filter generated from model context.`
    },
    rendererHints: { requiredCapabilities: ['cross-filter'], fallback: 'text' }
  };
}

export function filterFieldNameFromPlan(input: {
  fallbackVisualDimension?: string | null | undefined;
  fields: FilterPlanningField[];
  prompt: string;
  routing: Record<string, unknown>;
}): string | null {
  const configuredFilter = readStringArray(input.routing.filterFields)[0];
  if (configuredFilter) return configuredFilter;
  const promptedField = filterFieldForModel(input.prompt, input.fields, {});
  if (promptedField) return promptedField.field.name;
  if (input.fallbackVisualDimension) return input.fallbackVisualDimension;
  return input.fields.find(field => field.role === 'dimension')?.field.name
    ?? input.fields.find(field => field.role === 'time')?.field.name
    ?? null;
}

function filterFieldForModel(
  prompt: string,
  fields: FilterPlanningField[],
  routing: Record<string, unknown>
): FilterPlanningField | null {
  const configuredFilter = readStringArray(routing.filterFields)[0];
  if (configuredFilter) {
    const match = fields.find(field => field.field.name === configuredFilter);
    if (match && match.role !== 'measure') return match;
  }
  const normalizedPrompt = normalizeText(prompt);
  const promptedField = fields.find(field => {
    const labels = [
      field.field.name,
      field.field.description,
      field.field.dictionaryDescription,
      readString(field.metadata.label),
      readString(field.metadata.businessName)
    ].filter(Boolean).map(value => normalizeText(String(value)));
    return labels.some(label => label && normalizedPrompt.includes(label));
  });
  if (promptedField && promptedField.role !== 'measure') return promptedField;
  return fields.find(field => field.role === 'dimension')
    ?? fields.find(field => field.role === 'time')
    ?? null;
}

function filterEncodingFromField(field: FilterPlanningField): FieldEncoding {
  return {
    field: field.field.name,
    label: readString(field.metadata.label) ?? readString(field.metadata.businessName) ?? toLabel(field.field.name),
    role: field.role === 'time' ? 'time' : 'dimension',
    ...(field.role === 'time' ? { format: 'date' as const } : {})
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function normalizeText(value: string): string {
  return splitWords(value.toLowerCase().replaceAll('_', ' ')).join(' ');
}

function slugify(value: string): string {
  return normalizeText(value).replaceAll(' ', '-') || 'dashboard-element';
}

function toLabel(value: string): string {
  return splitWords(value).map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
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
