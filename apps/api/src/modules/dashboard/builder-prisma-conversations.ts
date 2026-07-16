import { uuidv7 } from '@intraq/contracts';
import { Prisma, type IntraQPrismaClient } from '@intraq/db';
import {
  builderMetadata,
  normalizeTitle,
  type BuilderConversation,
  type BuilderConversationContext,
  type BuilderConversationMessage,
  type BuilderConversationRepository,
  type BuilderConversationRole,
  type BuilderConversationSnapshot
} from './builder-conversations.js';

const BUILDER_SURFACE = 'dashboard_builder';
const DEFAULT_TENANT_ID = 'tenant-foundation';
const DEFAULT_USER_ID = 'user-foundation-admin';
const MAX_MESSAGES = 50;

type ConversationRecord = Prisma.AIAnalyzerConversationGetPayload<Record<string, never>>;
type MessageRecord = Prisma.AIAnalyzerMessageGetPayload<Record<string, never>>;

export class BuilderPrismaConversationStore implements BuilderConversationRepository {
  constructor(private readonly client: IntraQPrismaClient) {}

  async restore(dashboardId: string, conversationId?: string | null): Promise<BuilderConversationSnapshot | null> {
    const conversation = conversationId
      ? await this.findConversation(dashboardId, conversationId)
      : await this.latestConversation(dashboardId);
    return conversation ? this.snapshot(conversation) : null;
  }

  async create(
    dashboardId: string,
    context: BuilderConversationContext = {},
    conversationId?: string | null
  ): Promise<BuilderConversationSnapshot> {
    const metadata = builderMetadata(dashboardId, context);
    const tenantId = optionalString(metadata.tenantId) ?? DEFAULT_TENANT_ID;
    const userId = optionalString(metadata.userId) ?? DEFAULT_USER_ID;
    const dataSourceId = optionalString(metadata.dataSourceId);
    const record = await this.client.aIAnalyzerConversation.create({
      data: {
        id: optionalString(conversationId) ?? uuidv7(),
        tenantId,
        userId,
        dataSourceId,
        title: normalizeTitle(context.title),
        metadata: toInputJson({
          ...metadata,
          tenantId,
          userId
        })
      }
    });
    return this.snapshot(record);
  }

  async ensure(
    dashboardId: string,
    conversationId?: string | null,
    context: BuilderConversationContext = {}
  ): Promise<BuilderConversationSnapshot> {
    if (conversationId) {
      const existing = await this.findConversation(dashboardId, conversationId);
      if (existing) return this.snapshot(existing);
      return this.create(dashboardId, context, conversationId);
    }
    return await this.restore(dashboardId) ?? this.create(dashboardId, context);
  }

  async appendMessage(
    dashboardId: string,
    conversationId: string,
    role: BuilderConversationRole,
    content: string
  ): Promise<BuilderConversationMessage | null> {
    const trimmedContent = content.trim();
    if (!trimmedContent) return null;
    return this.client.$transaction(async tx => {
      const conversation = await tx.aIAnalyzerConversation.findUnique({ where: { id: conversationId } });
      if (!conversation || !isBuilderConversation(conversation, dashboardId)) return null;
      const metadata = jsonRecord(conversation.metadata);
      const now = new Date();
      const message = await tx.aIAnalyzerMessage.create({
        data: {
          id: uuidv7(),
          conversationId,
          role,
          content: trimmedContent,
          metadata: toInputJson(messageMetadata(metadata)),
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

  async clearSession(dashboardId: string, conversationId: string): Promise<BuilderConversationSnapshot | null> {
    const conversation = await this.findConversation(dashboardId, conversationId);
    if (!conversation) return null;
    await this.client.$transaction(async tx => {
      await tx.aIAnalyzerMessage.deleteMany({ where: { conversationId } });
      await tx.aIAnalyzerConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: null }
      });
    });
    return this.restore(dashboardId, conversationId);
  }

  private async latestConversation(dashboardId: string): Promise<ConversationRecord | null> {
    const records = await this.client.aIAnalyzerConversation.findMany({
      where: { isArchived: false },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }]
    });
    return records.find(record => isBuilderConversation(record, dashboardId)) ?? null;
  }

  private async findConversation(dashboardId: string, conversationId: string): Promise<ConversationRecord | null> {
    const conversation = await this.client.aIAnalyzerConversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.isArchived) return null;
    return isBuilderConversation(conversation, dashboardId) ? conversation : null;
  }

  private async snapshot(conversation: ConversationRecord): Promise<BuilderConversationSnapshot> {
    const messages = await this.client.aIAnalyzerMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    return {
      conversation: toConversation(conversation),
      messages: messages.map(toMessage)
    };
  }
}

async function trimOldMessages(tx: Prisma.TransactionClient, conversationId: string): Promise<void> {
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

function toConversation(record: ConversationRecord): BuilderConversation {
  const metadata = jsonRecord(record.metadata);
  return {
    id: record.id,
    dashboardId: optionalString(metadata.dashboardId) ?? '',
    title: record.title ?? 'Builder conversation',
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    metadata
  };
}

function toMessage(record: MessageRecord): BuilderConversationMessage {
  return {
    id: record.id,
    conversationId: record.conversationId,
    role: isConversationRole(record.role) ? record.role : 'assistant',
    content: record.content,
    createdAt: record.createdAt.toISOString()
  };
}

function isBuilderConversation(record: ConversationRecord, dashboardId: string): boolean {
  const metadata = jsonRecord(record.metadata);
  return metadata.surface === BUILDER_SURFACE && metadata.dashboardId === dashboardId;
}

function messageMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    surface: BUILDER_SURFACE,
    dashboardId: optionalString(metadata.dashboardId),
    ...(optionalString(metadata.dataSourceId) ? { dataSourceId: optionalString(metadata.dataSourceId) } : {}),
    ...(optionalString(metadata.dataSourceTableId) ? { dataSourceTableId: optionalString(metadata.dataSourceTableId) } : {})
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function sanitizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
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

function isConversationRole(value: unknown): value is BuilderConversationRole {
  return value === 'assistant' || value === 'status' || value === 'user';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
