import type {
  BuilderConversationMessage,
  BuilderConversationSnapshot,
  DashboardAgentMessage,
  DashboardElement
} from '../types';
import { customerFacingDashboardAgentText } from './dashboard-agent-conversation';

export const dashboardAgentWelcomeMessage: DashboardAgentMessage = {
  id: 'dashboard-agent-welcome',
  role: 'assistant',
  kind: 'welcome',
  title: 'Dashboard AI',
  body: 'Tell me what you want to see on this dashboard. I can add KPIs, charts, tables, filters, or answer a business question from the selected model.'
};

export function dashboardAgentWelcomeMessageForSelection(
  element: Pick<DashboardElement, 'chartType' | 'name' | 'type'>
): DashboardAgentMessage {
  return {
    id: dashboardAgentWelcomeMessage.id,
    role: 'assistant',
    kind: 'welcome',
    title: 'Editing selected component',
    body: `You are editing "${element.name}". Dashboard AI can only update this selected ${elementTypeLabel(element)} or ask for clarification. Stop editing before creating another component.`,
    details: [
      'Rename selected component',
      'Change selected component chart type',
      'Update selected component fields, colors, legend, labels, or formatting'
    ]
  };
}

export function dashboardAgentMessagesForSelection(
  messages: DashboardAgentMessage[],
  element: Pick<DashboardElement, 'chartType' | 'name' | 'type'> | null
): DashboardAgentMessage[] {
  if (!element) return messages;
  const welcome = dashboardAgentWelcomeMessageForSelection(element);
  return messages.map(message => message.id === dashboardAgentWelcomeMessage.id ? welcome : message);
}

export function dashboardAgentMessagesFromSnapshot(
  snapshot: BuilderConversationSnapshot | null
): DashboardAgentMessage[] {
  if (!snapshot?.messages.length) return [dashboardAgentWelcomeMessage];
  return [
    dashboardAgentWelcomeMessage,
    ...snapshot.messages.slice(-9).map(builderMessageToAgentMessage)
  ];
}

function builderMessageToAgentMessage(message: BuilderConversationMessage): DashboardAgentMessage {
  if (message.role === 'user') {
    return {
      id: message.id,
      role: 'user',
      kind: 'prompt',
      body: message.content
    };
  }

  return {
    id: message.id,
    role: 'assistant',
    kind: message.role === 'status' ? 'status' : 'plan',
    title: message.role === 'status' ? 'Dashboard AI status' : 'Dashboard AI',
    body: customerFacingDashboardAgentText(message.content)
  };
}

function elementTypeLabel(element: Pick<DashboardElement, 'chartType' | 'type'>): string {
  if (element.chartType) return `${chartTypeLabel(element.chartType)} chart`;
  if (element.type === 'card') return 'KPI card';
  if (element.type === 'table') return 'table';
  if (element.type === 'matrix') return 'matrix';
  if (element.type === 'filter') return 'filter';
  return 'component';
}

function chartTypeLabel(value: string): string {
  return value
    .split('_')
    .flatMap(part => part.split('-'))
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}
