import type {
  BuilderDataField,
  BuilderDataSource,
  BuilderDataTable,
  DashboardAgentMessage,
  DataModelRecommendation
} from '../types';
import { isDashboardAiReadyDataModel } from '../agent-context/ai-ready-data-model';

export function dashboardGreetingMessage(
  source: BuilderDataSource | null,
  table: BuilderDataTable | null,
  recommendation: DataModelRecommendation | null
): Omit<DashboardAgentMessage, 'id'> {
  const modelName = table?.dictionary?.businessName ?? table?.name ?? recommendation?.subjectArea;
  const context = modelName && modelName !== 'Clarification needed'
    ? `I am connected to #${modelName}.`
    : source
      ? `I am connected to ${source.name}; choose a data model when you want me to create a component.`
      : 'Choose a data source when you want me to create a component.';
  return {
    role: 'assistant',
    kind: 'welcome',
    title: 'Dashboard AI ready',
    body: `Hi. ${context} Tell me what you want to see and I will build it from the selected model.`,
    details: [
      ...(source ? [`Data source: ${source.name}`] : []),
      ...evidenceDetails(table, recommendation)
    ].filter(Boolean)
  };
}

export function clarificationMessage(
  body: string,
  table: BuilderDataTable | null,
  recommendation: DataModelRecommendation | null
): Omit<DashboardAgentMessage, 'id'> {
  const modelName = table?.dictionary?.businessName ?? table?.name ?? recommendation?.subjectArea;
  const isIncompleteModelContext = body.toLowerCase().includes('model details are incomplete');
  return {
    role: 'assistant',
    kind: 'model_context',
    title: isIncompleteModelContext ? 'AI metadata is incomplete' : 'Model context needed',
    body: customerFacingDashboardAgentText(body),
    details: [
      modelName && modelName !== 'Clarification needed' ? `Candidate model: #${modelName}` : '',
      ...evidenceDetails(table, recommendation)
    ].filter(Boolean).map(customerFacingDashboardAgentText)
  };
}

export function modelContextIssue(
  source: { name: string } | null,
  table: BuilderDataTable | null,
  prompt: string
): string | null {
  if (!source) {
    return 'Choose a data source before asking Dashboard AI to create a component.';
  }
  if (!table) {
    return 'Add AI metadata to at least one data model before asking Dashboard AI to create a component.';
  }
  if (!isDashboardAiReadyDataModel(table)) {
    return `AI metadata is incomplete for #${table.dictionary?.businessName ?? table.name}. Add field definitions before using this model with Dashboard AI. Manual dashboard creation still works without AI.`;
  }
  if (table.fields.length === 0) return `#${table.dictionary?.businessName ?? table.name} does not have columns available for Dashboard AI to draft from.`;
  const documentedFields = table.fields.filter(field => hasFieldEvidence(table, field));
  if (!documentedFields.some(field => fieldRoleFromEvidence(table, field) === 'measure')) {
    return null;
  }
  return null;
}

export function evidenceDetails(
  table: BuilderDataTable | null,
  recommendation: DataModelRecommendation | null
): string[] {
  if (!table && !recommendation) return [];
  const fields = table?.fields.filter(field => hasFieldEvidence(table, field)) ?? [];
  const measures = fields.filter(field => fieldRoleFromEvidence(table, field) === 'measure');
  const dimensions = fields.filter(field => {
    const role = fieldRoleFromEvidence(table, field);
    return role === 'dimension' || role === 'time';
  });
  return [
    fields.length > 0 ? `${fields.length} dashboard field${fields.length === 1 ? '' : 's'} ready` : '',
    fieldDetail('Metrics I can use', measures.map(field => fieldLabel(table, field))),
    fieldDetail('Breakdowns I can use', dimensions.map(field => fieldLabel(table, field))),
    fieldDetail('Suggested metrics', recommendation?.measures),
    fieldDetail('Suggested filters', recommendation?.filters)
  ].filter(Boolean);
}

export function dashboardElementCreatedMessage(
  name: string,
  fieldLabels: string[] = [],
  componentType = 'component'
): Omit<DashboardAgentMessage, 'id'> {
  return {
    role: 'assistant',
    kind: 'plan',
    title: 'Added to dashboard',
    body: successBody('Added', name, fieldLabels),
    details: createFollowUpDetails('create', componentType)
  };
}

