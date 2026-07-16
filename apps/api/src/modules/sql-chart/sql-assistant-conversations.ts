import { uuidv7 } from '@intraq/contracts';

export type SqlAssistantConversationRole = 'assistant' | 'status' | 'user';

export interface SqlAssistantConversation {
  id: string;
  dataSourceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface SqlAssistantConversationMessage {
  id: string;
  conversationId: string;
  role: SqlAssistantConversationRole;
  content: string;
  createdAt: string;
}

export interface SqlAssistantConversationSnapshot {
  conversation: SqlAssistantConversation;
  messages: SqlAssistantConversationMessage[];
}

export interface SqlAssistantConversationRepository {
  restore(
    dataSourceId: string,
    conversationId?: string | null
  ): SqlAssistantConversationSnapshot | null | Promise<SqlAssistantConversationSnapshot | null>;
  create(
    dataSourceId: string,
    title?: string,
    metadata?: Record<string, unknown>,
    conversationId?: string | null
  ): SqlAssistantConversationSnapshot | Promise<SqlAssistantConversationSnapshot>;
  ensure(
    dataSourceId: string,
    conversationId?: string | null,
    title?: string,
    metadata?: Record<string, unknown>
  ): SqlAssistantConversationSnapshot | Promise<SqlAssistantConversationSnapshot>;
  appendMessage(
    dataSourceId: string,
    conversationId: string,
    role: SqlAssistantConversationRole,
    content: string
  ): SqlAssistantConversationMessage | null | Promise<SqlAssistantConversationMessage | null>;
  clearSession(
    dataSourceId: string,
    conversationId: string
  ): SqlAssistantConversationSnapshot | null | Promise<SqlAssistantConversationSnapshot | null>;
}

export class SqlAssistantConversationStore implements SqlAssistantConversationRepository {
  private readonly conversations = new Map<string, SqlAssistantConversation>();
  private readonly messages = new Map<string, SqlAssistantConversationMessage[]>();

  restore(dataSourceId: string, conversationId?: string | null): SqlAssistantConversationSnapshot | null {
    const conversation = conversationId
      ? this.findConversation(dataSourceId, conversationId)
      : [...this.conversations.values()]
        .filter(item => item.dataSourceId === dataSourceId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
    return conversation ? this.snapshot(conversation) : null;
  }

  create(
    dataSourceId: string,
    title = 'SQL conversation',
    metadata: Record<string, unknown> = {},
    conversationId?: string | null
  ): SqlAssistantConversationSnapshot {
    const now = new Date().toISOString();
    const conversation: SqlAssistantConversation = {
      id: conversationId?.trim() || uuidv7(),
      dataSourceId,
      title: title.trim().slice(0, 80) || 'SQL conversation',
      createdAt: now,
      updatedAt: now,
      metadata
    };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return this.snapshot(conversation);
  }

  ensure(
    dataSourceId: string,
    conversationId?: string | null,
    title = 'SQL conversation',
    metadata: Record<string, unknown> = {}
  ): SqlAssistantConversationSnapshot {
    if (conversationId) {
      const existing = this.findConversation(dataSourceId, conversationId);
      if (existing) return this.snapshot(existing);
      return this.create(dataSourceId, title, metadata, conversationId);
    }
    return this.restore(dataSourceId) ?? this.create(dataSourceId, title, metadata);
  }

  appendMessage(
    dataSourceId: string,
    conversationId: string,
    role: SqlAssistantConversationRole,
    content: string
  ): SqlAssistantConversationMessage | null {
    const conversation = this.findConversation(dataSourceId, conversationId);
    const trimmedContent = content.trim();
    if (!conversation || !trimmedContent) return null;

    const now = new Date().toISOString();
    const message: SqlAssistantConversationMessage = {
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

  clearSession(dataSourceId: string, conversationId: string): SqlAssistantConversationSnapshot | null {
    const conversation = this.findConversation(dataSourceId, conversationId);
    if (!conversation) return null;
    conversation.updatedAt = new Date().toISOString();
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return this.snapshot(conversation);
  }

  private findConversation(dataSourceId: string, conversationId: string): SqlAssistantConversation | null {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.dataSourceId !== dataSourceId) return null;
    return conversation;
  }

  private snapshot(conversation: SqlAssistantConversation): SqlAssistantConversationSnapshot {
    return {
      conversation: { ...conversation, metadata: { ...conversation.metadata } },
      messages: [...(this.messages.get(conversation.id) ?? [])]
    };
  }
}
