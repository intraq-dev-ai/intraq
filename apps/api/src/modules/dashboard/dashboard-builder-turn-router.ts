import type { BuilderAgentRequest } from '@intraq/contracts';
import type {
  CodexAgentResult,
  CodexAgentRuntime
} from '../codex-agent/codex-agent-runtime.js';
import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';

export type DashboardBuilderTurnIntent =
  | 'conversation'
  | 'create_component'
  | 'missing_context'
  | 'update_dashboard_style'
  | 'update_selected_component';

export interface DashboardBuilderRouteDecision {
  intent: DashboardBuilderTurnIntent;
  suggestedActions: string[];
  summary: string | null;
  title: string | null;
  type: 'dashboard-builder-route';
}

export interface DashboardBuilderRouteResult {
  agentProvider: CodexAgentResult;
  decision: DashboardBuilderRouteDecision | null;
}

export async function routeDashboardBuilderTurn(
  input: {
    codexAgent: CodexAgentRuntime;
    model?: string;
    request: BuilderAgentRequest;
    tenantId?: string | null;
  }
): Promise<DashboardBuilderRouteResult> {
  const routeResult = await input.codexAgent.runToolLoop<DashboardBuilderRouteDecision>({
    surface: 'dashboard-builder',
    userPrompt: input.request.prompt,
    context: buildRouteContext(input.request),
    instructions: dashboardBuilderRouteInstructions(),
    maxOutputTokens: 500,
    maxTurns: 2,
    tenantId: input.tenantId ?? null,
    fallback: () => ({
      intent: 'missing_context',
      suggestedActions: [],
      summary: 'Dashboard Builder AI route selection is unavailable.',
      title: 'Dashboard AI unavailable',
      type: 'dashboard-builder-route'
    }),
    tools: [dashboardBuilderRouteTool()],
    ...(input.model ? { model: input.model } : {})
  });

  if (routeResult.type === 'tool_result' && isDashboardBuilderRouteDecision(routeResult.toolResult)) {
    return {
      agentProvider: routeResult.provider,
      decision: routeResult.toolResult
    };
  }

  return {
    agentProvider: routeResult.provider,
    decision: null
  };
}

function dashboardBuilderRouteTool(): CodexAgentTool {
  return {
    terminal: isDashboardBuilderRouteDecision,
    definition: {
      type: 'function',
      name: 'route_dashboard_builder_user_turn',
      description: 'Semantically classify one Dashboard Builder user turn. Choose conversation for social chat, acknowledgements, status comments, capability questions, or any turn that does not explicitly ask for a dashboard action. Choose missing_context only when there is an explicit dashboard action but the selected context is insufficient.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          intent: {
            type: 'string',
            enum: ['conversation', 'create_component', 'missing_context', 'update_dashboard_style', 'update_selected_component'],
            description: 'Semantic dashboard-builder user-turn intent.'
          },
          suggestedActions: {
            type: 'array',
            description: 'Useful next Dashboard Builder prompts.',
            items: { type: 'string' }
          },
          summary: {
            type: 'string',
            description: 'Direct user-facing response for conversation or missing_context routes. Do not explain the route classification.'
          },
          title: {
            type: 'string',
            description: 'Short user-facing route title.'
          }
        },
        required: ['intent']
      }
    },
    run: args => ({
      intent: parseDashboardBuilderTurnIntent(asNonEmptyString(args.intent)),
      suggestedActions: asStringArray(args.suggestedActions),
      summary: asNonEmptyString(args.summary),
      title: asNonEmptyString(args.title),
      type: 'dashboard-builder-route'
    })
  };
}

function dashboardBuilderRouteInstructions(): string {
  return [
    'You are only routing the latest Dashboard Builder user turn.',
    'Return exactly one route_dashboard_builder_user_turn tool call.',
    'Route as conversation unless the user explicitly asks to create, add, edit, change, remove, filter, format, chart, table, calculate, or answer a dashboard/business-data request.',
    'Route as create_component only when the user asks for a new KPI card, chart, table, matrix, pie chart, filter, text insight, section heading, or dashboard component.',
    'Route as update_dashboard_style when the user asks to apply, change, reset, or update the design theme for the whole dashboard.',
    'Route as update_selected_component only when request.mode is update, a selected component exists, and the user asks to change that selected component.',
    'Static text insights and whole-dashboard theme changes do not require a selected data model.',
    'Route as missing_context only when there is a data-backed dashboard action or business-data request that cannot safely proceed with the selected context.',
    'For social chat, acknowledgements, status comments, greetings, and capability questions, route as conversation and answer naturally without explaining the classification.',
    'Do not choose create_component or update_selected_component for vague social statements or positive/negative reactions.'
  ].join('\n');
}

function buildRouteContext(request: BuilderAgentRequest): Record<string, unknown> {
  return {
    request: {
      componentType: request.componentType ?? null,
      dataSourceId: request.dataSourceId ?? null,
      dataSourceTableId: request.dataSourceTableId ?? null,
      elementId: request.elementId ?? null,
      hasSelectedComponent: Boolean(request.elementId),
      hasSelectedModel: Boolean(request.dataSourceTableId || request.dataModel),
      mode: request.mode ?? null,
      prompt: request.prompt,
      tableName: request.tableName ?? null,
      visualizationKind: request.visualizationKind ?? null
    }
  };
}

function isDashboardBuilderRouteDecision(value: unknown): value is DashboardBuilderRouteDecision {
  return isRecord(value)
    && value.type === 'dashboard-builder-route'
    && parseDashboardBuilderTurnIntent(asNonEmptyString(value.intent)) === value.intent
    && Array.isArray(value.suggestedActions)
    && value.suggestedActions.every(item => typeof item === 'string')
    && (typeof value.summary === 'string' || value.summary === null)
    && (typeof value.title === 'string' || value.title === null);
}

function parseDashboardBuilderTurnIntent(value: string | null): DashboardBuilderTurnIntent {
  if (
    value === 'conversation'
    || value === 'create_component'
    || value === 'missing_context'
    || value === 'update_dashboard_style'
    || value === 'update_selected_component'
  ) {
    return value;
  }
  return 'conversation';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asNonEmptyString).filter((item): item is string => Boolean(item)).slice(0, 4)
    : [];
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
