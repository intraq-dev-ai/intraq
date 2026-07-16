import type { DashboardBuilderAgent } from '@intraq/agent-core';
import type {
  BuilderAgentRequest,
  BuilderAgentResponse
} from '@intraq/contracts';
import type { CodexAgentResult, CodexAgentRuntime } from '../codex-agent/codex-agent-runtime.js';
import type { CodexAgentToolLoopResult } from '../codex-agent/codex-agent-tool-loop.js';
import { suggestedDashboardBuilderActionsForRequest } from './dashboard-builder-evidence-gate.js';
import {
  dashboardBuilderTools
} from './dashboard-builder-agent-tools.js';
import {
  buildLoopContext,
  dashboardBuilderToolLoopInstructions
} from './dashboard-builder-agent-tool-support.js';
import { localDashboardBuilderFallback } from './local-dashboard-builder-fallback.js';
import {
  conversationResult,
  dashboardBuilderUnavailableMessage,
  isBuilderAgentResponse,
  isSelectedComponentUpdateRequest,
  sanitizeDashboardBuilderResponse
} from './dashboard-builder-agent-results.js';
import { readPositiveInteger } from './dashboard-builder-agent-values.js';
import { routeDashboardBuilderTurn } from './dashboard-builder-turn-router.js';

export interface DashboardBuilderAgentLoopInput {
  blockedDataResponse?: BuilderAgentResponse;
  builderAgent: DashboardBuilderAgent;
  codexAgent: CodexAgentRuntime;
  fallback?: BuilderAgentResponse;
  model?: string;
  request: BuilderAgentRequest;
  tenantId?: string | null;
}

export interface DashboardBuilderAgentLoopResult {
  agentProvider: CodexAgentResult;
  response: BuilderAgentResponse;
}

export class DashboardBuilderAgentUnavailableError extends Error {
  constructor(
    readonly agentProvider: CodexAgentResult,
    message: string
  ) {
    super(message);
    this.name = 'DashboardBuilderAgentUnavailableError';
  }
}

const DASHBOARD_BUILDER_AGENT_TIMEOUT_MS = readPositiveInteger(process.env.DASHBOARD_BUILDER_AGENT_TIMEOUT_MS, 8_000);

