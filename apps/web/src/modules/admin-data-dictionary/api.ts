import {
  normalizeAdminDictionarySources,
  normalizeAdminDictionaryTableDetails,
  normalizeAdminDictionaryTables,
  normalizeAdminDictionaryMetadataSummary
} from './normalizers';
import type {
  AdminDictionaryMetadataSummary,
  AdminDictionarySource,
  AdminDictionaryTable,
  AdminDictionaryTableDetails
} from './types';

const DATA_SOURCES_PATH = '/api/data-sources';

export async function fetchAdminDictionaryCatalog(): Promise<AdminDictionarySource[]> {
  const sources = normalizeAdminDictionarySources(await requestDictionaryApi(DATA_SOURCES_PATH));
  return Promise.all(sources.map(hydrateSourceTables));
}

export async function fetchAdminDictionaryTables(sourceId: string): Promise<AdminDictionaryTable[]> {
  return normalizeAdminDictionaryTables(
    await requestDictionaryApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(sourceId)}/tables`)
  );
}

export async function fetchAdminDictionaryTableDetails(tableId: string): Promise<AdminDictionaryTableDetails> {
  return normalizeAdminDictionaryTableDetails(
    await requestDictionaryApi(`${DATA_SOURCES_PATH}/tables/${encodeURIComponent(tableId)}/dictionary`),
    tableId
  );
}

export async function fetchAdminDictionaryMetadataSummary(
  sourceId: string
): Promise<AdminDictionaryMetadataSummary> {
  return normalizeAdminDictionaryMetadataSummary(
    await requestDictionaryApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(sourceId)}/model-metadata/validate`, {
      method: 'POST',
      body: {}
    })
  );
}

async function hydrateSourceTables(source: AdminDictionarySource): Promise<AdminDictionarySource> {
  if (source.tables.length > 0) return source;
  const tables = await fetchAdminDictionaryTables(source.id);
  return { ...source, tableCount: tables.length, tables };
}

async function requestDictionaryApi(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await parseJson(path, response);
  if (isApiResponse(payload)) {
    if (!response.ok || !payload.success) {
      throw new Error(payload.success ? `Request to ${path} failed with status ${response.status}.` : payload.error);
    }
    return payload.data;
  }
  if (!response.ok) throw new Error(readRawError(payload, path, response.status));
  return payload;
}

async function parseJson(path: string, response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function readRawError(payload: unknown, path: string, status: number): string {
  if (isRecord(payload)) {
    const error = typeof payload.error === 'string' ? payload.error : null;
    const message = typeof payload.message === 'string' ? payload.message : null;
    if (error || message) return error ?? message ?? '';
  }
  return `Request to ${path} failed with status ${status}.`;
}

function isApiResponse(value: unknown): value is { data?: unknown; error: string; success: boolean } {
  return isRecord(value) && typeof value.success === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
