import type { HomeConversation, HomeDashboard } from './types';

interface ApiEnvelope<TData> {
  success: boolean;
  data?: TData;
  error?: string;
}

export async function fetchHomeConversations(): Promise<HomeConversation[]> {
  return requestJson<HomeConversation[]>('/api/ai-data-analyzer/conversations?limit=4');
}

export async function fetchHomeDashboards(): Promise<HomeDashboard[]> {
  return requestJson<HomeDashboard[]>('/api/dashboards/menu?limit=4');
}

async function requestJson<TData>(path: string): Promise<TData> {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  const payload = await parseJson(response, path);
  if (isApiEnvelope<TData>(payload)) {
    if (!response.ok || !payload.success) throw new Error(payload.error ?? `Request to ${path} failed.`);
    return payload.data as TData;
  }
  if (!response.ok) throw new Error(`Request to ${path} failed.`);
  return payload as TData;
}

async function parseJson(response: Response, path: string): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function isApiEnvelope<TData>(value: unknown): value is ApiEnvelope<TData> {
  return isRecord(value) && typeof value.success === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
