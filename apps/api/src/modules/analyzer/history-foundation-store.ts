import { uuidv7, type ConfirmedAnalyzerBusinessScope } from '@intraq/contracts';
import {
  mergeAnalyzerConversationClientMetadata,
  sanitizeAnalyzerConversationClientMetadata
} from './analyzer-conversation-metadata.js';

export type ConversationSurface = 'analyzer' | 'builder';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface AnalyzerHistoryConversation {
  id: string;
  title: string;
  surface: ConversationSurface;
  dataSourceId: string | null;
  metadata: Record<string, unknown>;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface AnalyzerHistoryMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AnalyzerHistoryAccess {
  tenantId: string;
  userId: string;
}

export const analyzerFoundationHistoryAccess: AnalyzerHistoryAccess = {
  tenantId: 'tenant-foundation',
  userId: 'user-foundation-admin'
};

export interface ConversationListOptions {
  limit?: number;
}

export type ConversationCreateRequest = {
  title: string;
  dataSourceId: string | null;
  metadata: Record<string, unknown>;
};

export type ConversationUpdateRequest = {
  title?: string | null;
  dataSourceId?: string | null;
  metadata?: Record<string, unknown>;
  isArchived?: boolean;
  businessScope?: ConfirmedAnalyzerBusinessScope;
};

export type MessageCreateRequest = {
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
};

export interface AnalyzerHistoryStore {
  listConversations(
    surface: ConversationSurface,
    dataSourceId: string,
    options: ConversationListOptions,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation[] | Promise<AnalyzerHistoryConversation[]>;
  getConversation(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation | null | Promise<AnalyzerHistoryConversation | null>;
  createConversation(
    request: ConversationCreateRequest,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation | Promise<AnalyzerHistoryConversation>;
  updateConversation(
    conversationId: string,
    surface: ConversationSurface,
    request: ConversationUpdateRequest,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation | null | Promise<AnalyzerHistoryConversation | null>;
  deleteConversation(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): boolean | Promise<boolean>;
  listMessages(
    conversationId: string,
    surface: ConversationSurface | null,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryMessage[] | null | Promise<AnalyzerHistoryMessage[] | null>;
  createMessage(
    conversationId: string,
    surface: ConversationSurface | null,
    request: MessageCreateRequest,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryMessage | null | Promise<AnalyzerHistoryMessage | null>;
  clearSession(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
}

export class AnalyzerHistoryFoundationStore implements AnalyzerHistoryStore {
  private conversations = new Map<string, AnalyzerHistoryConversation>();
  private messages = new Map<string, AnalyzerHistoryMessage[]>();
  private owners = new Map<string, AnalyzerHistoryAccess>();
  private clockTick = 0;

  listConversations(
    surface: ConversationSurface,
    dataSourceId: string,
    options: ConversationListOptions,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation[] {
    return Array.from(this.conversations.values())
      .filter(conversation => conversation.surface === surface)
      .filter(conversation => accessMatches(this.owners.get(conversation.id), access))
      .filter(conversation => !conversation.isArchived)
      .filter(conversation => !dataSourceId || conversation.dataSourceId === dataSourceId)
      .sort((left, right) => sortNewestFirst(left, right))
      .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  }

  getConversation(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation | null {
    return this.findConversation(conversationId, surface, access);
  }

  createConversation(
    request: ConversationCreateRequest,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation {
    const now = this.nextTimestamp();
    const metadata = applySurfaceMetadata(request.metadata, surface, request.dataSourceId);
    const conversation: AnalyzerHistoryConversation = {
      id: uuidv7(),
      title: request.title,
      surface,
      dataSourceId: request.dataSourceId,
      metadata,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null
    };

    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    this.owners.set(conversation.id, { ...access });
    return conversation;
  }

  updateConversation(
    conversationId: string,
    surface: ConversationSurface,
    request: ConversationUpdateRequest,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation | null {
    const conversation = this.findConversation(conversationId, surface, access);
    if (!conversation) return null;

    const dataSourceId =
      request.dataSourceId === undefined ? conversation.dataSourceId : request.dataSourceId;
    const metadata = request.metadata === undefined
      ? { ...conversation.metadata }
      : mergeAnalyzerConversationClientMetadata(conversation.metadata, request.metadata);
    if (request.businessScope) metadata.businessScope = request.businessScope;
    if (request.dataSourceId !== undefined && dataSourceId === null) {
      delete metadata.dataSourceId;
    }

    if (request.title !== undefined) {
      conversation.title = request.title?.trim() || 'Conversation';
    }
    if (request.isArchived !== undefined) {
      conversation.isArchived = request.isArchived;
    }
    if (request.dataSourceId !== undefined) {
      conversation.dataSourceId = dataSourceId;
    }

    conversation.metadata = applySurfaceMetadata(metadata, surface, dataSourceId);
    conversation.updatedAt = this.nextTimestamp();
    return conversation;
  }

  deleteConversation(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): boolean {
    if (!this.findConversation(conversationId, surface, access)) return false;

    this.conversations.delete(conversationId);
    this.messages.delete(conversationId);
    this.owners.delete(conversationId);
    return true;
  }

  listMessages(
    conversationId: string,
    surface: ConversationSurface | null,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryMessage[] | null {
    if (!this.findConversation(conversationId, surface, access)) return null;
    return this.messages.get(conversationId) ?? [];
  }

  createMessage(
    conversationId: string,
    surface: ConversationSurface | null,
    request: MessageCreateRequest,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryMessage | null {
    const conversation = this.findConversation(conversationId, surface, access);
    if (!conversation) return null;

    const now = this.nextTimestamp();
    const message: AnalyzerHistoryMessage = {
      id: uuidv7(),
      conversationId,
      role: request.role,
      content: request.content,
      metadata: applySurfaceToMessageMetadata(request.metadata, conversation.surface),
      createdAt: now
    };

    this.messages.set(conversationId, [...(this.messages.get(conversationId) ?? []), message]);
    conversation.updatedAt = now;
    conversation.lastMessageAt = now;
    conversation.metadata = updateMemory(conversation.metadata, message);
    return message;
  }

  clearSession(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): Record<string, unknown> | null {
    const conversation = this.findConversation(conversationId, surface, access);
    if (!conversation) return null;

    const now = this.nextTimestamp();
    const codexSession = {
      provider: 'codex',
      threadId: null,
      status: 'cleared',
      clearedAt: now
    };
    conversation.metadata = {
      ...conversation.metadata,
      codexSession
    };
    conversation.updatedAt = now;
    return codexSession;
  }

  private findConversation(
    conversationId: string,
    surface: ConversationSurface | null,
    access: AnalyzerHistoryAccess
  ): AnalyzerHistoryConversation | null {
    const conversation = this.conversations.get(conversationId);
    if (
      !conversation
      || (surface && conversation.surface !== surface)
      || !accessMatches(this.owners.get(conversationId), access)
    ) return null;
    return conversation;
  }

  private nextTimestamp(): string {
    const date = new Date(Date.UTC(2026, 0, 1, 0, 0, this.clockTick));
    this.clockTick += 1;
    return date.toISOString();
  }
}

export const analyzerHistoryFoundationStore = new AnalyzerHistoryFoundationStore();

export function parseConversationCreateRequest(input: unknown): ConversationCreateRequest | null {
  if (!isRecord(input)) return null;
  if (!optionalString(input.title, 500)) return null;
  if (!optionalNullableString(input.dataSourceId, 500)) return null;
  if (input.metadata !== undefined && !isRecord(input.metadata)) return null;

  return {
    title: typeof input.title === 'string' ? input.title.trim() || 'New conversation' : 'New conversation',
    dataSourceId: typeof input.dataSourceId === 'string' ? input.dataSourceId.trim() || null : null,
    metadata: isRecord(input.metadata) ? sanitizeAnalyzerConversationClientMetadata(input.metadata) : {}
  };
}

export function parseConversationUpdateRequest(input: unknown): ConversationUpdateRequest | null {
  if (!isRecord(input)) return null;
  if (!optionalNullableString(input.title, 500)) return null;
  if (!optionalNullableString(input.dataSourceId, 500)) return null;
  if (input.metadata !== undefined && !isRecord(input.metadata)) return null;
  if (input.isArchived !== undefined && typeof input.isArchived !== 'boolean') return null;

  return {
    ...(input.title !== undefined ? { title: normalizeNullableString(input.title) } : {}),
    ...(input.dataSourceId !== undefined ? { dataSourceId: normalizeNullableString(input.dataSourceId) } : {}),
    ...(isRecord(input.metadata) ? { metadata: sanitizeAnalyzerConversationClientMetadata(input.metadata) } : {}),
    ...(typeof input.isArchived === 'boolean' ? { isArchived: input.isArchived } : {})
  };
}

export function parseMessageCreateRequest(input: unknown): MessageCreateRequest | null {
  if (!isRecord(input)) return null;
  if (!isMessageRole(input.role)) return null;
  if (!isNonEmptyString(input.content) || input.content.length > 10_000) return null;
  if (input.metadata !== undefined && input.metadata !== null && !isRecord(input.metadata)) return null;

  return {
    role: input.role,
    content: input.content.trim(),
    metadata: isRecord(input.metadata) ? { ...input.metadata } : null
  };
}

function applySurfaceMetadata(
  metadata: Record<string, unknown>,
  surface: ConversationSurface,
  dataSourceId: string | null
): Record<string, unknown> {
  return {
    ...withoutAuthMetadata(metadata),
    surface,
    ...(dataSourceId ? { dataSourceId } : {})
  };
}

function withoutAuthMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...metadata };
  delete sanitized.tenantId;
  delete sanitized.userId;
  return sanitized;
}

function accessMatches(owner: AnalyzerHistoryAccess | undefined, access: AnalyzerHistoryAccess): boolean {
  return owner?.tenantId === access.tenantId && owner.userId === access.userId;
}

function applySurfaceToMessageMetadata(
  metadata: Record<string, unknown> | null,
  surface: ConversationSurface
): Record<string, unknown> {
  return metadata ? { ...withoutAuthMetadata(metadata), surface } : { surface };
}

function updateMemory(
  metadata: Record<string, unknown>,
  message: AnalyzerHistoryMessage
): Record<string, unknown> {
  const memoryTurns = Array.isArray(metadata.memoryTurns) ? metadata.memoryTurns : [];
  return {
    ...metadata,
    memoryTurns: [
      ...memoryTurns,
      { role: message.role, gist: `${message.role}: ${message.content.slice(0, 240)}`, at: message.createdAt }
    ].slice(-8)
  };
}

function sortNewestFirst(left: AnalyzerHistoryConversation, right: AnalyzerHistoryConversation): number {
  return (right.lastMessageAt ?? right.updatedAt).localeCompare(left.lastMessageAt ?? left.updatedAt);
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMessageRole(value: unknown): value is MessageRole {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function optionalString(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function optionalNullableString(value: unknown, maxLength: number): boolean {
  return value === null || optionalString(value, maxLength);
}
