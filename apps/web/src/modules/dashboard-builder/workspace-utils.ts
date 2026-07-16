import type { LocationQuery } from 'vue-router';
import type { Dashboard } from './types';

export function mergeDashboard(list: Dashboard[], selected: Dashboard): Dashboard[] {
  return list.some(dashboard => dashboard.id === selected.id)
    ? list.map(dashboard => dashboard.id === selected.id ? selected : dashboard)
    : [selected, ...list];
}

export function routeParam(value: unknown): string {
  if (Array.isArray(value)) return routeParam(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

export function readQueryString(query: LocationQuery, key: string): string {
  const value = query[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
