import { setTimeout as delay } from 'node:timers/promises';
import {
  CodexResponseError,
  type CodexResponseCredentials,
  type CodexResponsesInputItem,
  type CodexResponsesOutput,
  type CodexResponsesStreamEvent,
  type CodexResponsesToolDefinition
} from './codex-responses-client.js';
import type {
  CodexAgentResult,
  CodexAgentSurface,
  CodexResponseRequester
} from './codex-agent-runtime.js';

export interface CodexAgentToolLoopProvider {
  auth: CodexAgentResult['auth'];
  disabledReason: string;
  provider: CodexAgentResult['provider'];
  requestFailedReason: string;
  toolLoopTurnLimitReason: string;
}

export interface CodexAgentTool {
  definition: CodexResponsesToolDefinition;
  run(args: Record<string, unknown>): Promise<unknown> | unknown;
  terminal?: boolean | ((output: unknown) => boolean);
}

export interface CodexAgentToolLoopInvocation<TFallback = unknown> {
  context: unknown;
  fallback: () => TFallback;
  instructions: string;
  maxOutputTokens?: number;
  maxTurns?: number;
  model?: string;
  onStreamEvent?: (event: CodexResponsesStreamEvent) => void;
  preferredProvider?: 'codex' | 'openai' | 'gemini';
  surface: CodexAgentSurface;
  tenantId?: string | null;
  tools: CodexAgentTool[];
  userPrompt: string;
}

export interface CodexAgentToolLoopResult<TToolResult = unknown> {
  answer: string | null;
  provider: CodexAgentResult;
  toolName: string | null;
  toolResult: TToolResult | null;
  turns: number;
  type: 'answer' | 'fallback' | 'tool_result';
}

export async function runCodexAgentToolLoop<TFallback>(
  options: {
    client: CodexResponseRequester;
    credentials: CodexResponseCredentials;
    disabled: boolean;
    invocation: CodexAgentToolLoopInvocation<TFallback>;
    model: string;
    provider: CodexAgentToolLoopProvider;
  }
): Promise<CodexAgentToolLoopResult<TFallback>> {
  if (options.disabled) {
    return fallbackResult(options.model, options.provider, options.provider.disabledReason, options.invocation.fallback());
  }

  const textContent = JSON.stringify({
    surface: options.invocation.surface,
    userPrompt: options.invocation.userPrompt,
    context: options.invocation.context
  });
  const input: CodexResponsesInputItem[] = [{
    role: 'user',
    content: textContent
  }];
  const maxTurns = options.invocation.maxTurns ?? 4;
  const maxRequestAttempts = retryAttemptCount();
  let totalUsage: CodexResponsesOutput['usage'] = { inputTokens: 0, outputTokens: 0 };
  let toolCallCount = 0;

  try {
    for (let turn = 0; turn < maxTurns; turn += 1) {
      const response = await createResponseWithRetry(options, {
        maxRequestAttempts,
        request: {
          model: options.model,
          instructions: options.invocation.instructions,
          input,
          ...(options.invocation.onStreamEvent ? { onStreamEvent: options.invocation.onStreamEvent } : {}),
          tools: options.invocation.tools.map(tool => tool.definition),
          maxOutputTokens: options.invocation.maxOutputTokens ?? 1200
        }
      });
      totalUsage = addUsage(totalUsage, response.usage);
      if (response.toolCalls.length === 0) {
        if (options.invocation.tools.length > 0 && turn < maxTurns - 1) {
          input.push({
            role: 'assistant',
            content: response.outputText.trim() || 'No tool call returned.'
          });
          input.push({
            role: 'user',
            content: JSON.stringify({
              surface: options.invocation.surface,
              userPrompt: options.invocation.userPrompt,
              correction: 'Use exactly one of the provided function tools. Do not return plain text directly.'
            })
          });
          continue;
        }
        return {
          answer: response.outputText.trim() || 'No answer returned.',
          provider: usedProvider(options.model, options.provider, response.outputText, totalUsage, {
            toolCalls: toolCallCount,
            toolTurns: turn + 1
          }),
          toolName: null,
          toolResult: null,
          turns: turn + 1,
          type: 'answer'
        };
      }

      for (const toolCall of response.toolCalls) {
        toolCallCount += 1;
        input.push({
          type: 'function_call',
          call_id: toolCall.callId,
          name: toolCall.name,
          arguments: toolCall.arguments
        });
        const tool = options.invocation.tools.find(item => item.definition.name === toolCall.name);
        const output = tool
          ? await tool.run(parseToolArguments(toolCall.arguments))
          : { success: false, error: `Unknown tool: ${toolCall.name}` };
        input.push({
          type: 'function_call_output',
          call_id: toolCall.callId,
          output: JSON.stringify(output)
        });
        if (tool && isTerminalToolResult(tool, output)) {
          return {
            answer: response.outputText.trim() || null,
            provider: usedProvider(options.model, options.provider, response.outputText, totalUsage, {
              toolCalls: toolCallCount,
              toolTurns: turn + 1
            }),
            toolName: tool.definition.name,
            toolResult: output as TFallback,
            turns: turn + 1,
            type: 'tool_result'
          };
        }
      }
    }
    return fallbackResult(
      options.model,
      options.provider,
      options.provider.toolLoopTurnLimitReason,
      options.invocation.fallback()
    );
  } catch (error) {
    return fallbackResult(
      options.model,
      options.provider,
      options.provider.requestFailedReason,
      options.invocation.fallback(),
      safeErrorMessage(error)
    );
  }
}

