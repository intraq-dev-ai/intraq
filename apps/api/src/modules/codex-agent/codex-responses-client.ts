import type { CodexOAuthCredentials } from './codex-oauth.js';

export const CODEX_CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api/codex';

export interface CodexResponsesRequest {
  model: string;
  instructions: string;
  input: CodexResponsesInputItem[];
  maxOutputTokens?: number;
  onStreamEvent?: (event: CodexResponsesStreamEvent) => void;
  tools?: CodexResponsesToolDefinition[];
}

export type CodexContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'high' | 'low' } };

export type CodexResponsesInputItem =
  | { role: 'user' | 'system' | 'assistant'; content: string | CodexContentBlock[] }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

export interface CodexResponsesToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface CodexResponsesOutput {
  outputText: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls: Array<{ callId: string; name: string; arguments: string }>;
}

export type CodexResponseCredentials = CodexOAuthCredentials | null;

export type CodexResponsesStreamEvent =
  | { type: 'output_text_delta'; delta: string; outputText: string }
  | {
      type: 'function_call_arguments_delta';
      arguments: string;
      callId: string;
      delta: string;
      itemId: string;
      name: string;
    }
  | {
      type: 'function_call_arguments_done';
      arguments: string;
      callId: string;
      itemId: string;
      name: string;
    };

export type FetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<FetchResponseLike>;

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText?: string;
  body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export class CodexResponseError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null = null
  ) {
    super(message);
    this.name = 'CodexResponseError';
  }
}

export class CodexResponsesClient {
  constructor(
    private readonly options: {
      baseUrl?: string;
      fetchImpl?: FetchLike;
      timeoutMs?: number;
    } = {}
  ) {}

  async createResponse(
    credentials: CodexResponseCredentials,
    request: CodexResponsesRequest
  ): Promise<CodexResponsesOutput> {
    if (!credentials) throw new CodexResponseError('Codex OAuth credentials are required.', null);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: headersFor(credentials),
        signal: controller.signal,
        body: JSON.stringify({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          tools: request.tools ?? [],
          store: false,
          stream: true
        })
      });

      if (!response.ok) {
        throw new CodexResponseError(errorMessageFor(response.status), response.status);
      }

      const output = await collectResponsesStream(response, request.onStreamEvent, 'Codex');
      if (output.outputText.trim().length === 0 && output.toolCalls.length === 0) {
        throw new CodexResponseError('Codex returned an empty response.');
      }
      return output;
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new CodexResponseError('Codex request timed out.', null);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private get baseUrl(): string {
    return (this.options.baseUrl ?? CODEX_CHATGPT_BASE_URL).replace(/\/$/, '');
  }

  private get fetchImpl(): FetchLike {
    return this.options.fetchImpl ?? defaultFetch;
  }

  private get timeoutMs(): number {
    return parseTimeoutMs(this.options.timeoutMs ?? process.env.CODEX_AGENT_TIMEOUT_MS, 60_000);
  }
}

async function defaultFetch(url: string, init: Parameters<FetchLike>[1]): Promise<FetchResponseLike> {
  return fetch(url, init) as Promise<FetchResponseLike>;
}

function headersFor(credentials: CodexOAuthCredentials): Record<string, string> {
  return {
    accept: 'text/event-stream',
    authorization: `Bearer ${credentials.accessToken}`,
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    ...(credentials.accountId ? { 'ChatGPT-Account-ID': credentials.accountId } : {})
  };
}

function errorMessageFor(statusCode: number): string {
  if (statusCode === 401 || statusCode === 403) return 'Codex OAuth token was rejected.';
  if (statusCode === 429) return 'Codex rate limit reached.';
  if (statusCode >= 500) return 'Codex service is unavailable.';
  return `Codex request failed with HTTP ${statusCode}.`;
}

