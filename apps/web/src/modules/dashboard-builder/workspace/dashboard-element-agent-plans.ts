import type { BuilderFieldReference } from '@intraq/contracts';
import {
  planDashboardElement,
  recommendDashboardDataModel
} from '../api';
import {
  applyBuilderActionPlan,
  BuilderActionPlanNoopError
} from '../agent-context/action-plan-applicator';
import {
  chooseDefaultAiTable,
  chooseTableForPrompt,
  chooseTableForRecommendation
} from '../agent-context/element-planner';
import { isDashboardAiReadyDataModel } from '../agent-context/ai-ready-data-model';
import { chartTypeForElement } from '../dashboard-element-normalization';
import type {
  BuilderActionPlan,
  BuilderAgentResponse,
  BuilderConversationResponse,
  Dashboard,
  DashboardAgentMessage,
  DashboardElement
} from '../types';
import { DashboardActionHandledError } from './dashboard-action-errors';
import {
  dashboardCreateProgressMessage,
  dashboardElementFieldLabels,
  dashboardUpdateProgressMessage,
  readString
} from './dashboard-agent-conversation';
import { dashboardAgentFieldReferences } from './dashboard-agent-field-references';
import {
  agentFailureMessage,
  appendAgentMessage,
  conversationResponseMessage,
  planMessage,
  replaceAgentMessage,
  selectedElementUpdateMessage
} from './dashboard-element-agent-messages';
import {
  selectedElementUpdatePatch,
  type ElementPatch
} from './dashboard-element-patches';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

export async function buildAppliedPlan(
  state: DashboardWorkspaceState,
  dashboardId: string,
  elementCount: number,
  overrides: Record<string, unknown> = {},
  promptOverride?: string
) {
  const prompt = promptOverride ?? state.prompt.value.trim();
  if (!prompt) throw new Error('Ask Dashboard AI a business question first.');
  state.lastAgentPrompt.value = prompt;
  state.actionPlan.value = null;
  appendAgentMessage(state, {
    role: 'user',
    kind: 'prompt',
    body: prompt
  });
  state.prompt.value = '';
  const progressMessageId = appendAgentMessage(state, dashboardCreateProgressMessage());
  const source = state.selectedDataSource.value;
  if (source) state.selectedDataSourceId.value = source.id;
  const explicitlySelectedTable = state.selectedTableUserSelected.value ? state.selectedTable.value : null;
  try {
    state.dataModelRecommendation.value = source
      ? await recommendDashboardDataModel(prompt, source.id)
      : null;
  } catch {
    const message = 'I could not check the best data model for this request. Please try again.';
    replaceAgentMessage(state, progressMessageId, agentFailureMessage(message));
    throw new DashboardActionHandledError(message, 'Dashboard AI failed');
  }
  const inferredTable = explicitlySelectedTable
    ?? chooseTableForRecommendation(source, state.dataModelRecommendation.value)
    ?? chooseTableForPrompt(source, prompt, state.selectedTableId.value, { allowSelectedFallback: false })
    ?? chooseDefaultAiTable(source, state.selectedTableId.value);
  if (inferredTable) state.selectedTableId.value = inferredTable.id;
  let plannedResponse: BuilderAgentResponse;
  try {
    plannedResponse = await planDashboardElement(prompt, builderAgentContext(dashboardId, {
      ...overrides,
      ...(source ? { dataSourceId: source.id } : {}),
      ...(inferredTable ? { dataSourceTableId: inferredTable.id, tableName: inferredTable.name } : {}),
      fieldReferences: dashboardAgentFieldReferences(prompt, inferredTable)
    }, state.agentConversationId.value));
  } catch {
    const message = 'I could not finish planning this dashboard component. Please try again.';
    replaceAgentMessage(state, progressMessageId, agentFailureMessage(message));
    throw new DashboardActionHandledError(message, 'Dashboard AI failed');
  }
  state.agentConversationId.value = plannedResponse.conversationId ?? state.agentConversationId.value;
  if (isBuilderConversationResponse(plannedResponse)) {
    replaceAgentMessage(state, progressMessageId, conversationResponseMessage(plannedResponse));
    throw new DashboardActionHandledError(plannedResponse.summary, 'Dashboard AI answered');
  }
  state.actionPlan.value = plannedResponse;
  try {
    const appliedPlan = applyBuilderActionPlan({
      prompt,
      plan: state.actionPlan.value,
      source,
      table: inferredTable,
      recommendation: state.dataModelRecommendation.value,
      elementCount
    });
    return {
      appliedPlan,
      fieldLabels: dashboardElementFieldLabels(appliedPlan.element, inferredTable),
      progressMessageId,
      assistantMessage: planMessage(
        state.actionPlan.value,
        state.dataModelRecommendation.value,
        inferredTable,
        'plan'
      )
    };
  } catch (caught) {
    replaceAgentMessage(state, progressMessageId, planMessage(
      state.actionPlan.value,
      state.dataModelRecommendation.value,
      inferredTable,
      'model_context'
    ));
    if (caught instanceof BuilderActionPlanNoopError) {
      throw new DashboardActionHandledError(caught.message, 'Dashboard AI needs more detail');
    }
    throw caught;
  }
}