async function createResponseWithRetry(
  options: {
    client: CodexResponseRequester;
    credentials: CodexResponseCredentials;
  },
  retryOptions: {
    maxRequestAttempts: number;
    request: {
      model: string;
      instructions: string;
      input: CodexResponsesInputItem[];
      maxOutputTokens?: number;
      onStreamEvent?: (event: CodexResponsesStreamEvent) => void;
      tools?: CodexResponsesToolDefinition[];
    };
  }
): Promise<CodexResponsesOutput> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retryOptions.maxRequestAttempts; attempt += 1) {
    try {
      return await options.client.createResponse(options.credentials, retryOptions.request);
    } catch (error) {
      lastError = error;
      if (attempt >= retryOptions.maxRequestAttempts || !isRetryableResponseError(error)) {
        throw error;
      }
      await retryDelay(attempt);
    }
  }
  throw lastError;
}

function retryAttemptCount(): number {
  const configured = process.env.AI_AGENT_REQUEST_RETRIES ?? process.env.CODEX_AGENT_REQUEST_RETRIES;
  const parsed = Number.parseInt(configured ?? '', 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(Math.max(parsed, 1), 5);
}

function isRetryableResponseError(error: unknown): boolean {
  if (error instanceof CodexResponseError) {
    const statusCode = error.statusCode;
    if (statusCode === null) {
      const message = error.message.toLowerCase();
      if (message.includes('credentials are required') || message.includes('api key is not configured')) {
        return false;
      }
      return true;
    }
    return statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
  }
  return error instanceof Error;
}

async function retryDelay(failedAttempt: number): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  const delayMs = Math.min(250 * 2 ** (failedAttempt - 1), 1000);
  await delay(delayMs, undefined, { ref: false });
}

function parseToolArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function addUsage(
  current: CodexResponsesOutput['usage'],
  next: CodexResponsesOutput['usage']
): CodexResponsesOutput['usage'] {
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens
  };
}

function usedProvider(
  model: string,
  provider: CodexAgentToolLoopProvider,
  responseText: string,
  usage: CodexResponsesOutput['usage'],
  metrics?: { toolCalls: number; toolTurns: number }
): CodexAgentResult {
  return {
    provider: provider.provider,
    auth: provider.auth,
    model,
    used: true,
    responseText: responseText.trim() || null,
    ...(metrics ? { toolCalls: metrics.toolCalls, toolTurns: metrics.toolTurns } : {}),
    usage
  };
}

function fallbackResult<TFallback>(
  model: string,
  provider: CodexAgentToolLoopProvider,
  fallbackReason: string,
  toolResult: TFallback,
  error?: string
): CodexAgentToolLoopResult<TFallback> {
  return {
    answer: null,
    provider: {
      provider: provider.provider,
      auth: provider.auth,
      model,
      used: false,
      responseText: null,
      fallbackReason,
      ...(error ? { error } : {})
    },
    toolName: null,
    toolResult,
    turns: 0,
    type: 'fallback'
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof CodexResponseError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Agent request failed.';
}

function isTerminalToolResult(tool: CodexAgentTool, output: unknown): boolean {
  if (typeof tool.terminal === 'function') return tool.terminal(output);
  return tool.terminal === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