export async function runDashboardBuilderAgentLoop(
  input: DashboardBuilderAgentLoopInput
): Promise<DashboardBuilderAgentLoopResult> {
  const localFallback = input.fallback ?? localDashboardBuilderFallback(input.request, input.builderAgent);
  if (localFallback) {
    return {
      agentProvider: {
        provider: 'codex',
        auth: 'oauth',
        model: 'local-metadata',
        used: false,
        responseText: null,
        fallbackReason: 'local_metadata_plan'
      },
      response: sanitizeDashboardBuilderResponse(localFallback)
    };
  }
  const routeResult = await routeDashboardBuilderTurn({
    codexAgent: input.codexAgent,
    ...(input.model ? { model: input.model } : {}),
    request: input.request,
    tenantId: input.tenantId ?? null
  });
  if (!routeResult.decision) {
    throw new DashboardBuilderAgentUnavailableError(
      routeResult.agentProvider,
      dashboardBuilderUnavailableMessage(routeResult.agentProvider)
    );
  }
  if (routeResult.decision.intent === 'conversation') {
    return {
      agentProvider: routeResult.agentProvider,
      response: conversationResult(input.request, {
        title: 'Dashboard AI',
        summary: 'I can help create or edit dashboard components using the selected model context.',
        suggestedActions: routeResult.decision.suggestedActions
      })
    };
  }
  if (routeResult.decision.intent === 'missing_context') {
    return {
      agentProvider: routeResult.agentProvider,
      response: input.blockedDataResponse ?? conversationResult(input.request, {
        title: routeResult.decision.title ?? 'Dashboard Builder Needs Data Context',
        summary: routeResult.decision.summary
          ?? 'I need a selected data model, metric, dimension, or component context before making that dashboard change.',
        suggestedActions: routeResult.decision.suggestedActions
      })
    };
  }
  if (routeResult.decision.intent === 'update_selected_component' && !isSelectedComponentUpdateRequest(input.request)) {
    return {
      agentProvider: routeResult.agentProvider,
      response: conversationResult(input.request, {
        title: 'Select a component',
        summary: 'Select a dashboard component before asking me to edit it.',
        suggestedActions: suggestedDashboardBuilderActionsForRequest(input.request)
      })
    };
  }
  if (
    routeResult.decision.intent === 'update_selected_component'
    && input.blockedDataResponse
    && !isSelectedTextComponentRequest(input.request)
  ) {
    return {
      agentProvider: routeResult.agentProvider,
      response: input.blockedDataResponse
    };
  }
  if (routeResult.decision.intent === 'create_component' && isSelectedComponentUpdateRequest(input.request)) {
    return {
      agentProvider: routeResult.agentProvider,
      response: conversationResult(input.request, {
        title: 'Editing selected component',
        summary: 'I can only update the selected component while it is open for editing. Stop editing it before creating another component.',
        suggestedActions: suggestedDashboardBuilderActionsForRequest(input.request)
      })
    };
  }
  if (routeResult.decision.intent === 'update_dashboard_style' && isSelectedComponentUpdateRequest(input.request)) {
    return {
      agentProvider: routeResult.agentProvider,
      response: conversationResult(input.request, {
        title: 'Finish component editing first',
        summary: 'Stop editing the selected component before changing the whole dashboard theme.',
        suggestedActions: suggestedDashboardBuilderActionsForRequest(input.request)
      })
    };
  }
  const loopResult = await withDashboardBuilderTimeout(input.codexAgent.runToolLoop<BuilderAgentResponse>({
    surface: 'dashboard-builder',
    userPrompt: input.request.prompt,
    context: buildLoopContext(input.request),
    instructions: dashboardBuilderToolLoopInstructions(),
    maxOutputTokens: 1400,
    maxTurns: 3,
    tenantId: input.tenantId ?? null,
    fallback: () => input.fallback ?? null as unknown as BuilderAgentResponse,
    tools: dashboardBuilderTools(input, routeResult.decision.intent),
    ...(input.model ? { model: input.model } : {})
  }), input.fallback);

  if (loopResult.type === 'answer') {
    return {
      agentProvider: loopResult.provider,
      response: conversationResult(input.request, {
        title: 'Dashboard AI',
        summary: loopResult.answer ?? 'No answer returned.',
        suggestedActions: suggestedDashboardBuilderActionsForRequest(input.request)
      })
    };
  }

  if (loopResult.type === 'fallback') {
    throw new DashboardBuilderAgentUnavailableError(
      loopResult.provider,
      dashboardBuilderUnavailableMessage(loopResult.provider)
    );
  }

  if (loopResult.type === 'tool_result' && isBuilderAgentResponse(loopResult.toolResult)) {
    return {
      agentProvider: loopResult.provider,
      response: sanitizeDashboardBuilderResponse(loopResult.toolResult)
    };
  }

  throw new DashboardBuilderAgentUnavailableError(
    loopResult.provider,
    dashboardBuilderUnavailableMessage(loopResult.provider)
  );
}

async function withDashboardBuilderTimeout(
  loopResult: Promise<CodexAgentToolLoopResult<BuilderAgentResponse>>,
  fallback?: BuilderAgentResponse
): Promise<CodexAgentToolLoopResult<BuilderAgentResponse>> {
  return Promise.race([
    loopResult,
    new Promise<CodexAgentToolLoopResult<BuilderAgentResponse>>((resolve, reject) => {
      setTimeout(() => {
        const provider = {
          provider: agentProviderName(),
          auth: agentProviderName() === 'openai' ? 'api_key' as const : 'oauth' as const,
          model: agentProviderName() === 'openai'
            ? process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-nano'
            : process.env.CODEX_MODEL?.trim() ?? 'gpt-5.5',
          used: false,
          responseText: null,
          fallbackReason: agentProviderName() === 'openai' ? 'openai_request_timeout' : 'codex_request_timeout'
        };
        if (fallback) {
          resolve({
            answer: null,
            provider,
            toolName: null,
            toolResult: fallback,
            turns: 0,
            type: 'fallback'
          });
          return;
        }
        reject(new DashboardBuilderAgentUnavailableError(provider, 'Dashboard Builder AI request timed out.'));
      }, DASHBOARD_BUILDER_AGENT_TIMEOUT_MS);
    })
  ]);
}

function agentProviderName(): CodexAgentResult['provider'] {
  const value = process.env.AI_AGENT_PROVIDER?.trim().toLowerCase()
    || process.env.INTRAQ_AI_PROVIDER?.trim().toLowerCase()
    || process.env.AGENT_PROVIDER?.trim().toLowerCase();
  return value === 'openai' ? 'openai' : 'codex';
}

function isSelectedTextComponentRequest(request: BuilderAgentRequest): boolean {
  if (request.componentType === 'text') return true;
  return isRecord(request.elementSnapshot) && request.elementSnapshot.type === 'text';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