export function dashboardElementUpdatedMessage(
  name: string,
  fieldLabels: string[] = [],
  componentType = 'component'
): Omit<DashboardAgentMessage, 'id'> {
  return {
    role: 'assistant',
    kind: 'plan',
    title: 'Updated',
    body: successBody('Updated', name, fieldLabels),
    details: createFollowUpDetails('update', componentType)
  };
}

export function dashboardCreateProgressMessage(): Omit<DashboardAgentMessage, 'id'> {
  return progressMessage();
}

export function dashboardConversationProgressMessage(): Omit<DashboardAgentMessage, 'id'> {
  return progressMessage();
}

export function dashboardScreenshotProgressMessage(): Omit<DashboardAgentMessage, 'id'> {
  return progressMessage();
}

export function dashboardUpdateProgressMessage(_componentName: string): Omit<DashboardAgentMessage, 'id'> {
  return progressMessage();
}

export function dashboardElementFieldLabels(
  element: { config?: Record<string, unknown>; type?: string },
  table: BuilderDataTable | null
): string[] {
  const config = element.config ?? {};
  const fields = element.type === 'card'
    ? fieldNamesFromValues([config.valueField, config.yField, config.field])
    : element.type === 'table'
      ? fieldNamesFromValues([config.columns])
      : element.type === 'matrix'
        ? fieldNamesFromValues([config.rowFields, config.columnFields, config.valueFields])
        : element.type === 'filter'
          ? fieldNamesFromValues([config.field, config.xField])
          : fieldNamesFromValues([config.xField, config.ySeries, config.valueField]);
  return Array.from(new Set(fields)).slice(0, 4).map(field => labelForFieldName(table, field));
}

export function customerFacingDashboardAgentText(value: string): string {
  return replaceInsensitivePhrases(value, [
    ['evidence', 'context']
  ]);
}

export function customerFacingDashboardAgentDetails(details: string[] | undefined): string[] {
  return (details ?? [])
    .map(customerFacingDashboardAgentText)
    .filter(detail => !detail.trim().toLowerCase().startsWith('kb:'));
}

export function fieldDetail(label: string, values: string[] | undefined): string {
  const cleanValues = values?.filter(Boolean) ?? [];
  return cleanValues.length > 0 ? `${label}: ${cleanValues.slice(0, 3).join(', ')}` : '';
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function replaceInsensitivePhrases(value: string, replacements: Array<[string, string]>): string {
  return replacements.reduce((output, [search, replacement]) =>
    replaceInsensitivePhrase(output, search, replacement), value);
}

function replaceInsensitivePhrase(value: string, search: string, replacement: string): string {
  if (!search) return value;
  let output = '';
  let remaining = value;
  const loweredSearch = search.toLowerCase();
  while (remaining.toLowerCase().includes(loweredSearch)) {
    const index = remaining.toLowerCase().indexOf(loweredSearch);
    output += remaining.slice(0, index) + replacement;
    remaining = remaining.slice(index + search.length);
  }
  return output + remaining;
}

function successBody(action: 'Added' | 'Updated', name: string, fieldLabels: string[]): string {
  const labels = Array.from(new Set(fieldLabels.map(label => label.trim()).filter(Boolean))).slice(0, 4);
  if (labels.length === 0) return `${action} "${name}" ${action === 'Added' ? 'to this dashboard' : ''}.`.replace(' .', '.');
  return `${action} "${name}" using ${readableList(labels)}.`;
}

function progressMessage(): Omit<DashboardAgentMessage, 'id'> {
  return {
    role: 'assistant',
    kind: 'loading',
    title: 'Thinking...',
    body: ''
  };
}

export function createFollowUpDetails(
  mode: 'create' | 'update',
  componentType: string
): string[] {
  const normalizedType = componentTypeLabel(componentType);
  const contextLine = mode === 'create'
    ? 'This is in your dashboard draft; click Save when you want to keep it.'
    : `I only changed the selected ${normalizedType}; no new dashboard component was added.`;
  return [
    contextLine,
    `Next I can ${followUpActionsForComponent(componentType)}.`
  ];
}

function followUpActionsForComponent(componentType: string): string {
  switch (componentTypeLabel(componentType)) {
    case 'KPI card':
      return 'change the metric, add comparison context, or adjust number formatting';
    case 'chart':
      return 'remap fields, change chart type, tune colors, or adjust labels and legend';
    case 'table':
      return 'add columns, change sorting, format values, or add row-level styling';
    case 'matrix':
      return 'change row or column groups, update measures, or adjust totals and formatting';
    case 'filter':
      return 'change the filter field, connect target components, or adjust available values';
    case 'text insight':
      return 'change the message, severity tone, status label, or presentation style';
    default:
      return 'refine fields, layout, colors, labels, or formatting';
  }
}

function componentTypeLabel(value: string): string {
  if (value === 'card' || value === 'kpi') return 'KPI card';
  if (value === 'table') return 'table';
  if (value === 'matrix') return 'matrix';
  if (value === 'filter') return 'filter';
  if (value === 'text') return 'text insight';
  if (value === 'chart') return 'chart';
  if (value === 'pie') return 'chart';
  if (value === 'component') return 'component';
  return 'chart';
}

function readableList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function fieldNamesFromValues(values: unknown[]): string[] {
  return values.flatMap(fieldNamesFromValue).filter(Boolean);
}

function fieldNamesFromValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(fieldNamesFromValue);
  const field = fieldNameFromValue(value);
  return field ? [field] : [];
}

function fieldNameFromValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!isRecord(value)) return '';
  return readString(value.field)
    ?? readString(value.name)
    ?? readString(value.key)
    ?? readString(value.valueField)
    ?? '';
}

function hasFieldEvidence(table: BuilderDataTable | null, field: BuilderDataField): boolean {
  const metadata = fieldMetadata(table, field.name);
  const evidence = [
    field.description,
    field.dictionaryDescription,
    field.format,
    field.label,
    field.role,
    field.semanticRole,
    field.columnType,
    ...(field.aliases ?? []),
    ...stringArray(field.sampleValues),
    readString(metadata.label),
    readString(metadata.businessName),
    readString(metadata.businessDefinition),
    readString(metadata.description),
    readString(metadata.format),
    readString(metadata.columnType),
    readString(metadata.role),
    readString(metadata.semanticRole),
    ...stringArray(metadata.aliases),
    ...stringArray(metadata.synonyms),
    ...stringArray(metadata.sampleQuestions)
  ];
  return evidence.some(value => typeof value === 'string' && value.trim().length > 0);
}

function fieldRoleFromEvidence(table: BuilderDataTable | null, field: BuilderDataField): 'dimension' | 'measure' | 'time' {
  const metadata = fieldMetadata(table, field.name);
  const explicit = readString(metadata.columnType)
    ?? readString(metadata.role)
    ?? readString(metadata.semanticRole)
    ?? field.columnType
    ?? field.role
    ?? field.semanticRole;
  if (explicit === 'measure' || explicit === 'metric') return 'measure';
  if (explicit === 'time' || explicit === 'date') return 'time';
  if (explicit === 'dimension' || explicit === 'filter' || explicit === 'attribute') return 'dimension';
  if (field.type === 'number' || field.type === 'integer' || field.type === 'decimal') return 'measure';
  if (field.type === 'date' || field.type === 'datetime' || field.type === 'timestamp') return 'time';
  return 'dimension';
}

function fieldLabel(table: BuilderDataTable | null, field: BuilderDataField): string {
  const metadata = fieldMetadata(table, field.name);
  return readString(metadata.label)
    ?? readString(metadata.businessName)
    ?? field.label
    ?? field.name.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function labelForFieldName(table: BuilderDataTable | null, fieldName: string): string {
  const field = table?.fields.find(item => item.name === fieldName) ?? { name: fieldName, type: '' };
  return fieldLabel(table, field);
}

function fieldMetadata(table: BuilderDataTable | null, fieldName: string): Record<string, unknown> {
  const dictionary = table?.dictionary;
  const sources = [dictionary?.fields, dictionary?.columns, dictionary?.ai?.fields, dictionary?.ai?.columns];
  for (const source of sources) {
    const metadata = metadataFromCollection(source, fieldName);
    if (metadata) return metadata;
  }
  return {};
}

function metadataFromCollection(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const match = value.find(item => isRecord(item) && item.name === fieldName);
    return isRecord(match) ? match : null;
  }
  if (!isRecord(value)) return null;
  const metadata = value[fieldName];
  return isRecord(metadata) ? metadata : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : []) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
