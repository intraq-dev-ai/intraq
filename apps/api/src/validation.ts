import type {
  ActionPlanMode,
  AnalyzerRequest,
  BuilderAgentRequest,
  DashboardComponentType,
  DataModelRecommendationRequest,
  VisualizationKind
} from '@intraq/contracts';

export interface AnalyzerPlanRequest {
  dataSourceId: string;
  dataSourceTableId?: string;
  question: string;
  conversationId?: string;
  provider?: string;
  tableName?: string;
}

export function parseBuilderAgentRequest(input: unknown): BuilderAgentRequest | null {
  if (!isRecord(input)) return null;
  const prompt = firstNonEmptyString(input.prompt, input.message);
  if (!prompt) return null;
  if (!optionalStrings(input, ['conversationId', 'dashboardId', 'elementId', 'dataSourceId', 'dataSourceTableId', 'tableName', 'visualizationKind'])) {
    return null;
  }
  const mode = parseActionPlanMode(input.mode);
  if (input.mode !== undefined && !mode) return null;
  const componentType = parseDashboardComponentType(input.componentType);
  if (input.componentType !== undefined && !componentType) return null;
  const visualizationKind = parseVisualizationKind(input.visualizationKind);
  if (input.visualizationKind !== undefined && !visualizationKind) return null;
  if (input.elementSnapshot !== undefined && !isRecord(input.elementSnapshot)) return null;
  const fieldReferences = parseBuilderFieldReferences(input.fieldReferences);
  if (input.fieldReferences !== undefined && !fieldReferences) return null;

  const request: BuilderAgentRequest = { prompt };
  const conversationId = asOptionalString(input.conversationId);
  const dashboardId = asOptionalString(input.dashboardId);
  const elementId = asOptionalString(input.elementId);
  const dataSourceId = asOptionalString(input.dataSourceId);
  const dataSourceTableId = asOptionalString(input.dataSourceTableId);
  const tableName = asOptionalString(input.tableName);
  if (conversationId) request.conversationId = conversationId;
  if (mode) request.mode = mode;
  if (componentType) request.componentType = componentType;
  if (visualizationKind) request.visualizationKind = visualizationKind;
  if (dashboardId) request.dashboardId = dashboardId;
  if (elementId) request.elementId = elementId;
  if (isRecord(input.elementSnapshot)) request.elementSnapshot = input.elementSnapshot;
  if (dataSourceId) request.dataSourceId = dataSourceId;
  if (dataSourceTableId) request.dataSourceTableId = dataSourceTableId;
  if (tableName) request.tableName = tableName;
  if (fieldReferences?.length) request.fieldReferences = fieldReferences;
  return request;
}

export function parseAnalyzerRequest(input: unknown): AnalyzerRequest | null {
  if (!isRecord(input) || !isNonEmptyString(input.question)) return null;
  if (!optionalStrings(input, ['conversationId', 'dashboardId', 'dataSourceId'])) return null;

  const request: AnalyzerRequest = { question: input.question };
  const conversationId = asOptionalString(input.conversationId);
  const dashboardId = asOptionalString(input.dashboardId);
  const dataSourceId = asOptionalString(input.dataSourceId);
  if (conversationId) request.conversationId = conversationId;
  if (dashboardId) request.dashboardId = dashboardId;
  if (dataSourceId) request.dataSourceId = dataSourceId;
  return request;
}

export function parseAnalyzerPlanRequest(input: unknown): AnalyzerPlanRequest | null {
  if (!isRecord(input) || !isNonEmptyString(input.dataSourceId) || !isNonEmptyString(input.question)) {
    return null;
  }
  if (!optionalStrings(input, ['conversationId', 'dataSourceTableId', 'provider', 'tableName'])) return null;

  const request: AnalyzerPlanRequest = {
    dataSourceId: input.dataSourceId.trim(),
    question: input.question.trim()
  };
  const conversationId = asOptionalString(input.conversationId);
  const dataSourceTableId = asOptionalString(input.dataSourceTableId);
  const provider = asOptionalString(input.provider);
  const tableName = asOptionalString(input.tableName);
  if (conversationId) request.conversationId = conversationId;
  if (dataSourceTableId) request.dataSourceTableId = dataSourceTableId;
  if (provider) request.provider = provider;
  if (tableName) request.tableName = tableName;
  return request;
}

export function parseDataModelRecommendationRequest(input: unknown): DataModelRecommendationRequest | null {
  if (!isRecord(input)) return null;
  const prompt = firstNonEmptyString(input.prompt, input.message);
  if (!prompt) return null;
  if (!optionalStrings(input, ['dataSourceId'])) return null;

  const request: DataModelRecommendationRequest = { prompt };
  const dataSourceId = asOptionalString(input.dataSourceId);
  if (dataSourceId) request.dataSourceId = dataSourceId;
  return request;
}

export function parseKnowledgeDocumentRequest(input: unknown): { topic: string } | null {
  return isRecord(input) && isNonEmptyString(input.topic) ? { topic: input.topic } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (isNonEmptyString(value)) return value.trim();
  }
  return null;
}

function optionalStrings(input: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => input[key] === undefined || isNonEmptyString(input[key]));
}

function parseActionPlanMode(value: unknown): ActionPlanMode | null {
  return value === 'create' || value === 'update' ? value : null;
}

function parseDashboardComponentType(value: unknown): DashboardComponentType | null {
  if (
    value === 'chart' ||
    value === 'table' ||
    value === 'card' ||
    value === 'pie' ||
    value === 'matrix' ||
    value === 'filter' ||
    value === 'text'
  ) {
    return value;
  }
  return null;
}

function parseVisualizationKind(value: unknown): VisualizationKind | null {
  if (
    value === 'bar' ||
    value === 'line' ||
    value === 'pie' ||
    value === 'table' ||
    value === 'card' ||
    value === 'matrix' ||
    value === 'filter' ||
    value === 'text'
  ) {
    return value;
  }
  return null;
}

function parseBuilderFieldReferences(value: unknown): BuilderAgentRequest['fieldReferences'] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const references: NonNullable<BuilderAgentRequest['fieldReferences']> = [];
  for (const item of value) {
    if (!isRecord(item) || !isNonEmptyString(item.field) || !isNonEmptyString(item.token)) return null;
    references.push({
      field: item.field.trim(),
      token: item.token.trim(),
      ...(item.exact === true ? { exact: true } : {}),
      ...(isNonEmptyString(item.label) ? { label: item.label.trim() } : {}),
      ...(isNonEmptyString(item.role) ? { role: item.role.trim() } : {})
    });
  }
  return references;
}
