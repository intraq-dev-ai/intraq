import {
  customerFacingDashboardAgentDetails,
  customerFacingDashboardAgentText,
  evidenceDetails,
  fieldDetail,
  readString
} from './dashboard-agent-conversation';
import { modelNameFromSummary } from './dashboard-agent-prompt-utils';
import type {
  BuilderActionPlan,
  BuilderConversationResponse,
  BuilderDataTable,
  DashboardAgentMessage,
  DashboardElement,
  DataModelRecommendation
} from '../types';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

let agentMessageCounter = 0;

export const DASHBOARD_AI_UNDO_ACTION = Object.freeze({ id: 'undo-ai-change', label: 'Undo' });

export function appendAgentMessage(
  state: DashboardWorkspaceState,
  message: Omit<DashboardAgentMessage, 'id'>
): string {
  agentMessageCounter += 1;
  const id = `dashboard-agent-message-${agentMessageCounter}`;
  state.agentMessages.value = [
    ...state.agentMessages.value,
    {
      id,
      ...message
    }
  ].slice(-10);
  return id;
}

export function replaceAgentMessage(
  state: DashboardWorkspaceState,
  messageId: string,
  message: Omit<DashboardAgentMessage, 'id'>
): void {
  state.agentMessages.value = state.agentMessages.value.map(item =>
    item.id === messageId ? { id: messageId, ...message } : item);
}

export function agentFailureMessage(body: string): Omit<DashboardAgentMessage, 'id'> {
  return {
    role: 'assistant',
    kind: 'error',
    title: 'Could not finish',
    body
  };
}

export function withUndoAction(message: Omit<DashboardAgentMessage, 'id'>): Omit<DashboardAgentMessage, 'id'> {
  return {
    ...message,
    actions: [...(message.actions ?? []), DASHBOARD_AI_UNDO_ACTION]
  };
}

export function conversationResponseMessage(response: BuilderConversationResponse): Omit<DashboardAgentMessage, 'id'> {
  return {
    role: 'assistant',
    kind: 'status',
    title: customerFacingDashboardAgentText(response.title),
    body: customerFacingDashboardAgentText(response.summary || response.message),
    details: customerFacingDashboardAgentDetails(response.suggestedActions)
  };
}

export function selectedElementUpdateMessage(
  plan: BuilderActionPlan,
  element: DashboardElement
): Omit<DashboardAgentMessage, 'id'> {
  const clarification = selectedElementClarification(plan);
  if (clarification) {
    return {
      role: 'assistant',
      kind: 'status',
      title: 'More detail needed',
      body: customerFacingDashboardAgentText(clarification),
      details: customerFacingDashboardAgentDetails([
        `Component: ${element.name}`,
        'Tell me the exact setting and value to change.'
      ])
    };
  }
  return {
    role: 'assistant',
    kind: 'plan',
    title: customerFacingDashboardAgentText(plan.title || 'Updated selected component'),
    body: customerFacingDashboardAgentText(plan.summary || `Applied the requested change to ${element.name}.`),
    details: customerFacingDashboardAgentDetails([
      `Component: ${element.name}`,
      element.chartType ? `Visualization: ${element.chartType}` : `Type: ${element.type}`
    ])
  };
}

export function planMessage(
  plan: BuilderActionPlan | null,
  recommendation: DataModelRecommendation | null,
  table: BuilderDataTable | null,
  kind: DashboardAgentMessage['kind']
): Omit<DashboardAgentMessage, 'id'> {
  const clarification = plan?.actions?.find(action => action.action === 'request_clarification');
  const visualization = plan?.visualizations?.[0];
  const modelName = readString(table?.dictionary?.businessName)
    ?? readString(table?.name)
    ?? readString(recommendation?.subjectArea)
    ?? modelNameFromSummary(plan?.summary);
  const details = [
    modelName && modelName !== 'Clarification needed' ? `Model: #${modelName}` : '',
    ...evidenceDetails(table, recommendation),
    visualization?.kind ? `Visualization: ${visualization.kind}` : '',
    fieldDetail('Measures', visualization?.encodings?.filter(encoding => encoding.role === 'measure').map(encoding => encoding.label || encoding.field)),
    fieldDetail('Dimensions', visualization?.encodings?.filter(encoding => encoding.role === 'dimension' || encoding.role === 'time').map(encoding => encoding.label || encoding.field)),
    ...(plan?.knowledgeReferences?.slice(0, 2).map(reference => `KB: ${reference.title}`) ?? [])
  ].filter(Boolean);

  if (clarification) {
    return {
      role: 'assistant',
      kind: 'model_context',
      title: customerFacingDashboardAgentText(plan?.title ?? 'Model context needed'),
      body: customerFacingDashboardAgentText(readString(clarification.params.reason)
        ?? plan?.summary
        ?? 'I need more model details before creating this dashboard element.'),
      details: customerFacingDashboardAgentDetails(details)
    };
  }

  return {
    role: 'assistant',
    kind,
    title: customerFacingDashboardAgentText(plan?.title ?? 'Dashboard plan ready'),
    body: customerFacingDashboardAgentText(plan?.summary ?? 'I planned this from the selected data model.'),
    details: customerFacingDashboardAgentDetails(details)
  };
}

function selectedElementClarification(plan: BuilderActionPlan): string | null {
  const clarification = plan.actions?.find(action => action.action === 'request_clarification');
  if (!clarification) return null;
  return readString(clarification.params.message)
    ?? readString(clarification.params.question)
    ?? readString(clarification.params.reason)
    ?? plan.summary
    ?? 'I need one more detail before I can update the selected component.';
}
