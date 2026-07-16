import { uuidv7 } from '@intraq/contracts';
import { Prisma, type IntraQPrismaClient } from '@intraq/db';
import {
  type AnalyzerHistoryConversation,
  type AnalyzerHistoryAccess,
  type AnalyzerHistoryMessage,
  type AnalyzerHistoryStore,
  type ConversationListOptions,
  type ConversationCreateRequest,
  type ConversationSurface,
  type ConversationUpdateRequest,
  type MessageCreateRequest
} from './history-foundation-store.js';
import { mergeAnalyzerConversationClientMetadata } from './analyzer-conversation-metadata.js';

type ConversationRecord = Prisma.AIAnalyzerConversationGetPayload<Record<string, never>>;
type MessageRecord = Prisma.AIAnalyzerMessageGetPayload<Record<string, never>>;

export class AnalyzerPrismaHistoryStore implements AnalyzerHistoryStore {
  constructor(private readonly client: IntraQPrismaClient) {}

  async listConversations(
    surface: ConversationSurface,
    dataSourceId: string,
    options: ConversationListOptions,
    access: AnalyzerHistoryAccess
  ): Promise<AnalyzerHistoryConversation[]> {
    const records = await this.client.aIAnalyzerConversation.findMany({
      where: {
        isArchived: false,
        tenantId: access.tenantId,
        userId: access.userId,
        ...(dataSourceId ? { dataSourceId } : {})
      },
      orderBy: [{ updatedAt: 'desc' }]
    });
    return records
      .filter(record => surfaceMatches(record, surface))
      .sort(sortNewestFirst)
      .slice(0, options.limit ?? Number.POSITIVE_INFINITY)
      .map(toConversation);
  }

  async getConversation(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): Promise<AnalyzerHistoryConversation | null> {
    const record = await this.findConversation(conversationId, surface, access);
    return record ? toConversation(record) : null;
  }

  async createConversation(
    request: ConversationCreateRequest,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): Promise<AnalyzerHistoryConversation> {
    const metadata = applySurfaceMetadata(request.metadata, surface, request.dataSourceId);
    const record = await this.client.aIAnalyzerConversation.create({
      data: {
        id: uuidv7(),
        tenantId: access.tenantId,
        userId: access.userId,
        dataSourceId: request.dataSourceId,
        title: request.title,
        metadata: toInputJson(metadata)
      }
    });
    return toConversation(record);
  }

  async updateConversation(
    conversationId: string,
    surface: ConversationSurface,
    request: ConversationUpdateRequest,
    access: AnalyzerHistoryAccess
  ): Promise<AnalyzerHistoryConversation | null> {
    const existing = await this.findConversation(conversationId, surface, access);
    if (!existing) return null;

    const nextDataSourceId =
      request.dataSourceId === undefined ? existing.dataSourceId : request.dataSourceId;
    const baseMetadata = request.metadata === undefined
      ? jsonRecord(existing.metadata)
      : mergeAnalyzerConversationClientMetadata(jsonRecord(existing.metadata), request.metadata);
    if (request.businessScope) baseMetadata.businessScope = request.businessScope;
    if (request.dataSourceId !== undefined && nextDataSourceId === null) delete baseMetadata.dataSourceId;

    const data: Prisma.AIAnalyzerConversationUncheckedUpdateInput = {
      metadata: toInputJson(applySurfaceMetadata(
        baseMetadata,
        surface,
        nextDataSourceId
      ))
    };
    if (request.title !== undefined) data.title = request.title?.trim() || 'Conversation';
    if (request.isArchived !== undefined) data.isArchived = request.isArchived;
    if (request.dataSourceId !== undefined) data.dataSourceId = nextDataSourceId;

    const updated = await this.client.aIAnalyzerConversation.update({ where: { id: conversationId }, data });
    return toConversation(updated);
  }

  async deleteConversation(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): Promise<boolean> {
    if (!await this.findConversation(conversationId, surface, access)) return false;
    await this.client.aIAnalyzerConversation.delete({ where: { id: conversationId } });
    return true;
  }

