import type { ApiResponse } from '@intraq/contracts';
import type {
  SaveCustomQueryPayload,
  SaveSqlModelTableResponse,
  SqlAssistantConversationSnapshot,
  SqlEditorQueryResult,
  SqlEditorSchema,
  SqlEditorSource,
  SqlEditorSuggestion,
  SqlEditorMetadataField,
  SqlEditorMetadataSource,
  SqlEditorMetadataTable
} from './types';

export async function fetchSqlEditorSources(): Promise<SqlEditorSource[]> {
  const payload = await requestApi<{ dataSources: SqlEditorSource[] }>('/api/sql-editor/data-sources');
  return payload.dataSources;
}

export async function fetchSqlEditorMetadataSources(): Promise<SqlEditorMetadataSource[]> {
  const payload = await requestRaw<unknown>('/api/data-sources');
  return Array.isArray(payload) ? payload.flatMap(normalizeMetadataSource) : [];
}

export async function fetchSqlEditorSchema(dataSourceId: string): Promise<SqlEditorSchema> {
  return requestApi<SqlEditorSchema>(`/api/sql-editor/schema/${encodeURIComponent(dataSourceId)}`);
}

export async function executeSqlEditorQuery(
  dataSourceId: string,
  query: string,
  parameterValues: Record<string, string> = {}
): Promise<SqlEditorQueryResult> {
  return requestApi<SqlEditorQueryResult>('/api/sql-editor/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataSourceId, parameterValues, query })
  });
}

export async function saveSqlModelTable(
  dataSourceId: string,
  payload: SaveCustomQueryPayload & { id?: string }
): Promise<SaveSqlModelTableResponse> {
  return requestApi<SaveSqlModelTableResponse>(
    `/api/data-sources/${encodeURIComponent(dataSourceId)}/tables`,
    jsonRequest('POST', payload)
  );
}

export async function fetchSqlEditorSuggestions(dataSourceId: string): Promise<SqlEditorSuggestion[]> {
  const payload = await requestRaw<{ suggestions: SqlEditorSuggestion[] }>(
    `/api/ai-sql-assistant/suggestions/${encodeURIComponent(dataSourceId)}`
  );
  return payload.suggestions;
}

export async function requestSqlAssistance(
  dataSourceId: string,
  userMessage: string,
  currentQuery: string,
  options: { conversationId?: string; parameterValues?: Record<string, string>; signal?: AbortSignal } = {}
): Promise<{ content: string; conversationId?: string }> {
  const response = await fetch('/api/ai-sql-assistant/assistance', jsonRequest('POST', {
    parameterValues: options.parameterValues ?? {},
    dataSourceId,
    userMessage,
    currentQuery,
    conversationId: options.conversationId
  }, options.signal));
  const body = await response.text();
  if (!response.ok) throw new Error(extractJsonError(body) ?? response.statusText);
  return parseEventStreamMessage(body);
}

export async function restoreSqlAssistantConversation(
  dataSourceId: string,
  conversationId?: string
): Promise<SqlAssistantConversationSnapshot | null> {
  const params = new URLSearchParams({ dataSourceId });
  if (conversationId?.trim()) params.set('conversationId', conversationId.trim());
  return requestApi<SqlAssistantConversationSnapshot | null>(`/api/ai-sql-assistant/conversation?${params.toString()}`);
}

export async function createSqlAssistantConversation(
  dataSourceId: string,
  title: string
): Promise<SqlAssistantConversationSnapshot> {
  return requestApi<SqlAssistantConversationSnapshot>(
    '/api/ai-sql-assistant/conversation',
    jsonRequest('POST', { dataSourceId, title })
  );
}

export async function resetSqlAssistantConversation(
  dataSourceId: string,
  conversationId: string
): Promise<SqlAssistantConversationSnapshot> {
  return requestApi<SqlAssistantConversationSnapshot>(
    '/api/ai-sql-assistant/conversation/reset-session',
    jsonRequest('POST', { dataSourceId, conversationId })
  );
}

export async function runSqlAssistantTool(
  dataSourceId: string,
  query: string,
  parameterValues: Record<string, string> = {}
): Promise<SqlEditorQueryResult> {
  const payload = await requestRaw<{ success: boolean; data?: SqlEditorQueryResult; error?: string }>(
    '/api/ai-sql-assistant/tools',
    jsonRequest('POST', { dataSourceId, tool: 'execute_sql', args: { parameterValues, sql: query } })
  );
  if (!payload.success || !payload.data) throw new Error(payload.error ?? 'SQL assistant tool failed.');
  return payload.data;
}

