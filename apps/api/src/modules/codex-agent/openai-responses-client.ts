import {
  collectResponsesStream,
  CodexResponseError,
  type CodexContentBlock,
  type CodexResponseCredentials,
  type CodexResponsesInputItem,
  type CodexResponsesOutput,
  type CodexResponsesRequest,
  type FetchLike
} from './codex-responses-client.js';
import type { CodexResponseRequester } from './codex-agent-runtime.js';

type JsonRecord = Record<string, unknown>;

export class OpenAIResponsesClient implements CodexResponseRequester {
  constructor(
    private readonly options: {
      apiKey?: string;
      baseUrl?: string;
      env?: NodeJS.ProcessEnv;
      fetchImpl?: FetchLike;
      timeoutMs?: number;
    } = {}
  ) {}

  async createResponse(
    _credentials: CodexResponseCredentials,
    request: CodexResponsesRequest
  ): Promise<CodexResponsesOutput> {
    const apiKey = this.apiKey;
    if (!apiKey) throw new CodexResponseError('OpenAI API key is not configured.', null);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const shouldStream = Boolean(request.onStreamEvent);
      const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: shouldStream ? 'text/event-stream' : 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify(openAIRequestBody(request, this.env, shouldStream))
      });

      if (shouldStream) {
        if (!response.ok) {
          const payload = await readJson(response);
          throw new CodexResponseError(openAIErrorMessage(payload, response.status), response.status);
        }
        const output = await collectResponsesStream(response, request.onStreamEvent, 'OpenAI');
        if (output.outputText.trim().length === 0 && output.toolCalls.length === 0) {
          throw new CodexResponseError('OpenAI returned an empty response.', null);
        }
        return output;
      }

      const payload = await readJson(response);
      if (!response.ok) {
        throw new CodexResponseError(openAIErrorMessage(payload, response.status), response.status);
      }
      const output = outputFromOpenAI(payload);
      if (output.outputText.trim().length === 0 && output.toolCalls.length === 0) {
        throw new CodexResponseError('OpenAI returned an empty response.', null);
      }
      return output;
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new CodexResponseError('OpenAI request timed out.', null);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private get apiKey(): string {
    return this.options.apiKey?.trim()
      || this.env.OPENAI_API_KEY?.trim()
      || '';
  }

  private get baseUrl(): string {
    return (this.options.baseUrl ?? this.env.OPENAI_API_ENDPOINT ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  private get env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env;
  }

  private get fetchImpl(): FetchLike {
    return this.options.fetchImpl ?? defaultFetch;
  }

  private get timeoutMs(): number {
    return parseTimeoutMs(this.options.timeoutMs ?? this.env.OPENAI_AGENT_TIMEOUT_MS, 60_000);
  }
}

async function defaultFetch(url: string, init: Parameters<FetchLike>[1]): Promise<Awaited<ReturnType<FetchLike>>> {
  return fetch(url, init) as Promise<Awaited<ReturnType<FetchLike>>>;
}

function openAIRequestBody(
  request: CodexResponsesRequest,
  env: NodeJS.ProcessEnv,
  stream: boolean
): JsonRecord {
  return {
    model: request.model,
    instructions: request.instructions,
    input: request.input.map(toOpenAIInputItem),
    tools: request.tools ?? [],
    ...(request.tools?.length ? { tool_choice: 'required' } : {}),
    ...openAIReasoningOptions(request.model, env),
    store: false,
    stream,
    ...(request.maxOutputTokens ? { max_output_tokens: Math.max(request.maxOutputTokens, 16) } : {})
  };
}

function openAIReasoningOptions(model: string, env: NodeJS.ProcessEnv): JsonRecord {
  const effort = openAIReasoningEffort(model, env);
  return effort ? { reasoning: { effort } } : {};
}

function openAIReasoningEffort(model: string, env: NodeJS.ProcessEnv): string | null {
  const configured = env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  if (isOpenAIReasoningEffort(configured)) return configured;
  return model.trim().toLowerCase().startsWith('gpt-5') ? 'minimal' : null;
}

function isOpenAIReasoningEffort(value: string | undefined): value is string {
  return value === 'minimal'
    || value === 'low'
    || value === 'medium'
    || value === 'high';
}

function toOpenAIInputItem(item: CodexResponsesInputItem): CodexResponsesInputItem | JsonRecord {
  if (!('role' in item) || !Array.isArray(item.content)) return item;
  return {
    role: item.role,
    content: item.content.map(block => openAIContentBlock(block, item.role))
  };
}

function openAIContentBlock(block: CodexContentBlock, role: string): JsonRecord {
  if (block.type === 'text') {
    return {
      type: role === 'assistant' ? 'output_text' : 'input_text',
      text: block.text
    };
  }
  return {
    type: 'input_image',
    image_url: block.image_url.url,
    ...(block.image_url.detail ? { detail: block.image_url.detail } : {})
  };
}

async function readJson(response: Awaited<ReturnType<FetchLike>>): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CodexResponseError('OpenAI returned malformed JSON.', response.status);
  }
}

function outputFromOpenAI(payload: unknown): CodexResponsesOutput {
  const response = isRecord(payload) ? payload : {};
  return {
    outputText: openAIOutputText(response),
    usage: {
      inputTokens: readNumber(response.usage, 'input_tokens'),
      outputTokens: readNumber(response.usage, 'output_tokens')
    },
    toolCalls: openAIToolCalls(response.output)
  };
}

function openAIOutputText(response: JsonRecord): string {
  const direct = asString(response.output_text);
  if (direct) return direct;
  const output = Array.isArray(response.output) ? response.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (!isRecord(block)) continue;
      const text = asString(block.text);
      if ((block.type === 'output_text' || block.type === 'text') && text) chunks.push(text);
    }
  }
  return chunks.join('');
}

function openAIToolCalls(output: unknown): Array<{ callId: string; name: string; arguments: string }> {
  if (!Array.isArray(output)) return [];
  return output
    .filter(isRecord)
    .filter(item => item.type === 'function_call')
    .map(item => ({
      callId: asString(item.call_id) ?? asString(item.id) ?? '',
      name: asString(item.name) ?? '',
      arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {})
    }))
    .filter(item => item.callId && item.name);
}

function openAIErrorMessage(payload: unknown, statusCode: number): string {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const message = asString(error?.message);
  if (message) return message;
  if (statusCode === 401 || statusCode === 403) return 'OpenAI API key was rejected.';
  if (statusCode === 429) return 'OpenAI rate limit reached.';
  if (statusCode >= 500) return 'OpenAI service is unavailable.';
  return `OpenAI request failed with HTTP ${statusCode}.`;
}

function parseTimeoutMs(value: number | string | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readNumber(record: unknown, field: string): number {
  if (!isRecord(record)) return 0;
  const value = record[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
