import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendCreated, sendJson, sendOk } from '../../http.js';
import {
  InMemoryAgentThreadStore,
  type AgentThread,
  type AgentThreadCompactResult,
  type AgentThreadRunRequest,
  type AgentThreadRunResult,
  type AgentThreadSummary
} from './store.js';
import {
  createCodexAgentRuntime,
  type CodexAgentResult,
  type CodexAgentRuntime
} from '../codex-agent/codex-agent-runtime.js';

export interface CreateAgentThreadResponse {
  thread_id: string;
}

// TODO: Move these narrow compatibility DTOs into @intraq/contracts once
// the durable agent thread contract is formalized.
export type ListAgentThreadsResponse = AgentThreadSummary[];
export type GetAgentThreadResponse = AgentThread;
export type RunAgentThreadResponse = AgentThreadRunResult & { agentProvider?: CodexAgentResult };
export type CompactAgentThreadResponse = AgentThreadCompactResult;

export class AgentThreadRoutes {
  constructor(
    private readonly store = new InMemoryAgentThreadStore(),
    private readonly codexAgent: CodexAgentRuntime = createCodexAgentRuntime()
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const threadPath = matchThreadPath(url.pathname);

    if (req.method === 'POST' && url.pathname === '/api/agent/threads') {
      await this.handleCreateThread(req, res);
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/agent/threads') {
      sendOk<ListAgentThreadsResponse>(res, this.store.listThreads());
      return true;
    }

    if (!threadPath) return false;

    if (req.method === 'GET' && threadPath.action === undefined) {
      this.handleGetThread(res, threadPath.id);
      return true;
    }

    if (req.method === 'POST' && threadPath.action === 'run') {
      await this.handleRunThread(req, res, threadPath.id);
      return true;
    }

    if (req.method === 'POST' && threadPath.action === 'compact') {
      await this.handleCompactThread(req, res, threadPath.id);
      return true;
    }

    return false;
  }

  private async handleCreateThread(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (body === null || !isRecord(body)) {
      sendBadRequest(res, 'Request body must be a JSON object.');
      return;
    }

    const thread = this.store.createThread();
    sendCreated<CreateAgentThreadResponse>(res, {
      thread_id: thread.id
    });
  }

  private handleGetThread(res: ServerResponse, id: string): void {
    const thread = this.store.getThread(id);
    if (!thread) {
      sendThreadNotFound(res);
      return;
    }

    sendOk<GetAgentThreadResponse>(res, thread);
  }

  private async handleRunThread(
    req: IncomingMessage,
    res: ServerResponse,
    id: string
  ): Promise<void> {
    const body = await readJsonBody(req);
    const request = parseRunRequest(body);
    if (!request) {
      sendBadRequest(res, 'message is required');
      return;
    }

    try {
      const currentThread = this.store.getThread(id);
      if (!currentThread) {
        sendThreadNotFound(res);
        return;
      }
      if (currentThread.status === 'running') {
        throw new Error('Thread is already running');
      }
      const agentProvider = await this.codexAgent.invoke({
        surface: 'agent-thread',
        userPrompt: request.message,
        ...(request.model ? { model: request.model } : {}),
        systemContext: {
          dataSourceId: request.dataSourceId ?? null,
          dataSourceName: request.dataSourceName ?? null,
          previousMessages: currentThread.messages
        }
      });
      const result = this.store.runThread(id, request, agentProvider.responseText ?? undefined);
      if (!result) {
        sendThreadNotFound(res);
        return;
      }

      sendOk<RunAgentThreadResponse>(res, { ...result, agentProvider });
    } catch (error) {
      sendConflict(res, error instanceof Error ? error.message : 'Thread cannot be run.');
    }
  }

  private async handleCompactThread(
    req: IncomingMessage,
    res: ServerResponse,
    id: string
  ): Promise<void> {
    const body = await readJsonBody(req);
    if (body === null || !isRecord(body)) {
      sendBadRequest(res, 'Request body must be a JSON object.');
      return;
    }

    try {
      const result = this.store.compactThread(id);
      if (!result) {
        sendThreadNotFound(res);
        return;
      }

      sendOk<CompactAgentThreadResponse>(res, result);
    } catch (error) {
      sendConflict(res, error instanceof Error ? error.message : 'Thread cannot be compacted.');
    }
  }
}

export function createAgentThreadRoutes(
  store?: InMemoryAgentThreadStore,
  codexAgent: CodexAgentRuntime = createCodexAgentRuntime()
): AgentThreadRoutes {
  return new AgentThreadRoutes(store, codexAgent);
}

function matchThreadPath(pathname: string): { id: string; action?: 'run' | 'compact' } | null {
  const match = /^\/api\/agent\/threads\/([^/]+)(?:\/(run|compact))?$/.exec(pathname);
  if (!match?.[1]) return null;
  const action = match[2] === 'run' || match[2] === 'compact' ? match[2] : undefined;
  try {
    return {
      id: decodeURIComponent(match[1]),
      ...(action ? { action } : {})
    };
  } catch {
    return null;
  }
}

function parseRunRequest(input: unknown): AgentThreadRunRequest | null {
  if (!isRecord(input) || !isNonEmptyString(input.message)) return null;
  if (input.message.length > 10_000) return null;
  if (!optionalString(input.model, 500)) return null;
  if (!optionalString(input.dataSourceId, 500)) return null;
  if (!optionalString(input.dataSourceName, 500)) return null;

  const request: AgentThreadRunRequest = { message: input.message.trim() };
  if (typeof input.model === 'string') request.model = input.model.trim();
  if (typeof input.dataSourceId === 'string') request.dataSourceId = input.dataSourceId.trim();
  if (typeof input.dataSourceName === 'string') request.dataSourceName = input.dataSourceName.trim();
  return request;
}

function sendConflict(res: ServerResponse, message: string): void {
  sendJson(res, 409, fail(message));
}

function sendThreadNotFound(res: ServerResponse): void {
  sendJson(res, 404, fail('Thread not found'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value: unknown, maxLength: number): boolean {
  return value === undefined || (isNonEmptyString(value) && value.length <= maxLength);
}
