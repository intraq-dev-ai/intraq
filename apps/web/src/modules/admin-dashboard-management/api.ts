import { requestAdmin } from '../admin/api';
import { normalizeDashboardOrThrow, normalizeDashboards } from './helpers';
import type {
  AdminDashboard,
  DashboardEditForm,
  DashboardVisibilitySettings
} from './types';

export async function fetchAdminDashboards(): Promise<AdminDashboard[]> {
  return normalizeDashboards(await requestAdmin<unknown>('/api/dashboards'));
}

export async function updateAdminDashboard(id: string, form: DashboardEditForm): Promise<AdminDashboard> {
  const body: Record<string, unknown> = {
    category: form.category,
    description: form.description,
    name: form.name
  };
  body.status = form.status === 'draft' ? 'draft' : 'published';
  const payload = await requestAdmin<unknown>(`/api/dashboards/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body
  });
  return normalizeDashboardOrThrow(payload);
}

export async function cloneAdminDashboard(id: string, name: string): Promise<AdminDashboard> {
  const payload = await requestAdmin<unknown>(`/api/dashboards/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    body: { name }
  });
  return normalizeDashboardOrThrow(payload);
}

export async function deleteAdminDashboard(id: string): Promise<void> {
  await requestAdmin<unknown>(`/api/dashboards/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export async function updateAdminDashboardVisibility(
  id: string,
  settings: DashboardVisibilitySettings
): Promise<void> {
  await requestAdmin<unknown>(`/api/dashboards/${encodeURIComponent(id)}/sample-visibility`, {
    method: 'PUT',
    body: {
      isGloballyVisible: settings.isGloballyVisible,
      visible: settings.isGloballyVisible
    }
  });
}
