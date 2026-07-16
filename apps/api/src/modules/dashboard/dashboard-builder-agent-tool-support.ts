import type { BuilderAgentRequest } from '@intraq/contracts';
import { buildDashboardBuilderEvidenceGate } from './dashboard-builder-evidence-gate.js';
import {
  asNonEmptyString,
  parseComponentType,
  parseMode,
  parseVisualizationKind
} from './dashboard-builder-agent-values.js';

export function dashboardBuilderToolLoopInstructions(): string {
  return [
    'You are the Dashboard Builder backend agent.',
    'Decide whether the user needs a conversational answer, a dashboard component plan, a whole-dashboard theme change, or data-model/context clarification.',
    'The latest user turn has already been semantically routed; choose the terminal tool that matches that routed intent.',
    'If the latest user turn does not explicitly ask to create, add, edit, change, remove, filter, format, chart, table, calculate, style, or answer a dashboard/business-data request, route it as conversation.',
    'Use missing_context only for a data-backed dashboard action or business-data request that cannot safely proceed with the selected context.',
    'Do not create or update a component unless the route and tool arguments identify an actionable component type, visualization type, field, style, title, option, or table setting.',
    'Use answer_dashboard_builder for chat, help, greetings, capability questions, and non-mutating dashboard guidance.',
    'When request.mode is update and request.elementId is present, use update_dashboard_component_style for selected-component content, style, title, chart type, legend, label, color, formatting, field remapping, or option changes.',
    'When request.mode is update, stay scoped to request.elementSnapshot and answer or act only about that selected component.',
    'When request.mode is update, use conversation.recentMessages to resolve short follow-up corrections against the latest selected-component edit intent.',
    'If the recent selected-component exchange was about title or rename and the latest user message is a short correction, keep the action as a title update unless the user explicitly asks to change chart type or visualization type.',
    'Only set chartType when the latest user request explicitly asks to change the chart, graph, visualization, or visual type.',
    'Treat context.fieldReferences as explicit user-selected fields from @ mentions. Prefer those exact fields over inferred labels, and never substitute a different field when an exact reference is present.',
    'When request.mode is update and the user asks to create, add, duplicate, replace with another component, or change a different component, answer that editing mode can only update the selected component and tell them to stop editing before creating another component.',
    'When request.mode is update and no selected element context is available, ask for component clarification instead of creating a new component.',
    'Use create_dashboard_component_plan when the user asks to create a chart, KPI card, table, matrix, pie chart, filter, text insight, or section heading.',
    'Text insights and section headings are native plain-text components. Never return HTML, CSS, scripts, or embedded markup.',
    'Use apply_dashboard_design_theme when the user asks to change the whole dashboard theme. Use operational-health for compact management health checks with severity-led KPI cards, insight bands, charts, and action tables.',
    'When using create_dashboard_component_plan, pass visualizationKind from the user intent or the recommendedVisualizations in dashboardEvidenceGate.',
    'Do not use create_dashboard_component_plan when request.mode is update.',
    'Use request_model_context_or_clarification when selected metadata/context is missing or the requested metric, dimension, table, or component is ambiguous.',
    'Do not invent database columns, table names, tenant data, IDs, metrics, or field semantics.',
    'Treat dashboardEvidenceGate as the source of truth for supported models, fields, measures, dimensions, and visualization recommendations.',
    'Only create data-backed plans from fields and model details present in dashboardEvidenceGate.',
    'Do not expose internal setup details, evidence handling, or metadata implementation in user-facing summaries.',
    'Say data model, model context, model details, or available fields instead.',
    'Keep summaries concise and operator-facing.'
  ].join('\n');
}

export function buildLoopContext(request: BuilderAgentRequest): Record<string, unknown> {
  return {
    request: {
      conversationId: request.conversationId ?? null,
      dashboardId: request.dashboardId ?? null,
      dataSourceId: request.dataSourceId ?? null,
      dataSourceTableId: request.dataSourceTableId ?? null,
      elementId: request.elementId ?? null,
      elementSnapshot: request.elementSnapshot ?? null,
      mode: request.mode ?? null,
      prompt: request.prompt,
      tableName: request.tableName ?? null
    },
    conversation: {
      recentMessages: (request.conversationMessages ?? [])
        .slice(-8)
        .map(message => ({ content: message.content, role: message.role }))
    },
    fieldReferences: request.fieldReferences ?? [],
    dashboardEvidenceGate: buildDashboardBuilderEvidenceGate(request)
  };
}

export function recoverableDashboardRouteRequiredResult(): Record<string, unknown> {
  return {
    success: false,
    error: 'Dashboard Builder tool does not match the semantically routed user turn.',
    nextStep: 'Use the tool that matches the routed user-turn intent.'
  };
}

export function recoverableDashboardActionIntentRequiredResult(): Record<string, unknown> {
  return {
    success: false,
    error: 'Dashboard Builder needs an explicit actionable dashboard request before creating or updating a component.',
    nextStep: 'If the latest user turn is social chat, acknowledgement, or general conversation, return a conversation response instead of a component action.'
  };
}

export function hasCreateComponentSelection(
  request: BuilderAgentRequest,
  args: Record<string, unknown>
): boolean {
  return Boolean(
    parseComponentType(args.componentType)
    || parseVisualizationKind(args.visualizationKind)
    || parseComponentType(request.componentType)
    || parseVisualizationKind(request.visualizationKind)
  );
}

export function requestWithToolSelections(
  request: BuilderAgentRequest,
  args: Record<string, unknown>
): BuilderAgentRequest {
  const selectedRequest: BuilderAgentRequest = { ...request };
  const componentType = parseComponentType(args.componentType);
  const mode = parseMode(args.mode);
  const tableName = asNonEmptyString(args.tableName);
  const visualizationKind = parseVisualizationKind(args.visualizationKind);
  if (componentType) selectedRequest.componentType = componentType;
  if (mode) selectedRequest.mode = mode;
  if (tableName) selectedRequest.tableName = tableName;
  if (visualizationKind) selectedRequest.visualizationKind = visualizationKind;
  if (componentType === 'text' || visualizationKind === 'text') {
    const badge = asNonEmptyString(args.badge);
    const content = asNonEmptyString(args.text);
    const title = asNonEmptyString(args.title);
    const tone = readTextTone(args.tone);
    const variant = readTextVariant(args.textVariant);
    selectedRequest.textComponent = {
      ...(badge ? { badge } : {}),
      ...(content ? { content } : {}),
      ...(typeof args.showIcon === 'boolean' ? { showIcon: args.showIcon } : {}),
      ...(title ? { title } : {}),
      ...(tone ? { tone } : {}),
      ...(variant ? { variant } : {})
    };
  }
  return selectedRequest;
}

function readTextTone(value: unknown): NonNullable<NonNullable<BuilderAgentRequest['textComponent']>['tone']> | null {
  return value === 'neutral' || value === 'info' || value === 'success' || value === 'warning' || value === 'critical'
    ? value
    : null;
}

function readTextVariant(value: unknown): NonNullable<NonNullable<BuilderAgentRequest['textComponent']>['variant']> | null {
  return value === 'body' || value === 'section' || value === 'insight' ? value : null;
}
