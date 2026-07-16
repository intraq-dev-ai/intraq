import {
  runCodexAgentToolLoop,
  type CodexAgentToolLoopInvocation,
  type CodexAgentToolLoopResult
} from './codex-agent-tool-loop.js';
import type {
  CodexAgentInvocation,
  CodexAgentResult,
  CodexAgentRuntime,
  CodexResponseRequester
} from './codex-agent-runtime.js';
import {
  fallback,
  geminiProvider,
  hasGeminiKey,
  hasOpenAIKey,
  instructionsFor,
  openAIProvider,
  resolveGeminiModel,
  resolveOpenAIModel,
  resultFromResponse,
  safeErrorMessage
} from './codex-agent-runtime-utils.js';

export class OpenAIAgentRuntime implements CodexAgentRuntime {
  constructor(
    private readonly options: {
      client: CodexResponseRequester;
      disabled: boolean;
      env: NodeJS.ProcessEnv;
    }
  ) {}

  async invoke(invocation: CodexAgentInvocation): Promise<CodexAgentResult> {
    const config = await this.resolveConfig(invocation.model);
    const model = config.model;
    const provider = openAIProvider();
    if (this.options.disabled) return fallback(provider, model, 'openai_agent_disabled');
    if (!config.hasKey) return fallback(provider, model, 'openai_api_key_not_configured');

    try {
      const response = await config.client.createResponse(null, {
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
      return resultFromResponse(provider, model, response);
    } catch (error) {
      return fallback(provider, model, 'openai_request_failed', safeErrorMessage(error));
    }
  }

  async runToolLoop<TFallback>(
    invocation: CodexAgentToolLoopInvocation<TFallback>
  ): Promise<CodexAgentToolLoopResult<TFallback>> {
    const config = await this.resolveConfig(invocation.model);
    const model = config.model;
    const provider = openAIProvider();
    if (this.options.disabled) {
      return runCodexAgentToolLoop({
        client: config.client,
        credentials: null,
        disabled: true,
        invocation,
        model,
        provider
      });
    }
    if (!config.hasKey) {
      return runCodexAgentToolLoop({
        client: config.client,
        credentials: null,
        disabled: true,
        invocation,
        model,
        provider: { ...provider, disabledReason: 'openai_api_key_not_configured' }
      });
    }
    return runCodexAgentToolLoop({
      client: config.client,
      credentials: null,
      disabled: false,
      invocation,
      model,
      provider
    });
  }

  private async resolveConfig(modelOverride?: string): Promise<{
    client: CodexResponseRequester;
    hasKey: boolean;
    model: string;
  }> {
    const requestedModel = modelOverride?.trim();
    return {
      client: this.options.client,
      hasKey: hasOpenAIKey(this.options.env),
      model: requestedModel || resolveOpenAIModel(this.options.env)
    };
  }
}

export class GeminiAgentRuntime implements CodexAgentRuntime {
  constructor(
    private readonly options: {
      client: CodexResponseRequester;
      disabled: boolean;
      env: NodeJS.ProcessEnv;
    }
  ) {}

  async invoke(invocation: CodexAgentInvocation): Promise<CodexAgentResult> {
    const config = await this.resolveConfig(invocation.model);
    const model = config.model;
    const provider = geminiProvider();
    if (this.options.disabled) return fallback(provider, model, 'gemini_agent_disabled');
    if (!config.hasKey) return fallback(provider, model, 'gemini_api_key_not_configured');

    try {
      const response = await config.client.createResponse(null, {
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
      return resultFromResponse(provider, model, response);
    } catch (error) {
      return fallback(provider, model, 'gemini_request_failed', safeErrorMessage(error));
    }
  }

  async runToolLoop<TFallback>(
    invocation: CodexAgentToolLoopInvocation<TFallback>
  ): Promise<CodexAgentToolLoopResult<TFallback>> {
    const config = await this.resolveConfig(invocation.model);
    const model = config.model;
    const provider = geminiProvider();
    if (this.options.disabled || !config.hasKey) {
      return runCodexAgentToolLoop({
        client: config.client,
        credentials: null,
        disabled: true,
        invocation,
        model,
        provider: {
          ...provider,
          disabledReason: this.options.disabled
            ? 'gemini_agent_disabled'
            : 'gemini_api_key_not_configured'
        }
      });
    }
    return runCodexAgentToolLoop({
      client: config.client,
      credentials: null,
      disabled: false,
      invocation,
      model,
      provider
    });
  }

  private async resolveConfig(modelOverride?: string): Promise<{
    client: CodexResponseRequester;
    hasKey: boolean;
    model: string;
  }> {
    const requestedModel = modelOverride?.trim();
    return {
      client: this.options.client,
      hasKey: hasGeminiKey(this.options.env),
      model: requestedModel || resolveGeminiModel(undefined, this.options.env)
    };
  }
}

export class GeminiPreferredAgentRuntime implements CodexAgentRuntime {
  constructor(
    private readonly fallbackRuntime: CodexAgentRuntime,
    private readonly geminiRuntime: CodexAgentRuntime
  ) {}

  async invoke(invocation: CodexAgentInvocation): Promise<CodexAgentResult> {
    return await this.fallbackRuntime.invoke(invocation);
  }

  async runToolLoop<TFallback>(
    invocation: CodexAgentToolLoopInvocation<TFallback>
  ): Promise<CodexAgentToolLoopResult<TFallback>> {
    if (invocation.preferredProvider !== 'gemini') {
      return await this.fallbackRuntime.runToolLoop(invocation);
    }
    return await this.geminiRuntime.runToolLoop(invocation);
  }
}

function withoutModelOverride<TInvocation extends { model?: string }>(invocation: TInvocation): TInvocation {
  const { model: _model, ...rest } = invocation;
  void _model;
  return rest as TInvocation;
}
