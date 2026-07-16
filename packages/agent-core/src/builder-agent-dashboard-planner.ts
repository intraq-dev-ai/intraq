import type { BuilderAgentRequest, BuilderAgentResult } from '@intraq/contracts';
import {
  buildActionSteps,
  clarificationPlan,
  inferComponentType,
  planSummaryFromVisualization,
  titleFromPrompt
} from './builder-agent-actions.js';
import { createVisualizationSpecFromDataModel } from './builder-agent-visualization-spec.js';
import { slugify } from './builder-agent-text.js';

export function planDashboardElement(request: BuilderAgentRequest): BuilderAgentResult {
  if (request.prompt.trim().length === 0) {
    throw new Error('Dashboard Builder prompt is required.');
  }

  if (request.componentType === 'text' || request.visualizationKind === 'text') {
    return textComponentPlan(request);
  }

  const primaryVisualization = request.dataModel
    ? createVisualizationSpecFromDataModel(request.prompt, request.dataModel, request.componentType, request.visualizationKind)
    : null;
  if (!primaryVisualization) return clarificationPlan(request);
  const visualizations = [primaryVisualization];
  const componentType = request.componentType ?? inferComponentType(primaryVisualization.kind);
  const mode = request.mode ?? (request.elementId ? 'update' : 'create');
  const clientElementId = `dashboard-element-${slugify(request.dataModel?.id || request.dataModel?.name || primaryVisualization.id)}`;

  return {
    type: 'action-plan',
    workflow: 'dashboard-builder',
    mode,
    componentType,
    actions: buildActionSteps(request, componentType, primaryVisualization),
    params: {
      element: {
        clientElementId,
        ...(request.elementId ? { elementId: request.elementId } : {}),
        ...(request.dashboardId ? { dashboardId: request.dashboardId } : {})
      },
      ...(request.dataSourceId ? { dataSourceId: request.dataSourceId } : {}),
      ...(request.dataSourceTableId ? { dataSourceTableId: request.dataSourceTableId } : {}),
      ...(request.tableName ? { tableName: request.tableName } : {}),
      visualizationId: primaryVisualization.id,
      visualizationKind: primaryVisualization.kind
    },
    message: request.prompt,
    title: titleFromPrompt(request.prompt),
    summary: planSummaryFromVisualization(request, primaryVisualization, request.dataModel),
    visualizations,
    knowledgeReferences: []
  };
}

function textComponentPlan(request: BuilderAgentRequest): BuilderAgentResult {
  const presentation = request.textComponent ?? {};
  const title = presentation.title?.trim() || titleFromPrompt(request.prompt) || 'Dashboard Insight';
  const content = presentation.content?.trim() || request.prompt.trim();
  const visualizationId = `viz-${slugify(title || 'dashboard-insight')}`;
  const mode = request.mode ?? (request.elementId ? 'update' : 'create');
  return {
    type: 'action-plan',
    workflow: 'dashboard-builder',
    mode,
    componentType: 'text',
    actions: [{
      action: 'create_text',
      params: {
        title,
        text: content,
        variant: presentation.variant ?? 'insight',
        tone: presentation.tone ?? 'neutral',
        showIcon: presentation.showIcon !== false,
        ...(presentation.badge?.trim() ? { badge: presentation.badge.trim() } : {})
      }
    }],
    params: {
      element: {
        clientElementId: `dashboard-element-${slugify(title || 'dashboard-insight')}`,
        ...(request.elementId ? { elementId: request.elementId } : {}),
        ...(request.dashboardId ? { dashboardId: request.dashboardId } : {})
      },
      visualizationId,
      visualizationKind: 'text'
    },
    message: request.prompt,
    title,
    summary: `Create a native dashboard insight titled "${title}".`,
    visualizations: [{
      id: visualizationId,
      schemaVersion: 1,
      kind: 'text',
      title,
      description: content,
      encodings: [],
      interactions: { tooltip: false, legend: false, crossFilter: false, drilldown: false },
      accessibility: { label: `${title} dashboard insight`, summary: content },
      rendererHints: { requiredCapabilities: [], fallback: 'text' }
    }],
    knowledgeReferences: []
  };
}