function parseTimeoutMs(value: number | string | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function collectResponsesStream(
  response: FetchResponseLike,
  onStreamEvent?: CodexResponsesRequest['onStreamEvent'],
  providerName = 'Responses API'
): Promise<CodexResponsesOutput> {
  const state = createStreamState();
  const reader = response.body?.getReader();
  if (!reader) {
    parseSseText(await response.text(), state, onStreamEvent, providerName);
    return outputFromState(state);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) parseSseEvent(part, state, onStreamEvent, providerName);
    }
    buffer += decoder.decode();
    if (buffer.trim()) parseSseEvent(buffer, state, onStreamEvent, providerName);
  } finally {
    reader.releaseLock();
  }
  return outputFromState(state);
}

interface StreamState {
  outputText: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCallsByItemId: Map<string, { callId: string; name: string; arguments: string }>;
}

function createStreamState(): StreamState {
  return {
    outputText: '',
    usage: { inputTokens: 0, outputTokens: 0 },
    toolCallsByItemId: new Map()
  };
}

function parseSseText(
  text: string,
  state: StreamState,
  onStreamEvent?: CodexResponsesRequest['onStreamEvent'],
  providerName = 'Responses API'
): void {
  for (const event of text.split('\n\n')) parseSseEvent(event, state, onStreamEvent, providerName);
}

function parseSseEvent(
  rawEvent: string,
  state: StreamState,
  onStreamEvent?: CodexResponsesRequest['onStreamEvent'],
  providerName = 'Responses API'
): void {
  const data = rawEvent
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim())
    .filter(value => value && value !== '[DONE]')
    .join('\n');
  if (!data) return;

  try {
    applyCodexEvent(JSON.parse(data) as unknown, state, onStreamEvent);
  } catch (error) {
    throw new CodexResponseError(`${providerName} returned malformed streaming JSON.`, null);
  }
}

function applyCodexEvent(
  event: unknown,
  state: StreamState,
  onStreamEvent?: CodexResponsesRequest['onStreamEvent']
): void {
  if (!isRecord(event)) return;
  const type = asString(event.type);
  if (type === 'response.output_text.delta') {
    const delta = asString(event.delta) ?? '';
    state.outputText += delta;
    if (delta) onStreamEvent?.({ type: 'output_text_delta', delta, outputText: state.outputText });
    return;
  }
  if (type === 'response.output_item.added' && isRecord(event.item) && event.item.type === 'function_call') {
    const itemId = asString(event.item.id) ?? asString(event.item.call_id);
    if (!itemId) return;
    state.toolCallsByItemId.set(itemId, {
      callId: asString(event.item.call_id) ?? itemId,
      name: asString(event.item.name) ?? '',
      arguments: ''
    });
    return;
  }
  if (type === 'response.function_call_arguments.delta') {
    const itemId = asString(event.item_id) ?? '';
    const item = state.toolCallsByItemId.get(itemId);
    const delta = asString(event.delta) ?? '';
    if (item) {
      item.arguments += delta;
      if (delta) {
        onStreamEvent?.({
          type: 'function_call_arguments_delta',
          arguments: item.arguments,
          callId: item.callId,
          delta,
          itemId,
          name: item.name
        });
      }
    }
    return;
  }
  if (type === 'response.function_call_arguments.done') {
    const itemId = asString(event.item_id) ?? '';
    const item = state.toolCallsByItemId.get(itemId);
    if (item) {
      item.arguments = asString(event.arguments) ?? item.arguments;
      onStreamEvent?.({
        type: 'function_call_arguments_done',
        arguments: item.arguments,
        callId: item.callId,
        itemId,
        name: item.name
      });
    }
    return;
  }
  if (type === 'response.completed' && isRecord(event.response)) {
    state.usage = {
      inputTokens: readNumber(event.response.usage, 'input_tokens'),
      outputTokens: readNumber(event.response.usage, 'output_tokens')
    };
    state.outputText ||= asString(event.response.output_text) ?? '';
  }
}

function outputFromState(state: StreamState): CodexResponsesOutput {
  return {
    outputText: state.outputText,
    usage: state.usage,
    toolCalls: Array.from(state.toolCallsByItemId.values())
  };
}

function readNumber(record: unknown, field: string): number {
  if (!isRecord(record)) return 0;
  const value = record[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
