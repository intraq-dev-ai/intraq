import { uuidv7 } from '@intraq/contracts';

export type AgentThreadStatus = 'idle' | 'running' | 'error';

export interface AgentThreadMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface AgentThread {
  id: string;
  messages: AgentThreadMessage[];
  status: AgentThreadStatus;
  createdAt: string;
  updatedAt: string;
  summary?: string;
}

export interface AgentThreadSummary {
  id: string;
  status: AgentThreadStatus;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AgentThreadRunRequest {
  message: string;
  model?: string;
  dataSourceId?: string;
  dataSourceName?: string;
}

export interface AgentThreadRunResult {
  thread: AgentThread;
  response: AgentThreadMessage;
}

export interface AgentThreadCompactResult {
  thread: AgentThread;
  compactedMessageCount: number;
}

export class InMemoryAgentThreadStore {
  private readonly threads = new Map<string, AgentThread>();

  createThread(): AgentThread {
    const now = new Date().toISOString();
    const thread: AgentThread = {
      id: uuidv7(),
      messages: [],
      status: 'idle',
      createdAt: now,
      updatedAt: now
    };
    this.threads.set(thread.id, thread);
    return cloneThread(thread);
  }

  listThreads(): AgentThreadSummary[] {
    return Array.from(this.threads.values())
      .map(thread => ({
        id: thread.id,
        status: thread.status,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messageCount: thread.messages.length
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getThread(id: string): AgentThread | null {
    const thread = this.threads.get(id);
    return thread ? cloneThread(thread) : null;
  }

  runThread(
    id: string,
    request: AgentThreadRunRequest,
    assistantContent = buildFoundationResponse(request)
  ): AgentThreadRunResult | null {
    const thread = this.threads.get(id);
    if (!thread) return null;
    if (thread.status === 'running') {
      throw new Error('Thread is already running');
    }

    const userMessage = createMessage('user', request.message);
    thread.status = 'running';
    thread.messages.push(userMessage);

    const response = createMessage('assistant', assistantContent);
    thread.messages.push(response);
    thread.status = 'idle';
    thread.updatedAt = response.createdAt;

    return {
      thread: cloneThread(thread),
      response: { ...response }
    };
  }

  compactThread(id: string): AgentThreadCompactResult | null {
    const thread = this.threads.get(id);
    if (!thread) return null;
    if (thread.status === 'running') {
      throw new Error('Cannot compact a running thread');
    }

    const compactedMessageCount = thread.messages.length;
    const summary = summarizeMessages(thread.messages);
    const summaryMessage = createMessage('system', summary);
    thread.messages = [summaryMessage];
    thread.summary = summary;
    thread.updatedAt = summaryMessage.createdAt;

    return {
      thread: cloneThread(thread),
      compactedMessageCount
    };
  }

  updateThreadStatus(id: string, status: AgentThreadStatus): boolean {
    const thread = this.threads.get(id);
    if (!thread) return false;
    thread.status = status;
    thread.updatedAt = new Date().toISOString();
    return true;
  }
}

function createMessage(role: AgentThreadMessage['role'], content: string): AgentThreadMessage {
  return {
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function buildFoundationResponse(request: AgentThreadRunRequest): string {
  const context = [request.dataSourceName, request.dataSourceId, request.model]
    .filter(value => value !== undefined)
    .join(' / ');
  const suffix = context ? ` Context: ${context}.` : '';
  return `Received: ${request.message}.${suffix}`;
}

function summarizeMessages(messages: AgentThreadMessage[]): string {
  if (messages.length === 0) {
    return 'No messages to summarize.';
  }

  const userMessages = messages
    .filter(message => message.role === 'user')
    .map(message => message.content);
  const source = userMessages.length > 0 ? userMessages : messages.map(message => message.content);
  return `Conversation summary: ${source.join(' ')}`;
}

function cloneThread(thread: AgentThread): AgentThread {
  return {
    ...thread,
    messages: thread.messages.map(message => ({ ...message }))
  };
}
