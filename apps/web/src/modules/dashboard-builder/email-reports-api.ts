import type { ApiResponse } from '@intraq/contracts';

export type DashboardEmailReportFrequency = 'daily' | 'weekly' | 'monthly';
export type DashboardEmailExportFormat = 'csv' | 'excel' | 'pdf';

export interface DashboardEmailDelivery {
  id: string;
  subscriptionId: string;
  recipients: string[];
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  createdAt?: string;
  errorMessage?: string;
}

export interface DashboardEmailSubscription {
  id: string;
  dashboardId: string;
  dashboard?: {
    id?: string;
    name?: string;
    description?: string;
  };
  name?: string;
  description?: string;
  recipients: string[];
  schedule?: Record<string, unknown> | string;
  deliveries?: DashboardEmailDelivery[];
  frequency: DashboardEmailReportFrequency;
  subject: string;
  enabled: boolean;
  exportFormats?: DashboardEmailExportFormat[];
  includeIntraqInsights?: boolean;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateDashboardEmailSubscriptionInput {
  enabled: boolean;
  exportFormats: DashboardEmailExportFormat[];
  recipients: string[];
  frequency: DashboardEmailReportFrequency;
  includeIntraqInsights: boolean;
  name: string;
  status?: string;
  subject: string;
}

export type UpdateDashboardEmailSubscriptionInput = CreateDashboardEmailSubscriptionInput;

export interface DashboardEmailTestResult {
  message?: string;
  subscriptionId?: string;
}

type JsonBody = object;

export function parseDashboardEmailRecipients(value: string): string[] {
  return value.split(/[,\n;]/).map(recipient => recipient.trim()).filter(Boolean);
}

export async function listDashboardEmailSubscriptions(dashboardId: string): Promise<DashboardEmailSubscription[]> {
  const payload = await requestEmailReports(
    `/api/email-subscriptions/dashboard/${encodeURIComponent(dashboardId)}/subscriptions`
  );
  return extractRecords(payload).map(normalizeSubscription).filter(isPresent);
}

export async function createDashboardEmailSubscription(
  dashboardId: string,
  input: CreateDashboardEmailSubscriptionInput
): Promise<DashboardEmailSubscription> {
  const payload = await requestEmailReports(
    `/api/email-subscriptions/dashboard/${encodeURIComponent(dashboardId)}/subscriptions`,
    { method: 'POST', body: input }
  );
  const subscription = normalizeSubscription(payload);
  if (!subscription) throw new Error('Email subscription response was not valid.');
  return subscription;
}

export async function deleteDashboardEmailSubscription(subscriptionId: string): Promise<void> {
  await requestEmailReports(`/api/email-subscriptions/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE'
  });
}

export async function updateDashboardEmailSubscription(
  subscriptionId: string,
  input: UpdateDashboardEmailSubscriptionInput
): Promise<DashboardEmailSubscription> {
  const payload = await requestEmailReports(
    `/api/email-subscriptions/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: 'PUT', body: input }
  );
  const subscription = normalizeSubscription(payload);
  if (!subscription) throw new Error('Email subscription response was not valid.');
  return subscription;
}

export async function sendDashboardEmailTest(subscriptionId: string): Promise<DashboardEmailTestResult> {
  const payload = await requestEmailReports(
    `/api/email-subscriptions/subscriptions/${encodeURIComponent(subscriptionId)}/test`,
    { method: 'POST', body: {} }
  );
  if (!isRecord(payload)) return {};
  return {
    ...(readString(payload.message) ? { message: readString(payload.message) as string } : {}),
    ...(readString(payload.subscriptionId) ? { subscriptionId: readString(payload.subscriptionId) as string } : {})
  };
}

export async function listDashboardEmailDeliveries(subscriptionId: string): Promise<DashboardEmailDelivery[]> {
  const payload = await requestEmailReports(
    `/api/email-subscriptions/subscriptions/${encodeURIComponent(subscriptionId)}/deliveries`
  );
  return extractRecords(payload).map(normalizeDelivery).filter(isPresent);
}

