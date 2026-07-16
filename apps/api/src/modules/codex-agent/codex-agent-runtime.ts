import { resolveCodexOAuth } from './codex-oauth.js';
import {
  CodexResponsesClient,
  type CodexResponseCredentials,
  type CodexResponsesInputItem,
  type CodexResponsesOutput,
  type CodexResponsesRequest,
  type CodexResponsesToolDefinition
} from './codex-responses-client.js';
import {
  runCodexAgentToolLoop,
  type CodexAgentToolLoopInvocation,
  type CodexAgentToolLoopProvider,
  type CodexAgentToolLoopResult
} from './codex-agent-tool-loop.js';
import { GeminiResponsesClient } from './gemini-responses-client.js';
import { OpenAIResponsesClient } from './openai-responses-client.js';
import {
  GeminiAgentRuntime,
  GeminiPreferredAgentRuntime,
  OpenAIAgentRuntime
} from './codex-agent-provider-runtimes.js';
import {
  CODEX_AGENT_MODELS,
  DEFAULT_GEMINI_AGENT_MODEL,
  DEFAULT_OPENAI_AGENT_MODEL,
  codexProvider,
  defaultDisabled,
  fallback,
  instructionsFor,
  resolveCodexModel,
  resolveExplicitAgentProvider,
  resultFromResponse,
  safeErrorMessage
} from './codex-agent-runtime-utils.js';

export {
  CODEX_AGENT_MODELS,
  DEFAULT_GEMINI_AGENT_MODEL,
  DEFAULT_OPENAI_AGENT_MODEL
} from './codex-agent-runtime-utils.js';

export type CodexAgentSurface =
  | 'agent-thread'
  | 'analyzer'
  | 'dashboard-builder'
  | 'data-model'
  | 'model-metadata'
  | 'sql-assistant'

export interface CodexAgentInvocation {
  surface: CodexAgentSurface;
  userPrompt: string;
  deterministicResult?: unknown;
  systemContext?: unknown;
  model?: string;
  tenantId?: string | null;
}

export interface CodexAgentResult {
  provider: 'codex' | 'openai' | 'gemini';
  auth: 'oauth' | 'api_key';
  model: string;
  used: boolean;
  responseText: string | null;
  fallbackReason?: string;
  error?: string;
  toolCalls?: number;
  toolTurns?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface CodexAgentRuntime {
  invoke(invocation: CodexAgentInvocation): Promise<CodexAgentResult>;
  runToolLoop<TFallback>(
    invocation: CodexAgentToolLoopInvocation<TFallback>
  ): Promise<CodexAgentToolLoopResult<TFallback>>;
}

export interface RuntimeTenantOptions {
  tenantId?: string | null;
}

export type CodexModelResolver = (options?: RuntimeTenantOptions) => Promise<string | null>;
export type RuntimeProvider = CodexAgentResult['provider'];

export interface CodexResponseRequester {
  createResponse(credentials: CodexResponseCredentials, request: CodexResponsesRequest): Promise<CodexResponsesOutput>;
}

export function createCodexAgentRuntime(
  options: {
    client?: CodexResponseRequester;
    disabled?: boolean;
    env?: NodeJS.ProcessEnv;
    codexModelResolver?: CodexModelResolver;
    provider?: RuntimeProvider;
  } = {}
): CodexAgentRuntime {
  const env = options.env ?? process.env;
  const explicitProvider = options.provider ?? resolveExplicitAgentProvider(env);
  const openAIRuntime = new OpenAIAgentRuntime({
    client: options.client ?? new OpenAIResponsesClient({ env }),
    disabled: options.disabled ?? defaultDisabled('openai', env),
    env
  });
  const codexRuntime = new DefaultCodexAgentRuntime({
    client: options.client ?? new CodexResponsesClient(),
    disabled: options.disabled ?? defaultDisabled('codex', env),
    env,
    ...(options.codexModelResolver ? { modelResolver: options.codexModelResolver } : {})
  });
  const geminiRuntime = new GeminiAgentRuntime({
    client: options.client ?? new GeminiResponsesClient({ env }),
    disabled: options.disabled ?? defaultDisabled('gemini', env),
    env
  });
  if (explicitProvider === 'gemini') {
    return new GeminiPreferredAgentRuntime(
      codexRuntime,
      geminiRuntime
    );
  }
  if (explicitProvider === 'codex') return codexRuntime;
  if (explicitProvider === 'openai') return openAIRuntime;
  return codexRuntime;
}

class DefaultCodexAgentRuntime implements CodexAgentRuntime {
  constructor(
    private readonly options: {
      client: CodexResponseRequester;
      disabled: boolean;
      env: NodeJS.ProcessEnv;
      modelResolver?: CodexModelResolver;
    }
  ) {}

  async invoke(invocation: CodexAgentInvocation): Promise<CodexAgentResult> {
    const model = await this.resolveModel(invocation.model, invocation.tenantId);
    if (this.options.disabled) return fallback(codexProvider(), model, 'codex_agent_disabled');
    const credentials = await resolveCodexOAuth();
    if (!credentials) return fallback(codexProvider(), model, 'codex_oauth_not_configured');

    try {
      const response = await this.options.client.createResponse(credentials, {
        model,
        instructions: instructionsFor(invocation.surface),
        input: [{
          role: 'user',
          content: JSON.stringify({
            surface: invocation.surface,
            userPrompt: invocation.userPrompt,
            deterministicResult: invocation.deterministicResult ?? null,
            systemContext: invocation.systemContext ?? null
          })
        }],
        maxOutputTokens: 900
      });
      return resultFromResponse(codexProvider(), model, response);
    } catch (error) {
      return fallback(codexProvider(), model, 'codex_request_failed', safeErrorMessage(error));
    }
  }

  async runToolLoop<TFallback>(
    invocation: CodexAgentToolLoopInvocation<TFallback>
  ): Promise<CodexAgentToolLoopResult<TFallback>> {
    const model = await this.resolveModel(invocation.model, invocation.tenantId);
    const provider = codexProvider();
    if (this.options.disabled) {
      return runCodexAgentToolLoop({
        client: this.options.client,
        credentials: null,
        disabled: true,
        invocation,
        model,
        provider
      });
    }
    const credentials = await resolveCodexOAuth();
    if (!credentials) {
      return runCodexAgentToolLoop({
        client: this.options.client,
        credentials: null,
        disabled: true,
        invocation,
        model,
        provider: { ...provider, disabledReason: 'codex_oauth_not_configured' }
      });
    }
    return runCodexAgentToolLoop({
      client: this.options.client,
      credentials,
      disabled: false,
      invocation,
      model,
      provider
    });
  }

  private async resolveModel(modelOverride?: string, tenantId?: string | null): Promise<string> {
    if (modelOverride?.trim()) return resolveCodexModel(modelOverride, this.options.env);
    try {
      const modelOptions = tenantId === undefined ? undefined : { tenantId };
      return resolveCodexModel(await this.options.modelResolver?.(modelOptions) ?? undefined, this.options.env);
    } catch {
      return resolveCodexModel(undefined, this.options.env);
    }
  }
}
