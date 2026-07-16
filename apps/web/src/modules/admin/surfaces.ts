import { ADMIN_RESOURCE_SURFACES } from './resource-surfaces';
import { ADMIN_SUMMARY_SURFACES } from './summary-surfaces';
import type { AdminSurface } from './types';
import { titleize } from './format';

const surfaceAliases: Record<string, string> = {
  '': 'dashboard',
  admin: 'dashboard',
  dashboard: 'dashboard',
  overview: 'overview',
  dashboards: 'dashboards',
  'dashboard-categories': 'dashboard-categories',
  'data-sources': 'data-sources',
  'view-data-sources': 'view-data-sources',
  'data-dictionary': 'data-dictionary',
  'custom-data-sources': 'custom-data-sources',
  'sql-query-editor': 'sql-query-editor',
  'ai-api-key-management': 'ai-provider-settings',
  'ai-provider-settings': 'ai-provider-settings',
  'smtp-configuration': 'smtp-configuration',
  settings: 'settings'
};

export function resolveAdminSurface(segments: string[]): AdminSurface {
  const keys = candidateKeys(segments);
  for (const key of keys) {
    const id = surfaceAliases[key] ?? key;
    const surface = ADMIN_RESOURCE_SURFACES[id] ?? ADMIN_SUMMARY_SURFACES[id];
    if (surface) return surface;
  }
  return fallbackSurface(keys[0] ?? 'dashboard');
}

function candidateKeys(segments: string[]): string[] {
  const normalized = segments.map(segment => segment.trim().toLowerCase()).filter(Boolean);
  const full = normalized.join('/');
  const last = normalized.at(-1) ?? '';
  const first = normalized[0] ?? '';
  return [full, last, first, 'dashboard'].filter(Boolean);
}

function fallbackSurface(key: string): AdminSurface {
  return {
    id: key || 'dashboard',
    kind: 'summary',
    eyebrow: 'Administration',
    title: titleize(key || 'dashboard'),
    description: 'Admin route fallback.',
    requests: [
      { id: 'health', title: 'API Health', path: '/api/health' },
      { id: 'routes', title: 'Product Routes', path: '/api/product/routes' }
    ]
  };
}
