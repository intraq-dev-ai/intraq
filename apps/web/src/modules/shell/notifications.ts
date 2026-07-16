export interface ShellNotification {
  body: string;
  channel: string;
  createdAt: string;
  id: string;
  sentAt: string;
  status: string;
  title: string;
}

const READ_STORAGE_KEY = 'intraq.shell.notifications.read.v1';

export async function fetchShellNotifications(fetchFn: typeof fetch = fetch): Promise<ShellNotification[]> {
  const response = await fetchFn('/api/admin/notifications', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Notifications request failed with status ${response.status}.`);
  return normalizeShellNotifications(await response.json());
}

export function normalizeShellNotifications(payload: unknown): ShellNotification[] {
  return extractRecords(payload)
    .map((record, index) => notificationFromRecord(record, index))
    .filter((item): item is ShellNotification => item !== null)
    .sort((left, right) => notificationTimestamp(right) - notificationTimestamp(left));
}

export function unreadNotificationCount(notifications: ShellNotification[], readIds: Set<string>): number {
  return notifications.filter(notification => !readIds.has(notification.id)).length;
}

export function readNotificationIds(storage: Pick<Storage, 'getItem'>): Set<string> {
  try {
    const parsed = JSON.parse(storage.getItem(READ_STORAGE_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(parsed) ? parsed.flatMap(item => typeof item === 'string' ? [item] : []) : []);
  } catch {
    return new Set();
  }
}

export function writeNotificationIds(storage: Pick<Storage, 'setItem'>, ids: Set<string>): void {
  storage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

function extractRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.data)) return payload.data.filter(isRecord);
  if (Array.isArray(payload.notifications)) return payload.notifications.filter(isRecord);
  if (Array.isArray(payload.records)) return payload.records.filter(isRecord);
  return [];
}

function notificationFromRecord(record: Record<string, unknown>, index: number): ShellNotification | null {
  const title = readString(record.title) ?? readString(record.name) ?? readString(record.subject);
  if (!title) return null;
  return {
    body: readString(record.body) ?? readString(record.message) ?? readString(record.description) ?? '',
    channel: readString(record.channel) ?? 'in-app',
    createdAt: readString(record.createdAt) ?? '',
    id: readString(record.id) ?? `notification-${index}`,
    sentAt: readString(record.sentAt) ?? '',
    status: readString(record.status) ?? 'unread',
    title
  };
}

function notificationTimestamp(notification: ShellNotification): number {
  const value = notification.sentAt || notification.createdAt;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