async function requestEmailReports(
  path: string,
  options: { method?: string; body?: JsonBody } = {}
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
    if (!response.ok || !payload.success) throw new Error(readApiError(payload, path, response.status));
    return payload.data;
  }
  if (!response.ok) throw new Error(readRawError(payload, path, response.status));
  return payload;
}

async function parseJson(path: string, response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function extractRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ['subscriptions', 'deliveries', 'items', 'rows', 'data']) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function normalizeSubscription(value: unknown): DashboardEmailSubscription | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const dashboardId = readString(value.dashboardId);
  if (!id || !dashboardId) return null;
  const dashboard = normalizeDashboard(value.dashboard);
  const deliveries = Array.isArray(value.deliveries) ? value.deliveries.map(normalizeDelivery).filter(isPresent) : [];
  return {
    id,
    dashboardId,
    ...(dashboard ? { dashboard } : {}),
    ...(readString(value.name) ? { name: readString(value.name) as string } : {}),
    ...(readString(value.description) ? { description: readString(value.description) as string } : {}),
    recipients: normalizeRecipients(value.recipients),
    ...(isRecord(value.schedule) || typeof value.schedule === 'string' ? { schedule: value.schedule } : {}),
    ...(deliveries.length ? { deliveries } : {}),
    frequency: readFrequency(value.frequency),
    subject: readString(value.subject) ?? readString(value.name) ?? 'Dashboard report',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : String(value.status ?? '').toLowerCase() !== 'paused',
    exportFormats: readExportFormats(value.exportFormats),
    includeIntraqInsights: typeof value.includeIntraqInsights === 'boolean' ? value.includeIntraqInsights : true,
    ...(readString(value.status) ? { status: readString(value.status) as string } : {}),
    ...(readString(value.createdAt) ? { createdAt: readString(value.createdAt) as string } : {}),
    ...(readString(value.updatedAt) ? { updatedAt: readString(value.updatedAt) as string } : {})
  };
}

function normalizeDashboard(value: unknown): DashboardEmailSubscription['dashboard'] | null {
  if (!isRecord(value)) return null;
  return {
    ...(readString(value.id) ? { id: readString(value.id) as string } : {}),
    ...(readString(value.name) ? { name: readString(value.name) as string } : {}),
    ...(readString(value.description) ? { description: readString(value.description) as string } : {})
  };
}

function normalizeDelivery(value: unknown): DashboardEmailDelivery | null {
  if (!isRecord(value)) return null;
  const subscriptionId = readString(value.subscriptionId);
  if (!subscriptionId) return null;
  return {
    id: readString(value.id) ?? `${subscriptionId}-${readString(value.deliveredAt) ?? readString(value.sentAt) ?? 'delivery'}`,
    subscriptionId,
    recipients: normalizeRecipients(value.recipients),
    status: readString(value.status) ?? 'sent',
    ...(readString(value.sentAt) ? { sentAt: readString(value.sentAt) as string } : {}),
    ...(readString(value.deliveredAt) ? { deliveredAt: readString(value.deliveredAt) as string } : {}),
    ...(readString(value.createdAt) ? { createdAt: readString(value.createdAt) as string } : {}),
    ...(readString(value.errorMessage) ? { errorMessage: readString(value.errorMessage) as string } : {})
  };
}

function normalizeRecipients(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.map(item => String(item).trim()).filter(Boolean);
  } catch {
    return parseDashboardEmailRecipients(trimmed);
  }
  return [trimmed];
}

function readFrequency(value: unknown): DashboardEmailReportFrequency {
  return value === 'daily' || value === 'weekly' || value === 'monthly' ? value : 'weekly';
}

function readExportFormats(value: unknown): DashboardEmailExportFormat[] {
  if (!Array.isArray(value)) return ['pdf'];
  const formats = value.filter((item): item is DashboardEmailExportFormat => item === 'pdf' || item === 'excel' || item === 'csv');
  return formats.length ? formats : ['pdf'];
}

function readApiError(payload: ApiResponse<unknown>, path: string, status: number): string {
  if (!payload.success) return payload.error;
  return `Request to ${path} failed with status ${status}.`;
}

function readRawError(payload: unknown, path: string, status: number): string {
  if (isRecord(payload) && typeof payload.error === 'string') return payload.error;
  return `Request to ${path} failed with status ${status}.`;
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

function isPresent<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
