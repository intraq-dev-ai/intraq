import type { BuilderFieldReference } from '@intraq/contracts';
import type {
  BuilderActionPlan,
  BuilderAgentResponse,
  BuilderConversationSnapshot,
  BuilderDataField,
  BuilderDataParameter,
  BuilderDataSource,
  BuilderDataTable,
  Dashboard,
  DashboardSettings,
  DashboardElement,
  DashboardFilter,
  DashboardFilterCreatePatch,
  DashboardFilterPatch,
  DashboardSuggestion,
  DashboardVersion,
  DataModelRecommendation
} from './types';
import { isPresent, isRecord, readString, requestApi, requestOptionalRaw, requestRaw } from './api-request';

export type DashboardUpdateBody = {
  category?: string;
  categoryId?: string | null;
  description?: string;
  elements?: DashboardElement[];
  filters?: DashboardFilter[];
  name?: string;
  settings?: DashboardSettings;
  status?: Dashboard['status'];
};

export async function fetchDashboards(): Promise<Dashboard[]> {
  return requestApi<Dashboard[]>('/api/dashboards');
}

export async function fetchDashboardMenu(): Promise<Dashboard[]> {
  const items = await requestApi<DashboardMenuItem[]>('/api/dashboards/menu');
  return items.map(normalizeDashboardMenuItem).filter(isPresent);
}

export async function fetchDashboard(id: string, mode?: 'edit' | 'view'): Promise<Dashboard> {
  if (mode) {
    const payload = await requestApi<{ dashboard: Dashboard }>(`/api/dashboards/${encodeURIComponent(id)}/mode/${mode}`);
    return payload.dashboard;
  }
  return requestApi<Dashboard>(`/api/dashboards/${encodeURIComponent(id)}`);
}

export async function createDashboard(name: string): Promise<Dashboard> {
  return requestApi<Dashboard>('/api/dashboards', {
    method: 'POST',
    body: { name, description: 'Created from Dashboard Builder', category: 'Operations' }
  });
}

export async function duplicateDashboard(id: string, name: string): Promise<Dashboard> {
  return requestApi<Dashboard>(`/api/dashboards/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    body: { name }
  });
}

export async function publishDashboard(id: string): Promise<Dashboard> {
  const result = await requestApi<{ dashboard: Dashboard }>(`/api/dashboards/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    body: {}
  });
  return result.dashboard;
}

export async function saveDashboardDraft(id: string): Promise<Dashboard> {
  return requestApi<Dashboard>(`/api/dashboards/${encodeURIComponent(id)}/draft`, {
    method: 'PUT',
    body: {}
  });
}

