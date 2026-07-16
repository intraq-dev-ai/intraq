const STORAGE_KEY = 'intraq.sql-editor.assistant.sessions.v1';

export interface SqlAssistantMessage {
  id: string;
  role: 'assistant' | 'status' | 'user';
  content: string;
  createdAt: string;
}

export interface SqlAssistantDurableSession {
  conversationId: string;
  messages: SqlAssistantMessage[];
  response: string;
}

interface StorageAdapter {
  getItem(key: string): string | null;
  removeItem?(key: string): void;
  setItem(key: string, value: string): void;
}

export function emptySqlAssistantDurableSession(): SqlAssistantDurableSession {
  return {
    conversationId: '',
    messages: [],
    response: ''
  };
}

export function readSqlAssistantDurableSession(
  dataSourceId: string,
  storage: StorageAdapter | null = browserStorage()
): SqlAssistantDurableSession {
  const id = dataSourceId.trim();
  if (!id || !storage) return emptySqlAssistantDurableSession();

  try {
    const root = parseRoot(storage.getItem(STORAGE_KEY));
    return normalizeSession(root[id]);
  } catch {
    return emptySqlAssistantDurableSession();
  }
}

export function writeSqlAssistantDurableSession(
  dataSourceId: string,
  session: SqlAssistantDurableSession,
  storage: StorageAdapter | null = browserStorage()
): void {
  const id = dataSourceId.trim();
  if (!id || !storage) return;

  const root = parseRoot(storage.getItem(STORAGE_KEY));
  root[id] = {
    conversationId: session.conversationId,
    messages: session.messages.slice(-20),
    response: session.response
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(root));
}

export function clearSqlAssistantDurableSession(
  dataSourceId: string,
  storage: StorageAdapter | null = browserStorage()
): void {
  const id = dataSourceId.trim();
  if (!id || !storage) return;

  const root = parseRoot(storage.getItem(STORAGE_KEY));
  delete root[id];
  if (Object.keys(root).length === 0 && storage.removeItem) {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(root));
}

function browserStorage(): StorageAdapter | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function parseRoot(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeSession(value: unknown): SqlAssistantDurableSession {
  if (!isRecord(value)) return emptySqlAssistantDurableSession();
  const messages = normalizeMessages(value.messages);
  const storedResponse = readString(value.response);
  return {
    conversationId: readString(value.conversationId) ?? '',
    messages,
    response: storedResponse ?? latestAssistantResponse(messages)
  };
}

function normalizeMessages(value: unknown): SqlAssistantMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const id = readString(item.id);
    const content = readString(item.content);
    const createdAt = readString(item.createdAt);
    const role = normalizeRole(item.role);
    if (!id || !content || !createdAt || !role) return [];
    return [{ id, role, content, createdAt }];
  }).slice(-20);
}

function normalizeRole(value: unknown): SqlAssistantMessage['role'] | null {
  if (value === 'assistant' || value === 'status' || value === 'user') return value;
  return null;
}

function latestAssistantResponse(messages: SqlAssistantMessage[]): string {
  return [...messages].reverse().find(message => message.role === 'assistant')?.content ?? '';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