export async function buildSelectedElementUpdatePlan(
  state: DashboardWorkspaceState,
  dashboardId: string,
  element: Dashboard['elements'][number]
): Promise<{
  assistantMessage: Omit<DashboardAgentMessage, 'id'>;
  fieldLabels: string[];
  patch: (ElementPatch & { dataSourceId?: string; layout?: Record<string, unknown> }) | null;
  plan: BuilderActionPlan;
  progressMessageId: string;
}> {
  const prompt = state.prompt.value.trim();
  if (!prompt) throw new Error('Ask Dashboard AI what to change first.');
  state.lastAgentPrompt.value = prompt;
  state.actionPlan.value = null;
  appendAgentMessage(state, { role: 'user', kind: 'prompt', body: prompt });
  state.prompt.value = '';
  const progressMessageId = appendAgentMessage(state, dashboardUpdateProgressMessage(element.name));

  const contextSourceId = readString(element.dataSourceId)
    ?? readString(element.config?.dataSourceId)
    ?? state.selectedDataSource.value?.id;
  const contextSource = state.dataSources.value.find(item => item.id === contextSourceId) ?? state.selectedDataSource.value;
  const explicitlySelectedTable = state.selectedTableUserSelected.value ? state.selectedTable.value : null;
  const savedTableName = readString(element.config?.tableName) ?? explicitlySelectedTable?.name;
  const savedTableId = readString(element.config?.dataSourceTableId) ?? explicitlySelectedTable?.id;
  const contextTable = contextSource?.tables.find(table =>
    table.id === savedTableId
    || table.name === savedTableName
    || table.dictionary?.businessName === savedTableName
  ) ?? null;
  const aiContextTable = isDashboardAiReadyDataModel(contextTable) ? contextTable : null;
  let plannedResponse: BuilderAgentResponse;
  try {
    const agentContext: {
      componentType?: unknown;
      dataSourceId?: string;
      dataSourceTableId?: string;
      elementId?: unknown;
      elementSnapshot?: Record<string, unknown>;
      fieldReferences?: BuilderFieldReference[];
      mode?: unknown;
      tableName?: string;
    } = {
      componentType: componentTypeForElement(element),
      elementId: element.id,
      elementSnapshot: selectedElementSnapshot(element),
      fieldReferences: dashboardAgentFieldReferences(prompt, contextTable),
      mode: 'update'
    };
    if (contextSourceId) agentContext.dataSourceId = contextSourceId;
    if (contextTable?.id) agentContext.dataSourceTableId = contextTable.id;
    if (contextTable?.name) agentContext.tableName = contextTable.name;
    plannedResponse = await planDashboardElement(prompt, builderAgentContext(dashboardId, agentContext, state.agentConversationId.value));
  } catch {
    const message = 'I could not finish planning this update. Please try again.';
    replaceAgentMessage(state, progressMessageId, agentFailureMessage(message));
    throw new DashboardActionHandledError(message, 'Dashboard AI failed');
  }
  state.agentConversationId.value = plannedResponse.conversationId ?? state.agentConversationId.value;
  if (isBuilderConversationResponse(plannedResponse)) {
    replaceAgentMessage(state, progressMessageId, conversationResponseMessage(plannedResponse));
    throw new DashboardActionHandledError(plannedResponse.summary, 'Dashboard AI answered');
  }
  state.actionPlan.value = plannedResponse;
  const patch = selectedElementUpdatePatch(element, plannedResponse);
  const patchedConfig = patch?.config ?? element.config;
  const elementForLabels = patch
    ? { ...element, ...patch, ...(patchedConfig ? { config: patchedConfig } : {}) }
    : element;
  return {
    assistantMessage: selectedElementUpdateMessage(plannedResponse, element),
    fieldLabels: patch ? dashboardElementFieldLabels(elementForLabels, aiContextTable) : [],
    patch,
    plan: plannedResponse,
    progressMessageId
  };
}

