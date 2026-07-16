import { uuidv7 } from '@intraq/contracts';
import { Prisma, type IntraQPrismaClient } from '@intraq/db';
import type {
  SqlAssistantConversation,
  SqlAssistantConversationMessage,
  SqlAssistantConversationRepository,
  SqlAssistantConversationRole,
  SqlAssistantConversationSnapshot
} from './sql-assistant-conversations.js';

const SQL_ASSISTANT_SURFACE = 'sql_editor';
const DEFAULT_TENANT_ID = 'tenant-foundation';
const DEFAULT_USER_ID = 'user-foundation-admin';
const MAX_MESSAGES = 50;

type ConversationRecord = Prisma.AIAnalyzerConversationGetPayload<Record<string, never>>;
type MessageRecord = Prisma.AIAnalyzerMessageGetPayload<Record<string, never>>;

export class SqlAssistantPrismaConversationStore implements SqlAssistantConversationRepository {
  constructor(private readonly client: IntraQPrismaClient) {}

  async restore(
    dataSourceId: string,
    conversationId?: string | null
  ): Promise<SqlAssistantConversationSnapshot | null> {
    const conversation = conversationId
      ? await this.findConversation(dataSourceId, conversationId)
      : await this.latestConversation(dataSourceId);
    return conversation ? this.snapshot(conversation) : null;
  }

  async create(
    dataSourceId: string,
    title = 'SQL conversation',
    metadata: Record<string, unknown> = {},
    conversationId?: string | null
  ): Promise<SqlAssistantConversationSnapshot> {
    const tenantId = optionalString(metadata.tenantId) ?? DEFAULT_TENANT_ID;
    const userId = optionalString(metadata.userId) ?? DEFAULT_USER_ID;
    const record = await this.client.aIAnalyzerConversation.create({
      data: {
        id: optionalString(conversationId) ?? uuidv7(),
        tenantId,
        userId,
        dataSourceId,
        title: title.trim().slice(0, 80) || 'SQL conversation',
        metadata: toInputJson({
          ...metadata,
          tenantId,
          userId,
          dataSourceId,
          surface: SQL_ASSISTANT_SURFACE
        })
      }
    });
    return this.snapshot(record);
  }

  async ensure(
    dataSourceId: string,
    conversationId?: string | null,
    title = 'SQL conversation',
    metadata: Record<string, unknown> = {}
  ): Promise<SqlAssistantConversationSnapshot> {
    if (conversationId) {
      const existing = await this.findConversation(dataSourceId, conversationId);
      if (existing) return this.snapshot(existing);
      return this.create(dataSourceId, title, metadata, conversationId);
    }
    return await this.restore(dataSourceId) ?? this.create(dataSourceId, title, metadata);
  }

  async appendMessage(
    dataSourceId: string,
    conversationId: string,
    role: SqlAssistantConversationRole,
    content: string
  ): Promise<SqlAssistantConversationMessage | null> {
    const trimmedContent = content.trim();
    if (!trimmedContent) return null;
    return this.client.$transaction(async tx => {
      const conversation = await tx.aIAnalyzerConversation.findUnique({ where: { id: conversationId } });
      if (!conversation || conversation.dataSourceId !== dataSourceId || !isSqlAssistantConversation(conversation)) {
        return null;
      }
      const now = new Date();
      const message = await tx.aIAnalyzerMessage.create({
        data: {
          id: uuidv7(),
          conversationId,
          role,
          content: trimmedContent,
          metadata: toInputJson({ surface: SQL_ASSISTANT_SURFACE, dataSourceId }),
          createdAt: now
        }
      });
      await tx.aIAnalyzerConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now }
      });
      await trimOldMessages(tx, conversationId);
      return toMessage(message);
    });
  }

  async clearSession(dataSourceId: string, conversationId: string): Promise<SqlAssistantConversationSnapshot | null> {
    const conversation = await this.findConversation(dataSourceId, conversationId);
    if (!conversation) return null;
    await this.client.$transaction(async tx => {
      await tx.aIAnalyzerMessage.deleteMany({ where: { conversationId } });
      await tx.aIAnalyzerConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: null }
      });
    });
    return this.restore(dataSourceId, conversationId);
  }

  private async latestConversation(dataSourceId: string): Promise<ConversationRecord | null> {
    const records = await this.client.aIAnalyzerConversation.findMany({
      where: {
        dataSourceId,
        isArchived: false
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }]
    });
    return records.find(isSqlAssistantConversation) ?? null;
  }

  private async findConversation(dataSourceId: string, conversationId: string): Promise<ConversationRecord | null> {
    const conversation = await this.client.aIAnalyzerConversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.dataSourceId !== dataSourceId || conversation.isArchived) return null;
    return isSqlAssistantConversation(conversation) ? conversation : null;
  }

  private async snapshot(conversation: ConversationRecord): Promise<SqlAssistantConversationSnapshot> {
    const messages = await this.client.aIAnalyzerMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' }
    });
    return {
      conversation: toConversation(conversation),
      messages: messages.map(toMessage)
    };
  }
}

async function trimOldMessages(
  tx: Prisma.TransactionClient,
  conversationId: string
): Promise<void> {
  const oldMessages = await tx.aIAnalyzerMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    skip: MAX_MESSAGES,
    select: { id: true }
  });
  if (oldMessages.length > 0) {
    await tx.aIAnalyzerMessage.deleteMany({ where: { id: { in: oldMessages.map(message => message.id) } } });
  }
}

function toConversation(record: ConversationRecord): SqlAssistantConversation {
  return {
    id: record.id,
    dataSourceId: record.dataSourceId ?? '',
    title: record.title ?? 'SQL conversation',
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    metadata: jsonRecord(record.metadata)
  };
}

function toMessage(record: MessageRecord): SqlAssistantConversationMessage {
  return {
    id: record.id,
    conversationId: record.conversationId,
    role: isConversationRole(record.role) ? record.role : 'assistant',
    content: record.content,
    createdAt: record.createdAt.toISOString()
  };
}

function isSqlAssistantConversation(record: ConversationRecord): boolean {
  return jsonRecord(record.metadata).surface === SQL_ASSISTANT_SURFACE;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
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

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isConversationRole(value: unknown): value is SqlAssistantConversationRole {
  return value === 'assistant' || value === 'status' || value === 'user';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
