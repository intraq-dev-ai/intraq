import { isNonEmptyString, isRecord } from './branding-config.js';

export type Frequency = 'daily' | 'weekly' | 'monthly';
export type EmailExportFormat = 'csv' | 'excel' | 'pdf';

export interface EmailSubscription {
  id: string;
  dashboardId: string;
  dashboard?: { id: string; name: string; description: string };
  name?: string;
  description?: string;
  recipients: string[];
  schedule?: Record<string, unknown>;
  status?: string;
  deliveries?: Array<Record<string, unknown>>;
  frequency: Frequency;
  subject: string;
  enabled: boolean;
  exportFormats: EmailExportFormat[];
  includeIntraqInsights: boolean;
  createdAt: string;
  updatedAt: string;
}

export const fixedNow = '2026-05-02T00:00:00.000Z';

export function readRecipients(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.recipients)) return [];
  return body.recipients.filter(isNonEmptyString).map(recipient => recipient.trim());
}

export function readFrequency(value: unknown): Frequency {
  return value === 'daily' || value === 'weekly' || value === 'monthly' ? value : 'weekly';
}

export function readExportFormats(body: unknown): EmailExportFormat[] {
  if (!isRecord(body) || !Array.isArray(body.exportFormats)) return ['pdf'];
  const formats = body.exportFormats.filter((item): item is EmailExportFormat => item === 'pdf' || item === 'excel' || item === 'csv');
  return formats.length ? formats : ['pdf'];
}

export function readIncludeIntraqInsights(body: unknown): boolean {
  return !isRecord(body) || !('includeIntraqInsights' in body) ? true : Boolean(body.includeIntraqInsights);
}

export function readSubscriptionStatus(body: unknown): string {
  if (isRecord(body) && isNonEmptyString(body.status)) return body.status.trim();
  return isRecord(body) && body.enabled === false ? 'paused' : 'active';
}