function builderAgentContext(
  dashboardId: string,
  context: {
    componentType?: unknown;
    dataSourceId?: string;
    dataSourceTableId?: string;
    elementId?: unknown;
    elementSnapshot?: Record<string, unknown>;
    fieldReferences?: BuilderFieldReference[];
    mode?: unknown;
    tableName?: string;
  },
  conversationId = ''
): {
  componentType?: string;
  conversationId?: string;
  dashboardId?: string;
  dataSourceId?: string;
  dataSourceTableId?: string;
  elementId?: string;
  elementSnapshot?: Record<string, unknown>;
  fieldReferences?: BuilderFieldReference[];
  mode?: 'create' | 'update';
  tableName?: string;
} {
  const mode = context.mode === 'update' ? 'update' : context.mode === 'create' ? 'create' : undefined;
  return {
    ...(dashboardId ? { dashboardId } : {}),
    ...(context.dataSourceId ? { dataSourceId: context.dataSourceId } : {}),
    ...(context.dataSourceTableId ? { dataSourceTableId: context.dataSourceTableId } : {}),
    ...(typeof context.tableName === 'string' && context.tableName ? { tableName: context.tableName } : {}),
    ...(typeof context.elementId === 'string' && context.elementId ? { elementId: context.elementId } : {}),
    ...(context.elementSnapshot ? { elementSnapshot: context.elementSnapshot } : {}),
    ...(typeof context.componentType === 'string' && context.componentType ? { componentType: context.componentType } : {}),
    ...(context.fieldReferences?.length ? { fieldReferences: context.fieldReferences } : {}),
    ...(mode ? { mode } : {}),
    ...(conversationId ? { conversationId } : {})
  };
}

function selectedElementSnapshot(element: DashboardElement): Record<string, unknown> {
  return {
    id: element.id,
    name: element.name,
    type: element.type,
    ...(element.chartType ? { chartType: element.chartType } : {}),
    config: {
      title: element.config?.title,
      xField: element.config?.xField,
      ySeries: element.config?.ySeries,
      valueField: element.config?.valueField,
      columns: element.config?.columns,
      rowFields: element.config?.rowFields,
      columnFields: element.config?.columnFields,
      valueFields: element.config?.valueFields,
      field: element.config?.field,
      text: element.config?.text,
      textVariant: element.config?.textVariant,
      tone: element.config?.tone,
      badge: element.config?.badge,
      showIcon: element.config?.showIcon,
      tableName: element.config?.tableName,
      dataSourceTableId: element.config?.dataSourceTableId,
      dataModelName: element.config?.dataModelName
    }
  };
}

function isBuilderConversationResponse(response: BuilderAgentResponse): response is BuilderConversationResponse {
  return response.type === 'conversation';
}

function componentTypeForElement(element: { type: string; chartType?: string }): 'card' | 'chart' | 'filter' | 'matrix' | 'pie' | 'table' | 'text' {
  if (element.type === 'text') return 'text';
  if (element.type === 'filter') return 'filter';
  if (element.type === 'table' || element.type === 'card' || element.type === 'matrix') return element.type;
  const chartType = chartTypeForElement(element, '');
  if (chartType === 'pie' || chartType === 'doughnut') return 'pie';
  return 'chart';
}
