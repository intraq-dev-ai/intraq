import { requestAdmin } from '../admin/api';
import {
  buildDashboardCategoryPayload,
  normalizeDashboardCategories,
  normalizeDashboardCategoryOrThrow
} from './normalizers';
import type { DashboardCategory, DashboardCategoryForm } from './types';

const DASHBOARD_CATEGORIES_PATH = '/api/dashboard-categories';
const DASHBOARDS_PATH = '/api/dashboards';

export async function fetchDashboardCategories(): Promise<DashboardCategory[]> {
  const categoryPayload = await requestAdmin<unknown>(DASHBOARD_CATEGORIES_PATH);
  const dashboardPayload = await fetchDashboardInventoryForCategoryEnrichment();
  return normalizeDashboardCategories(categoryPayload, dashboardPayload);
}

export async function createDashboardCategory(form: DashboardCategoryForm): Promise<DashboardCategory> {
  const body = buildDashboardCategoryPayload(form);
  const payload = await requestAdmin<unknown>(DASHBOARD_CATEGORIES_PATH, {
    method: 'POST',
    body
  });
  return normalizeDashboardCategoryOrThrow(payload, form);
}

export async function updateDashboardCategory(
  category: DashboardCategory,
  form: DashboardCategoryForm
): Promise<DashboardCategory> {
  const body = buildDashboardCategoryPayload(form);
  const payload = await requestAdmin<unknown>(`${DASHBOARD_CATEGORIES_PATH}/${encodeURIComponent(category.id)}`, {
    method: 'PUT',
    body
  });
  return normalizeDashboardCategoryOrThrow(payload, { ...category, ...form });
}

export async function deleteDashboardCategory(category: DashboardCategory): Promise<void> {
  await requestAdmin<unknown>(`${DASHBOARD_CATEGORIES_PATH}/${encodeURIComponent(category.id)}`, {
    method: 'DELETE'
  });
}

async function fetchDashboardInventoryForCategoryEnrichment(): Promise<unknown> {
  try {
    return await requestAdmin<unknown>(DASHBOARDS_PATH);
  } catch {
    // Categories remain usable when optional dashboard-card enrichment is unavailable.
    return [];
  }
}
