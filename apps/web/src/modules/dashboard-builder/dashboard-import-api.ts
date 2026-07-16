import type { Dashboard } from './types';

interface ImportApiResponse<TData> {
  data?: TData;
  error?: string;
  success: boolean;
}

export interface DashboardImportInput {
  category?: string;
  elements?: unknown[];
  filters?: unknown[];
  layout?: unknown[];
  name: string;
}

export interface DashboardImportParseResult {
  dashboard: DashboardImportInput;
  elements: unknown[];
  filters: unknown[];
  metadata: Record<string, unknown>;
  valid: boolean;
  warnings: string[];
}

export interface DashboardImportRequest {
  columnMappings?: Record<string, string>;
  content: string;
  dataSourceId?: string;
  fileName?: string;
  filterMappings?: Record<string, string>;
  tableId?: string;
  type: DashboardImportType;
}

export type DashboardImportType = 'devexpress' | 'looker' | 'self';

export async function parseDashboardImportPayload(request: DashboardImportRequest): Promise<DashboardImportParseResult> {
  const payload = parseDashboardImportText(request.content);
  const data = await requestImportApi<DashboardImportParseResult>('/api/dashboards/import/parse', {
    method: 'POST',
    body: {
      type: request.type,
      content: request.content,
      fileName: request.fileName,
      ...(isRecord(payload) ? payload : { dashboard: payload })
    }
  });
  if (!data.valid || !data.dashboard?.name) throw new Error('Dashboard import did not include a valid dashboard name.');
  return normalizeParseResult(data);
}

export async function createImportedDashboard(
  parsed: DashboardImportParseResult,
  request: DashboardImportRequest
): Promise<Dashboard> {
  const dashboard = applyImportMapping(parsed.dashboard, request);
  return requestImportApi<Dashboard>('/api/dashboards/import/create', {
    method: 'POST',
    body: {
      dashboard,
      elements: parsed.elements,
      filters: parsed.filters,
      metadata: parsed.metadata,
      elementMappings: importMappings(parsed.elements, request),
      filterMappings: importMappings(parsed.filters, request)
    }
  });
}

export async function createSelfImportedDashboard(
  parsed: DashboardImportParseResult,
  request: DashboardImportRequest
): Promise<Dashboard> {
  return requestImportApi<Dashboard>('/api/dashboards/import/self', {
    method: 'POST',
    body: {
      dashboard: applyImportMapping(parsed.dashboard, request),
      elements: parsed.elements,
      filters: parsed.filters,
      metadata: parsed.metadata,
      newName: parsed.dashboard.name,
      dataSourceId: request.dataSourceId,
      tableId: request.tableId
    }
  });
}

export function parseDashboardImportText(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Paste dashboard JSON or XML before importing.');
  if (trimmed.startsWith('<')) return dashboardImportFromXml(trimmed);

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error('Dashboard JSON could not be parsed.');
  }
}

async function requestImportApi<TData>(
  path: string,
  options: { body?: unknown; method?: string } = {}
): Promise<TData> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const payload = await response.json() as ImportApiResponse<TData>;
  if (!response.ok || !payload.success) throw new Error(payload.error ?? `Request to ${path} failed.`);
  return payload.data as TData;
}

function dashboardImportFromXml(xml: string): DashboardImportInput {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.querySelector('parsererror');
  if (parserError) throw new Error('Dashboard XML could not be parsed.');
  const dashboardNode = document.querySelector('dashboard');
  const name = dashboardNode?.getAttribute('name')?.trim() || textContent(document, 'name') || 'Imported Dashboard';
  const category = dashboardNode?.getAttribute('category')?.trim() || textContent(document, 'category') || 'Operations';
  return { category, name };
}

function normalizeParseResult(data: DashboardImportParseResult): DashboardImportParseResult {
  return {
    ...data,
    elements: Array.isArray(data.elements) ? data.elements : data.dashboard.elements ?? [],
    filters: Array.isArray(data.filters) ? data.filters : data.dashboard.filters ?? [],
    metadata: isRecord(data.metadata) ? data.metadata : {}
  };
}

function applyImportMapping(dashboard: DashboardImportInput, request: DashboardImportRequest): DashboardImportInput {
  return {
    ...dashboard,
    ...(request.dataSourceId ? { dataSourceId: request.dataSourceId } : {}),
    ...(request.tableId ? { tableId: request.tableId } : {})
  };
}

function importMappings(items: unknown[], request: DashboardImportRequest): Array<Record<string, unknown>> {
  if (!request.dataSourceId && !request.tableId) return [];
  return items.filter(isRecord).map((item, index) => ({
    tempElementId: typeof item.tempId === 'string' ? item.tempId : `import-${index}`,
    dataSourceId: request.dataSourceId,
    tableId: request.tableId,
    columnMappings: request.columnMappings ?? {}
  }));
}

function textContent(document: Document, selector: string): string {
  return document.querySelector(selector)?.textContent?.trim() ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