export async function importSqlModelMetadata(
  dataSourceId: string,
  tableId: string,
  dataModelDefinition: string,
  columns: Array<{ name: string; type: string; columnType: string; dictionaryDescription: string }>
): Promise<{ message: string }> {
  await requestApi<unknown>(
    `/api/data-sources/${encodeURIComponent(dataSourceId)}/model-metadata/import`,
    jsonRequest('POST', {
      tableId,
      metadata: { description: dataModelDefinition },
      fields: columns.map(column => ({
        columnType: column.columnType,
        description: column.dictionaryDescription,
        dictionaryDescription: column.dictionaryDescription,
        name: column.name,
        type: column.type
      }))
    })
  );
  return { message: 'AI metadata saved.' };
}

export async function fetchTableDictionary(tableId: string): Promise<Record<string, unknown>> {
  return requestApi<Record<string, unknown>>(`/api/data-sources/tables/${encodeURIComponent(tableId)}/dictionary`);
}

async function requestApi<TData>(url: string, init?: RequestInit): Promise<TData> {
  const response = await fetch(url, init);
  const payload = await readApiResponse<TData>(response);
  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? response.statusText : payload.error);
  }
  return payload.data;
}

async function requestRaw<TData>(url: string, init?: RequestInit): Promise<TData> {
  const response = await fetch(url, init);
  try {
    const payload = await response.json() as TData & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? response.statusText);
    return payload;
  } catch (caught) {
    if (caught instanceof Error) throw caught;
    throw new Error('SQL editor API returned an invalid response.');
  }
}

async function readApiResponse<TData>(response: Response): Promise<ApiResponse<TData>> {
  try {
    return await response.json() as ApiResponse<TData>;
  } catch {
    return { success: false, error: 'SQL editor API returned an invalid response.' };
  }
}

function jsonRequest(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {})
  };
}

function normalizeMetadataSource(value: unknown): SqlEditorMetadataSource[] {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return [];
  return [{
    id: value.id,
    name: value.name,
    type: typeof value.type === 'string' ? value.type : 'source',
    dictionary: isRecord(value.dictionary) ? value.dictionary : {},
    settings: isRecord(value.settings) ? value.settings : {},
    tables: Array.isArray(value.tables) ? value.tables.flatMap(normalizeMetadataTable) : []
  }];
}

function normalizeMetadataTable(value: unknown): SqlEditorMetadataTable[] {
  if (!isRecord(value) || typeof value.name !== 'string') return [];
  const table: SqlEditorMetadataTable = {
    name: value.name,
    description: typeof value.description === 'string' ? value.description : '',
    dictionary: isRecord(value.dictionary) ? value.dictionary : {},
    settings: isRecord(value.settings) ? value.settings : {},
    fields: Array.isArray(value.fields) ? value.fields.flatMap(normalizeMetadataField) : []
  };
  if (typeof value.id === 'string') table.id = value.id;
  if (value.defaultFilters !== undefined) table.defaultFilters = value.defaultFilters;
  return [table];
}

function normalizeMetadataField(value: unknown): SqlEditorMetadataField[] {
  if (!isRecord(value) || typeof value.name !== 'string') return [];
  const field: SqlEditorMetadataField = {
    name: value.name,
    type: typeof value.type === 'string' ? value.type : 'string',
    description: typeof value.description === 'string' ? value.description : '',
    dictionaryDescription: typeof value.dictionaryDescription === 'string' ? value.dictionaryDescription : ''
  };
  if (typeof value.columnType === 'string') field.columnType = value.columnType;
  if (typeof value.role === 'string') field.role = value.role;
  if (typeof value.label === 'string') field.label = value.label;
  return [field];
}

function parseEventStreamMessage(body: string): { content: string; conversationId?: string } {
  const messages = body
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => {
      try {
        return JSON.parse(line.slice(6)) as { fullContent?: string; content?: string; type?: string };
      } catch {
        return null;
      }
    })
    .filter((item): item is { fullContent?: string; content?: string; type?: string } => item !== null);
  const complete = [...messages].reverse().find(item => item.type === 'complete' && item.fullContent);
  const content = complete?.fullContent ?? messages.map(item => item.content ?? '').join('');
  const conversationId = typeof (complete as { conversationId?: unknown } | undefined)?.conversationId === 'string'
    ? (complete as { conversationId: string }).conversationId
    : undefined;
  return { content, ...(conversationId ? { conversationId } : {}) };
}

function extractJsonError(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: string };
    return parsed.error ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
