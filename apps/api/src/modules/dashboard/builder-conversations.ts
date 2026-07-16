import { uuidv7 } from '@intraq/contracts';

export type BuilderConversationRole = 'assistant' | 'status' | 'user';

export interface BuilderConversationContext {
  dataSourceId?: string | null;
  dataSourceTableId?: string | null;
  metadata?: Record<string, unknown>;
  title?: string;
}

export interface BuilderConversation {
  id: string;
  dashboardId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface BuilderConversationMessage {
  id: string;
  conversationId: string;
  role: BuilderConversationRole;
  content: string;
  createdAt: string;
}

export interface BuilderConversationSnapshot {
  conversation: BuilderConversation;
  messages: BuilderConversationMessage[];
}

export interface BuilderConversationRepository {
  restore(
    dashboardId: string,
    conversationId?: string | null
  ): BuilderConversationSnapshot | null | Promise<BuilderConversationSnapshot | null>;
  create(
    dashboardId: string,
    context?: BuilderConversationContext,
    conversationId?: string | null
  ): BuilderConversationSnapshot | Promise<BuilderConversationSnapshot>;
  ensure(
    dashboardId: string,
    conversationId?: string | null,
    context?: BuilderConversationContext
  ): BuilderConversationSnapshot | Promise<BuilderConversationSnapshot>;
  appendMessage(
    dashboardId: string,
    conversationId: string,
    role: BuilderConversationRole,
    content: string
  ): BuilderConversationMessage | null | Promise<BuilderConversationMessage | null>;
  clearSession(
    dashboardId: string,
    conversationId: string
  ): BuilderConversationSnapshot | null | Promise<BuilderConversationSnapshot | null>;
}

export class BuilderConversationStore implements BuilderConversationRepository {
  private readonly conversations = new Map<string, BuilderConversation>();
  private readonly messages = new Map<string, BuilderConversationMessage[]>();

  restore(dashboardId: string, conversationId?: string | null): BuilderConversationSnapshot | null {
    const conversation = conversationId
      ? this.findConversation(dashboardId, conversationId)
      : [...this.conversations.values()]
        .filter(item => item.dashboardId === dashboardId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
    return conversation ? this.snapshot(conversation) : null;
  }

  create(
    dashboardId: string,
    context: BuilderConversationContext = {},
    conversationId?: string | null
  ): BuilderConversationSnapshot {
    const now = new Date().toISOString();
    const conversation: BuilderConversation = {
      id: conversationId?.trim() || uuidv7(),
      dashboardId,
      title: normalizeTitle(context.title),
      createdAt: now,
      updatedAt: now,
      metadata: builderMetadata(dashboardId, context)
    };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return this.snapshot(conversation);
  }

  ensure(
    dashboardId: string,
    conversationId?: string | null,
    context: BuilderConversationContext = {}
  ): BuilderConversationSnapshot {
    if (conversationId) {
      const existing = this.findConversation(dashboardId, conversationId);
      if (existing) return this.snapshot(existing);
      return this.create(dashboardId, context, conversationId);
    }
    return this.restore(dashboardId) ?? this.create(dashboardId, context);
  }

  appendMessage(
    dashboardId: string,
    conversationId: string,
    role: BuilderConversationRole,
    content: string
  ): BuilderConversationMessage | null {
    const conversation = this.findConversation(dashboardId, conversationId);
    const trimmedContent = content.trim();
    if (!conversation || !trimmedContent) return null;

    const now = new Date().toISOString();
    const message: BuilderConversationMessage = {
      id: uuidv7(),
      conversationId,
      role,
      content: trimmedContent,
      createdAt: now
    };
    this.messages.set(conversationId, [...(this.messages.get(conversationId) ?? []), message].slice(-50));
    conversation.updatedAt = now;
    this.conversations.set(conversationId, conversation);
    return message;
  }

  clearSession(dashboardId: string, conversationId: string): BuilderConversationSnapshot | null {
    const conversation = this.findConversation(dashboardId, conversationId);
    if (!conversation) return null;
    conversation.updatedAt = new Date().toISOString();
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return this.snapshot(conversation);
  }

  private findConversation(dashboardId: string, conversationId: string): BuilderConversation | null {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.dashboardId !== dashboardId) return null;
    return conversation;
  }

  private snapshot(conversation: BuilderConversation): BuilderConversationSnapshot {
    return {
      conversation: { ...conversation, metadata: { ...conversation.metadata } },
      messages: [...(this.messages.get(conversation.id) ?? [])]
    };
  }
}

export function builderMetadata(
  dashboardId: string,
  context: BuilderConversationContext = {}
): Record<string, unknown> {
  return {
    ...context.metadata,
    dashboardId,
    surface: 'dashboard_builder',
    ...(context.dataSourceId ? { dataSourceId: context.dataSourceId } : {}),
    ...(context.dataSourceTableId ? { dataSourceTableId: context.dataSourceTableId } : {})
  };
}

export function normalizeTitle(title: string | undefined): string {
  return title?.trim().slice(0, 80) || 'Builder conversation';
}
