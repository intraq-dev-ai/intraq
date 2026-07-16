import type { ApiResponse } from '@intraq/contracts';
import type { ProductRouteInfo } from './types';

export async function fetchProductRoutes(): Promise<ProductRouteInfo[]> {
  const response = await fetch('/api/product/routes', { headers: { accept: 'application/json' } });
  const payload = await parseJson(response);
  if (!isApiResponse(payload) || !response.ok || !payload.success) {
    throw new Error(readError(payload, response.status));
  }
  const data = payload.data;
  if (!isRecord(data) || !Array.isArray(data.routes)) {
    throw new Error('Product routes response was missing routes.');
  }
  return data.routes.map(normalizeRoute).filter(isPresent);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error('Product routes response was not valid JSON.');
  }
}

function normalizeRoute(value: unknown): ProductRouteInfo | null {
  if (!isRecord(value)) return null;
  const path = readString(value.path);
  const label = readString(value.label);
  const section = readString(value.section) ?? formatGroup(readString(value.group));
  return path && label && section ? { path, label, section } : null;
}

function formatGroup(group: string | null): string | null {
  if (!group) return null;
  if (group === 'admin') return 'Admin';
  return group.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function readError(payload: unknown, status: number): string {
  if (isApiResponse(payload) && !payload.success) return payload.error;
  return `Product routes request failed with status ${status}.`;
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return isRecord(value) && typeof value.success === 'boolean';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