export async function updateDashboard(
  id: string,
  body: DashboardUpdateBody
): Promise<Dashboard> {
  return requestApi<Dashboard>(`/api/dashboards/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body
  });
}

export async function deleteDashboard(id: string): Promise<void> {
  await requestApi<unknown>(`/api/dashboards/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export async function createDashboardElement(
  dashboardId: string,
  element: {
    name: string;
    type: string;
    chartType?: string;
    dataSourceId?: string;
    config?: Record<string, unknown>;
    layout?: Record<string, unknown>;
  }
): Promise<DashboardElement> {
  return requestApi<DashboardElement>(`/api/dashboards/${encodeURIComponent(dashboardId)}/elements`, {
    method: 'POST',
    body: {
      name: element.name,
      type: element.type,
      chartType: element.chartType,
      dataSourceId: element.dataSourceId,
      config: element.config ?? { title: element.name },
      layout: element.layout ?? { x: 0, y: 0, w: 6, h: 5 }
    }
  });
}

export async function updateDashboardElement(
  elementId: string,
  body: {
    chartType?: string;
    config?: Record<string, unknown>;
    dataSourceId?: string;
    isVisible?: boolean;
    layout?: Record<string, unknown>;
    name?: string;
    type?: string;
  }
): Promise<DashboardElement> {
  return requestApi<DashboardElement>(`/api/dashboards/elements/${encodeURIComponent(elementId)}`, {
    method: 'PUT',
    body
  });
}

export async function deleteDashboardElement(elementId: string): Promise<void> {
  await requestApi<unknown>(`/api/dashboards/elements/${encodeURIComponent(elementId)}`, {
    method: 'DELETE'
  });
}

export async function createDashboardFilter(
  dashboardId: string,
  filter: DashboardFilterCreatePatch = {
    name: 'Dashboard Filter',
    field: '',
    operator: 'equals',
    type: 'interactive'
  }
): Promise<DashboardFilter> {
  return requestApi<DashboardFilter>(`/api/dashboards/${encodeURIComponent(dashboardId)}/filters`, {
    method: 'POST',
    body: filter
  });
}

export async function updateDashboardFilter(
  dashboardId: string,
  filterId: string,
  body: DashboardFilterPatch
): Promise<DashboardFilter> {
  const payload = await requestApi<DashboardFilter & { filter?: DashboardFilter }>(
    `/api/dashboards/${encodeURIComponent(dashboardId)}/filters/${encodeURIComponent(filterId)}`,
    { method: 'PUT', body }
  );
  return payload.filter ?? payload;
}

export async function deleteDashboardFilter(dashboardId: string, filterId: string): Promise<void> {
  await requestApi<unknown>(
    `/api/dashboards/${encodeURIComponent(dashboardId)}/filters/${encodeURIComponent(filterId)}`,
    { method: 'DELETE' }
  );
}

export async function fetchDashboardVersions(dashboardId: string): Promise<DashboardVersion[]> {
  return requestApi<DashboardVersion[]>(`/api/dashboards/${encodeURIComponent(dashboardId)}/versions`);
}

export async function createDashboardVersion(dashboardId: string, name: string): Promise<DashboardVersion> {
  return requestApi<DashboardVersion>(`/api/dashboards/${encodeURIComponent(dashboardId)}/versions`, {
    method: 'POST',
    body: { name }
  });
}

export async function restoreDashboardVersion(dashboardId: string, versionId: string): Promise<Dashboard> {
  const payload = await requestApi<{ dashboard: Dashboard }>(
    `/api/dashboards/${encodeURIComponent(dashboardId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST', body: {} }
  );
  return payload.dashboard;
}

export async function planDashboardElement(
  prompt: string,
  context: {
    dashboardId?: string;
    dataSourceId?: string;
    dataSourceTableId?: string;
    elementId?: string;
    mode?: 'create' | 'update';
    tableName?: string;
    componentType?: string;
    conversationId?: string;
    elementSnapshot?: Record<string, unknown>;
    fieldReferences?: BuilderFieldReference[];
  }
): Promise<BuilderAgentResponse> {
  return requestApi<BuilderAgentResponse>('/api/ai/perform-action-v2', {
    method: 'POST',
    body: {
      prompt,
      conversationId: context.conversationId,
      mode: context.mode ?? 'create',
      dashboardId: context.dashboardId,
      elementId: context.elementId,
      dataSourceId: context.dataSourceId,
      dataSourceTableId: context.dataSourceTableId,
      tableName: context.tableName,
      componentType: context.componentType,
      elementSnapshot: context.elementSnapshot,
      fieldReferences: context.fieldReferences
    }
  });
}

export async function restoreBuilderConversation(input: {
  conversationId?: string;
  dashboardId: string;
}): Promise<BuilderConversationSnapshot | null> {
  const params = new URLSearchParams({ dashboardId: input.dashboardId });
  if (input.conversationId) params.set('conversationId', input.conversationId);
  return requestApi<BuilderConversationSnapshot | null>(`/api/dashboard-builder/conversation?${params.toString()}`);
}

export async function createBuilderConversation(input: {
  conversationId?: string;
  dashboardId: string;
  dataSourceId?: string;
  dataSourceTableId?: string;
  title?: string;
}): Promise<BuilderConversationSnapshot> {
  return requestApi<BuilderConversationSnapshot>('/api/dashboard-builder/conversation', {
    method: 'POST',
    body: input
  });
}

export async function resetBuilderConversation(input: {
  conversationId: string;
  dashboardId: string;
}): Promise<BuilderConversationSnapshot> {
  return requestApi<BuilderConversationSnapshot>('/api/dashboard-builder/conversation/reset-session', {
    method: 'POST',
    body: input
  });
}

export async function recommendDashboardDataModel(
  prompt: string,
  dataSourceId: string
): Promise<DataModelRecommendation> {
  return requestApi<DataModelRecommendation>('/api/ai/recommend-data-model-v2', {
    method: 'POST',
    body: { prompt, dataSourceId }
  });
}

interface DashboardMenuItem {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  categoryId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  settings?: unknown;
  isGlobal?: unknown;
  isGloballyVisible?: unknown;
  isSample?: unknown;
  tenant?: unknown;
}

export async function fetchBuilderDataSources(): Promise<BuilderDataSource[]> {
  const payload = await requestRaw('/api/data-sources/builder-catalog');
  if (!Array.isArray(payload)) throw new Error('Data sources response was not an array.');
  return payload.map(normalizeDataSource).filter(isPresent);
}

export async function fetchDashboardSuggestions(dataSourceId?: string): Promise<DashboardSuggestion[]> {
  if (!dataSourceId) return [];
  const payload = await requestOptionalRaw('/api/dashboard-suggestions/generate', {
    method: 'POST',
    body: { dataSourceId }
  });
  if (!payload) return [];
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.suggestions)) {
    throw new Error('Dashboard suggestions response was not valid.');
  }
  return payload.suggestions.map(normalizeSuggestion).filter(isPresent);
}

function normalizeSuggestion(value: unknown): DashboardSuggestion | null {
  if (!isRecord(value)) return null;
  const title = readString(value.title);
  const description = readString(value.description);
  return title && description ? { title, description } : null;
}

function normalizeDashboardMenuItem(value: DashboardMenuItem): Dashboard | null {
  const id = readString(value.id);
  const name = readString(value.name);
  if (!id || !name) return null;
  const categoryId = value.categoryId === null ? null : readString(value.categoryId);
  const settings = isRecord(value.settings) ? value.settings : {};
  const tenant = isRecord(value.tenant) ? { name: readString(value.tenant.name) ?? undefined } : null;
  return {
    id,
    name,
    category: readString(value.category) ?? 'Uncategorized',
    ...(categoryId !== undefined ? { categoryId } : {}),
    status: 'published',
    elements: [],
    filters: [],
    ...(readString(value.createdAt) ? { createdAt: readString(value.createdAt) } : {}),
    updatedAt: readString(value.updatedAt) ?? new Date(0).toISOString(),
    ...(typeof settings.isFavorite === 'boolean' ? { settings: { isFavorite: settings.isFavorite } } : {}),
    ...(typeof value.isGlobal === 'boolean' ? { isGlobal: value.isGlobal } : {}),
    ...(typeof value.isGloballyVisible === 'boolean' ? { isGloballyVisible: value.isGloballyVisible } : {}),
    ...(typeof value.isSample === 'boolean' ? { isSample: value.isSample } : {}),
    ...(tenant ? { tenant } : {})
  };
}

function normalizeDataSource(value: unknown): BuilderDataSource | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  if (!id || !name) return null;
  const tables = Array.isArray(value.tables) ? value.tables.map(normalizeTable).filter(isPresent) : [];
  if (tables.length === 0) return null;
  const settings = isRecord(value.settings) ? value.settings as NonNullable<BuilderDataSource['settings']> : undefined;
  const parameters = dedupeParameters([
    ...normalizeParameters(value.parameters),
    ...normalizeParameters(settings?.parameters)
  ]);
  return {
    id,
    name,
    ...(readString(value.status) ? { status: readString(value.status) as string } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(settings ? { settings } : {}),
    tables
  };
}

function normalizeTable(value: unknown): BuilderDataTable | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  if (!id || !name) return null;
  const settings = isRecord(value.settings) ? value.settings as NonNullable<BuilderDataTable['settings']> : undefined;
  const dictionary = isRecord(value.dictionary) ? value.dictionary as NonNullable<BuilderDataTable['dictionary']> : undefined;
  const parameters = dedupeParameters([
    ...normalizeParameters(value.parameters),
    ...normalizeParameters(settings?.parameters),
    ...normalizeParameters(dictionary?.parameters)
  ]);
  return {
    id,
    name,
    ...(readString(value.description) ? { description: readString(value.description) as string } : {}),
    fields: Array.isArray(value.fields) ? value.fields.map(normalizeField).filter(isPresent) : [],
    ...(typeof value.isSelected === 'boolean' ? { isSelected: value.isSelected } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(settings ? { settings } : {}),
    ...(dictionary ? { dictionary } : {})
  };
}

function normalizeField(value: unknown): BuilderDataField | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  if (!name) return null;
  return {
    name,
    type: readString(value.type) ?? 'string',
    ...(readString(value.columnType) ? { columnType: readString(value.columnType) as string } : {}),
    ...(readString(value.role) ? { role: readString(value.role) as string } : {}),
    ...(readString(value.semanticRole) ? { semanticRole: readString(value.semanticRole) as string } : {}),
    ...(readString(value.label) ? { label: readString(value.label) as string } : {}),
    ...(readString(value.format) ? { format: readString(value.format) as string } : {}),
    ...(Array.isArray(value.aliases) ? { aliases: value.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) } : {}),
    ...(Array.isArray(value.sampleValues) ? { sampleValues: value.sampleValues } : {}),
    ...(readString(value.description) ? { description: readString(value.description) as string } : {}),
    ...(readString(value.dictionaryDescription) ? { dictionaryDescription: readString(value.dictionaryDescription) as string } : {})
  };
}

function normalizeParameters(value: unknown): BuilderDataParameter[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeParameter).filter(isPresent);
}

function normalizeParameter(value: unknown): BuilderDataParameter | null {
  if (typeof value === 'string') return value.trim() ? { name: value.trim(), dataType: 'string' } : null;
  if (!isRecord(value)) return null;
  const name = readString(value.name) ?? readString(value.parameter) ?? readString(value.key) ?? readString(value.id);
  if (!name) return null;
  return {
    name,
    ...(readString(value.dataType) ? { dataType: readString(value.dataType) as string } : {}),
    ...(readString(value.type) ? { type: readString(value.type) as string } : {}),
    ...(readString(value.label) ? { label: readString(value.label) as string } : {}),
    ...(readString(value.description) ? { description: readString(value.description) as string } : {}),
    ...(readString(value.dateRole) ? { dateRole: readString(value.dateRole) as string } : {}),
    ...(typeof value.required === 'boolean' ? { required: value.required } : {}),
    ...(value.defaultValue !== undefined ? { defaultValue: value.defaultValue } : {}),
    ...(Array.isArray(value.aliases) ? { aliases: value.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) } : {})
  };
}

function dedupeParameters(parameters: BuilderDataParameter[]): BuilderDataParameter[] {
  const seen = new Set<string>();
  return parameters.filter(parameter => {
    const key = parameter.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