  async listMessages(
    conversationId: string,
    surface: ConversationSurface | null,
    access: AnalyzerHistoryAccess
  ): Promise<AnalyzerHistoryMessage[] | null> {
    if (!await this.findConversation(conversationId, surface, access)) return null;
    const records = await this.client.aIAnalyzerMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });
    return records.map(toMessage);
  }

  async createMessage(
    conversationId: string,
    surface: ConversationSurface | null,
    request: MessageCreateRequest,
    access: AnalyzerHistoryAccess
  ): Promise<AnalyzerHistoryMessage | null> {
    return this.client.$transaction(async tx => {
      const conversation = await tx.aIAnalyzerConversation.findUnique({ where: { id: conversationId } });
      if (!conversation || !surfaceMatches(conversation, surface) || !recordAccessMatches(conversation, access)) return null;

      const messageMetadata = applySurfaceToMessageMetadata(request.metadata, recordSurface(conversation));
      const createdAt = new Date();
      const message = await tx.aIAnalyzerMessage.create({
        data: {
          id: uuidv7(),
          conversationId,
          role: request.role,
          content: request.content,
          metadata: toNullableInputJson(messageMetadata),
          createdAt
        }
      });
      const conversationMetadata = updateMemory(withoutAuthMetadata(jsonRecord(conversation.metadata)), toMessage(message));
      await tx.aIAnalyzerConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: createdAt,
          metadata: toInputJson(conversationMetadata)
        }
      });
      return toMessage(message);
    });
  }

  async clearSession(
    conversationId: string,
    surface: ConversationSurface,
    access: AnalyzerHistoryAccess
  ): Promise<Record<string, unknown> | null> {
    const conversation = await this.findConversation(conversationId, surface, access);
    if (!conversation) return null;

    const now = new Date().toISOString();
    const codexSession = {
      provider: 'codex',
      threadId: null,
      status: 'cleared',
      clearedAt: now
    };
    await this.client.aIAnalyzerConversation.update({
      where: { id: conversationId },
      data: {
        metadata: toInputJson({
          ...withoutAuthMetadata(jsonRecord(conversation.metadata)),
          codexSession
        })
      }
    });
    return codexSession;
  }

  private async findConversation(
    conversationId: string,
    surface: ConversationSurface | null,
    access: AnalyzerHistoryAccess
  ): Promise<ConversationRecord | null> {
    const record = await this.client.aIAnalyzerConversation.findUnique({ where: { id: conversationId } });
    return record && surfaceMatches(record, surface) && recordAccessMatches(record, access) ? record : null;
  }
}

function toConversation(record: ConversationRecord): AnalyzerHistoryConversation {
  return {
    id: record.id,
    title: record.title ?? 'Conversation',
    surface: recordSurface(record),
    dataSourceId: record.dataSourceId,
    metadata: withoutAuthMetadata(jsonRecord(record.metadata)),
    isArchived: record.isArchived,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastMessageAt: record.lastMessageAt?.toISOString() ?? null
  };
}

function toMessage(record: MessageRecord): AnalyzerHistoryMessage {
  return {
    id: record.id,
    conversationId: record.conversationId,
    role: isMessageRole(record.role) ? record.role : 'assistant',
    content: record.content,
    metadata: record.metadata === null ? null : withoutAuthMetadata(jsonRecord(record.metadata)),
    createdAt: record.createdAt.toISOString()
  };
}

function sortNewestFirst(left: ConversationRecord, right: ConversationRecord): number {
  return conversationActivityTime(right) - conversationActivityTime(left);
}

function conversationActivityTime(record: ConversationRecord): number {
  return (record.lastMessageAt ?? record.updatedAt ?? record.createdAt).getTime();
}

function surfaceMatches(record: ConversationRecord, surface: ConversationSurface | null): boolean {
  return surface === null || recordSurface(record) === surface;
}

function recordSurface(record: ConversationRecord): ConversationSurface {
  const value = jsonRecord(record.metadata).surface;
  return value === 'builder' ? 'builder' : 'analyzer';
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

function applySurfaceToMessageMetadata(
  metadata: Record<string, unknown> | null,
  surface: ConversationSurface
): Record<string, unknown> {
  return metadata ? { ...withoutAuthMetadata(metadata), surface } : { surface };
}

function withoutAuthMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...metadata };
  delete sanitized.tenantId;
  delete sanitized.userId;
  return sanitized;
}

function recordAccessMatches(record: ConversationRecord, access: AnalyzerHistoryAccess): boolean {
  return record.tenantId === access.tenantId && record.userId === access.userId;
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

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function toNullableInputJson(value: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return toInputJson(value);
}

function sanitizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)]));
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]));
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]));
}

function isMessageRole(value: unknown): value is AnalyzerHistoryMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
