import {
  CodexResponseError,
  type CodexContentBlock,
  type CodexResponseCredentials,
  type CodexResponsesInputItem,
  type CodexResponsesOutput,
  type CodexResponsesRequest,
  type CodexResponsesToolDefinition,
  type FetchLike
} from './codex-responses-client.js';
import type { CodexResponseRequester } from './codex-agent-runtime.js';

type JsonRecord = Record<string, unknown>;

interface GeminiContent {
  role?: 'user' | 'model';
  parts: JsonRecord[];
}

export class GeminiResponsesClient implements CodexResponseRequester {
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
    if (!apiKey) throw new CodexResponseError('Gemini API key is not configured.', null);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/${geminiModelPath(request.model)}:generateContent`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify(geminiRequestBody(request, this.env))
      });

      const payload = await readJson(response);
      if (!response.ok) {
        throw new CodexResponseError(geminiErrorMessage(payload, response.status), response.status);
      }
      const output = outputFromGemini(payload);
      if (output.outputText.trim().length === 0 && output.toolCalls.length === 0) {
        throw new CodexResponseError('Gemini returned an empty response.', null);
      }
      return output;
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new CodexResponseError('Gemini request timed out.', null);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private get apiKey(): string {
    return this.options.apiKey?.trim()
      || this.env.GEMINI_API_KEY?.trim()
      || this.env.GOOGLE_GEMINI_API_KEY?.trim()
      || '';
  }

  private get baseUrl(): string {
    return (this.options.baseUrl ?? this.env.GEMINI_API_ENDPOINT ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  }

  private get env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env;
  }

  private get fetchImpl(): FetchLike {
    return this.options.fetchImpl ?? defaultFetch;
  }

  private get timeoutMs(): number {
    return parseTimeoutMs(this.options.timeoutMs ?? this.env.GEMINI_AGENT_TIMEOUT_MS, 60_000);
  }
}

async function defaultFetch(url: string, init: Parameters<FetchLike>[1]): Promise<Awaited<ReturnType<FetchLike>>> {
  return fetch(url, init) as Promise<Awaited<ReturnType<FetchLike>>>;
}

function geminiRequestBody(request: CodexResponsesRequest, env: NodeJS.ProcessEnv): JsonRecord {
  const functionDeclarations = (request.tools ?? []).map(toGeminiFunctionDeclaration);
  return {
    systemInstruction: { parts: [{ text: request.instructions }] },
    contents: toGeminiContents(request.input),
    ...(functionDeclarations.length > 0
      ? {
          tools: [{ functionDeclarations }],
          toolConfig: { functionCallingConfig: { mode: 'ANY' } }
        }
      : {}),
    generationConfig: {
      temperature: geminiTemperature(functionDeclarations.length > 0, env),
      ...(request.maxOutputTokens ? { maxOutputTokens: Math.max(request.maxOutputTokens, 16) } : {}),
      ...geminiThinkingConfig(request.model, env)
    }
  };
}

function geminiTemperature(hasTools: boolean, env: NodeJS.ProcessEnv): number {
  const configured = optionalFloat(env.GEMINI_TEMPERATURE);
  if (configured !== null) return configured;
  return hasTools ? 0 : 0.1;
}

function geminiThinkingConfig(model: string, env: NodeJS.ProcessEnv): JsonRecord {
  if (model.toLowerCase().replace(/^models\//, '').startsWith('gemma-')) return {};
  const configuredBudget = optionalInteger(env.GEMINI_THINKING_BUDGET);
  if (configuredBudget !== null) return { thinkingConfig: { thinkingBudget: configuredBudget } };
  if (model.toLowerCase().includes('gemini-2.5-flash')) return { thinkingConfig: { thinkingBudget: 0 } };
  const thinkingLevel = env.GEMINI_THINKING_LEVEL?.trim().toLowerCase();
  return thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {};
}

function toGeminiContents(input: CodexResponsesInputItem[]): GeminiContent[] {
  const functionNamesByCallId = new Map<string, string>();
  const contents: GeminiContent[] = [];
  for (const item of input) {
    if ('role' in item) {
      contents.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: messageParts(item.content)
      });
      continue;
    }
    if (item.type === 'function_call') {
      functionNamesByCallId.set(item.call_id, item.name);
      contents.push({
        role: 'model',
        parts: [{
          functionCall: {
            id: item.call_id,
            name: item.name,
            args: parseJsonObject(item.arguments)
          }
        }]
      });
      continue;
    }
    const name = functionNamesByCallId.get(item.call_id) ?? 'function_result';
    contents.push({
      role: 'user',
      parts: [{
        functionResponse: {
          id: item.call_id,
          name,
          response: { result: parseJsonValue(item.output) }
        }
      }]
    });
  }
  return contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: '' }] }];
}

function messageParts(content: string | CodexContentBlock[]): JsonRecord[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map(contentBlockToPart);
}

function contentBlockToPart(block: CodexContentBlock): JsonRecord {
  if (block.type === 'text') return { text: block.text };
  const image = dataUrlParts(block.image_url.url);
  if (!image) return { text: '[Image omitted: unsupported image URL]' };
  return {
    inlineData: {
      mimeType: image.mimeType,
      data: image.data
    }
  };
}

function toGeminiFunctionDeclaration(tool: CodexResponsesToolDefinition): JsonRecord {
  return {
    name: tool.name,
    description: tool.description,
    parameters: sanitizeGeminiSchema(tool.parameters)
  };
}

function sanitizeGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeGeminiSchema);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsupportedSchemaKeys.has(key))
      .map(([key, entry]) => [key, sanitizeGeminiSchema(entry)])
  );
}

const unsupportedSchemaKeys = new Set([
  '$defs',
  '$schema',
  'additionalProperties',
  'definitions',
  'strict'
]);

async function readJson(response: Awaited<ReturnType<FetchLike>>): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CodexResponseError('Gemini returned malformed JSON.', response.status);
  }
}

function outputFromGemini(payload: unknown): CodexResponsesOutput {
  const response = isRecord(payload) ? payload : {};
  const usage = isRecord(response.usageMetadata) ? response.usageMetadata : {};
  return {
    outputText: geminiOutputText(response),
    usage: {
      inputTokens: readNumber(usage, 'promptTokenCount'),
      outputTokens: readNumber(usage, 'candidatesTokenCount') + readNumber(usage, 'thoughtsTokenCount')
    },
    toolCalls: geminiToolCalls(response)
  };
}

function geminiOutputText(response: JsonRecord): string {
  const parts = firstCandidateParts(response);
  return parts
    .filter(part => part.thought !== true)
    .map(part => asString(part.text) ?? '')
    .join('');
}

function geminiToolCalls(response: JsonRecord): Array<{ callId: string; name: string; arguments: string }> {
  return firstCandidateParts(response)
    .map((part, index) => ({ call: isRecord(part.functionCall) ? part.functionCall : null, index }))
    .filter((item): item is { call: JsonRecord; index: number } => Boolean(item.call))
    .map(({ call, index }) => ({
      callId: asString(call.id) ?? `gemini-call-${index + 1}`,
      name: asString(call.name) ?? '',
      arguments: JSON.stringify(isRecord(call.args) ? call.args : {})
    }))
    .filter(item => item.name);
}

function firstCandidateParts(response: JsonRecord): JsonRecord[] {
  const candidates = Array.isArray(response.candidates) ? response.candidates.filter(isRecord) : [];
  const first = candidates[0];
  const content = isRecord(first?.content) ? first.content : {};
  return Array.isArray(content.parts) ? content.parts.filter(isRecord) : [];
}

function geminiErrorMessage(payload: unknown, statusCode: number): string {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const message = asString(error?.message);
  if (message) return message;
  if (statusCode === 401 || statusCode === 403) return 'Gemini API key was rejected.';
  if (statusCode === 429) return 'Gemini rate limit or quota reached.';
  if (statusCode >= 500) return 'Gemini service is unavailable.';
  return `Gemini request failed with HTTP ${statusCode}.`;
}

function geminiModelPath(model: string): string {
  const trimmed = model.trim().replace(/^\/+/, '');
  if (trimmed.startsWith('models/') || trimmed.startsWith('tunedModels/')) return trimmed;
  return `models/${trimmed}`;
}

function parseTimeoutMs(value: number | string | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalInteger(value: string | undefined): number | null {
  if (value === undefined || !value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalFloat(value: string | undefined): number | null {
  if (value === undefined || !value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonObject(value: string): JsonRecord {
  const parsed = parseJsonValue(value);
  return isRecord(parsed) ? parsed : {};
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function dataUrlParts(value: string): { data: string; mimeType: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(value);
  if (!match?.[1] || !match[2]) return null;
  return { mimeType: match[1], data: match[2] };
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
