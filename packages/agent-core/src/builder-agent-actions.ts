import type {
  BuilderAgentRequest,
  BuilderAgentResult,
  DashboardComponentType,
  FieldEncoding,
  VisualizationSpec
} from '@intraq/contracts';
import { filterFieldNameFromPlan } from './builder-agent-filter-planning.js';
import { routingMetadata, modelFields } from './builder-agent-model.js';
import { readString, splitWords, toLabel } from './builder-agent-text.js';

export function clarificationPlan(request: BuilderAgentRequest): BuilderAgentResult {
  const mode = request.mode ?? (request.elementId ? 'update' : 'create');
  const subjectArea = request.dataModel?.businessName
    ?? readString(request.dataModel?.dictionary?.businessName)
    ?? request.tableName
    ?? 'data model';
  return {
    type: 'action-plan',
    workflow: 'dashboard-builder',
    mode,
    componentType: request.componentType ?? 'table',
    actions: [{
      action: 'request_clarification',
      params: {
        reason: 'A data model with supported measures, dimensions, and visual options is required before creating this dashboard element.',
        subjectArea
      }
    }],
    params: {
      element: {
        clientElementId: 'dashboard-element-clarification',
        ...(request.elementId ? { elementId: request.elementId } : {}),
        ...(request.dashboardId ? { dashboardId: request.dashboardId } : {})
      },
      ...(request.dataSourceId ? { dataSourceId: request.dataSourceId } : {}),
      ...(request.dataSourceTableId ? { dataSourceTableId: request.dataSourceTableId } : {}),
      ...(request.tableName ? { tableName: request.tableName } : {})
    },
    message: request.prompt,
    title: 'Dashboard Builder Needs Model Context',
    summary: 'Choose a data model so the agent can map business intent to approved fields, visual options, and filters.',
    visualizations: [],
    knowledgeReferences: []
  };
}

export function inferComponentType(kind = 'card'): DashboardComponentType {
  if (kind === 'table') return 'table';
  if (kind === 'card') return 'card';
  if (kind === 'pie') return 'pie';
  if (kind === 'matrix') return 'matrix';
  if (kind === 'filter') return 'filter';
  if (kind === 'text') return 'text';
  return 'chart';
}

export function buildActionSteps(
  request: BuilderAgentRequest,
  componentType: DashboardComponentType,
  visualization: VisualizationSpec
): BuilderAgentResult['actions'] {
  const title = titleFromPrompt(request.prompt);
  if (request.mode === 'update' || request.elementId) {
    return updateActionSteps(request, componentType, visualization, title);
  }
  if (componentType === 'table') return createTableAction(request, visualization, title);
  if (componentType === 'filter') return createFilterAction(request, visualization, title);
  if (componentType === 'matrix') return createMatrixActions(request, visualization, title);
  if (componentType === 'card') return createCardActions(request, visualization, title);
  if (componentType === 'text') return createTextAction(request, title);
  return createChartActions(request, visualization, title);
}

export function planSummaryFromVisualization(
  request: BuilderAgentRequest,
  visualization: VisualizationSpec,
  model: BuilderAgentRequest['dataModel']
): string {
  if (visualization.kind === 'text') {
    return `Mapped "${request.prompt}" to a native dashboard text insight.`;
  }
  const modelName = model?.businessName ?? readString(model?.dictionary?.businessName) ?? (model ? toLabel(model.name) : 'data model');
  const measures = visualization.encodings
    .filter(encoding => encoding.role === 'measure')
    .map(encoding => encoding.label || toLabel(encoding.field));
  const dimensions = visualization.encodings
    .filter(encoding => encoding.role === 'dimension' || encoding.role === 'time')
    .map(encoding => encoding.label || toLabel(encoding.field));
  const measurePhrase = measures.length > 0 ? measures.join(', ') : 'approved measures';
  const dimensionPhrase = dimensions.length > 0 ? ` by ${dimensions.join(', ')}` : '';
  const mode = request.mode === 'update' || request.elementId ? 'update' : 'create';
  return `Mapped "${request.prompt}" to #${modelName}: ${mode} a ${visualization.kind} using ${measurePhrase}${dimensionPhrase}.`;
}

function createTextAction(request: BuilderAgentRequest, title: string): BuilderAgentResult['actions'] {
  const presentation = request.textComponent ?? {};
  return [{
    action: 'create_text',
    params: {
      title: presentation.title?.trim() || title,
      text: presentation.content?.trim() || request.prompt.trim(),
      variant: presentation.variant ?? 'insight',
      tone: presentation.tone ?? 'neutral',
      showIcon: presentation.showIcon !== false,
      ...(presentation.badge?.trim() ? { badge: presentation.badge.trim() } : {})
    }
  }];
}

export function titleFromPrompt(prompt: string): string {
  const words = splitWords(prompt)
    .slice(0, 8)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return words.join(' ');
}

function updateActionSteps(
  request: BuilderAgentRequest,
  componentType: DashboardComponentType,
  visualization: VisualizationSpec,
  title: string
): BuilderAgentResult['actions'] {
  const updateActions: BuilderAgentResult['actions'] = [{
    action: 'set_title',
    params: {
      title,
      ...(request.elementId ? { elementId: request.elementId } : {})
    }
  }];
  if (componentType === 'chart' || componentType === 'pie') {
    updateActions.push({ action: 'set_chart_type', params: { chartType: visualization.kind } });
    const dimension = dimensionFieldFromVisualization(visualization);
    const measures = measureFieldsFromVisualization(visualization);
    if (dimension) updateActions.push({ action: 'set_x_axis', params: { field: dimension } });
    if (measures.length > 0) updateActions.push({ action: 'set_y_axis', params: { fields: measures } });
  }
  return updateActions;
}

function createTableAction(
  request: BuilderAgentRequest,
  visualization: VisualizationSpec,
  title: string
): BuilderAgentResult['actions'] {
  return [{
    action: 'create_table',
    params: {
      title,
      ...(request.dataSourceId ? { dataSourceId: request.dataSourceId } : {}),
      ...(request.dataSourceTableId ? { dataSourceTableId: request.dataSourceTableId } : {}),
      ...(request.tableName ? { tableName: request.tableName } : {}),
      columns: columnsFromVisualization(visualization)
    }
  }];
}

function createFilterAction(
  request: BuilderAgentRequest,
  visualization: VisualizationSpec,
  title: string
): BuilderAgentResult['actions'] {
  const field = filterFieldFromRequest(request, visualization);
  return field ? [{
    action: 'create_filter',
    params: {
      title,
      ...sourceActionParams(request),
      field,
      inputType: 'single-select',
      operator: 'equals',
      type: 'interactive'
    }
  }] : [{
    action: 'request_clarification',
    params: { reason: 'Select a field that can be used as a dashboard filter.' }
  }];
}

function createMatrixActions(
  request: BuilderAgentRequest,
  visualization: VisualizationSpec,
  title: string
): BuilderAgentResult['actions'] {
  const dimensions = dimensionEncodingsFromVisualization(visualization);
  const measures = measureFieldsFromVisualization(visualization);
  const rowField = dimensions.find(encoding => encoding.role === 'dimension')?.field ?? dimensions[0]?.field;
  const columnField = dimensions.find(encoding => encoding.role === 'time')?.field
    ?? dimensions.find(encoding => encoding.field !== rowField)?.field;
  return [
    {
      action: 'create_matrix',
      params: {
        title,
        ...sourceActionParams(request)
      }
    },
    {
      action: 'set_matrix_fields',
      params: {
        rowFields: rowField ? [rowField] : [],
        columnFields: columnField ? [columnField] : [],
        valueFields: measures
      }
    }
  ];
}

function createCardActions(
  request: BuilderAgentRequest,
  visualization: VisualizationSpec,
  title: string
): BuilderAgentResult['actions'] {
  const measureEncodings = measureEncodingsFromVisualization(visualization);
  const measureEncoding = measureEncodings[0];
  const supportingEncoding = measureEncodings[1];
  return measureEncoding ? [
    {
      action: 'create_card',
      params: {
        title,
        ...(supportingEncoding ? {
          supportingAggregation: supportingEncoding.aggregation ?? 'avg',
          supportingField: supportingEncoding.field,
          supportingFormat: supportingEncoding.format ?? 'number',
          supportingLabel: supportingEncoding.label
        } : {}),
        ...sourceActionParams(request)
      }
    },
    {
      action: 'set_value_field',
      params: {
        title,
        field: measureEncoding.field,
        aggregation: measureEncoding.aggregation ?? 'sum'
      }
    }
  ] : [{
    action: 'request_clarification',
    params: { reason: 'Select a default measure for this card.' }
  }];
}

function createChartActions(
  request: BuilderAgentRequest,
  visualization: VisualizationSpec,
  title: string
): BuilderAgentResult['actions'] {
  const dimension = dimensionFieldFromVisualization(visualization);
  const measures = measureFieldsFromVisualization(visualization);
  return [
    {
      action: 'create_chart',
      params: {
        title,
        chartType: visualization.kind,
        ...sourceActionParams(request)
      }
    },
    { action: 'set_title', params: { title } },
    { action: 'set_chart_type', params: { chartType: visualization.kind } },
    ...(dimension ? [{ action: 'set_x_axis', params: { field: dimension } }] : []),
    ...(measures.length > 0 ? [{ action: 'set_y_axis', params: { fields: measures } }] : [])
  ];
}

function sourceActionParams(request: BuilderAgentRequest): Record<string, string> {
  return {
    ...(request.dataSourceId ? { dataSourceId: request.dataSourceId } : {}),
    ...(request.dataSourceTableId ? { dataSourceTableId: request.dataSourceTableId } : {}),
    ...(request.tableName ? { tableName: request.tableName } : {})
  };
}

function filterFieldFromRequest(
  request: BuilderAgentRequest,
  visualization: VisualizationSpec
): string | null {
  return filterFieldNameFromPlan({
    fallbackVisualDimension: dimensionFieldFromVisualization(visualization),
    fields: request.dataModel ? modelFields(request.dataModel) : [],
    prompt: request.prompt,
    routing: routingMetadata(request.dataModel?.dictionary)
  });
}

function columnsFromVisualization(visualization: VisualizationSpec): Array<{ field: string; summarize: string }> {
  return visualization.encodings.map(encoding => ({
    field: encoding.field,
    summarize: encoding.role === 'measure' ? encoding.aggregation ?? 'sum' : 'none'
  }));
}

function dimensionEncodingsFromVisualization(visualization: VisualizationSpec): FieldEncoding[] {
  return visualization.encodings.filter(encoding => encoding.role === 'dimension' || encoding.role === 'time');
}

function dimensionFieldFromVisualization(visualization: VisualizationSpec): string | undefined {
  return visualization.encodings.find(encoding => encoding.role === 'dimension' || encoding.role === 'time')?.field;
}

function measureFieldsFromVisualization(visualization: VisualizationSpec): string[] {
  return measureEncodingsFromVisualization(visualization).map(encoding => encoding.field);
}

function measureEncodingFromVisualization(visualization: VisualizationSpec): FieldEncoding | undefined {
  return measureEncodingsFromVisualization(visualization)[0];
}

function measureEncodingsFromVisualization(visualization: VisualizationSpec): FieldEncoding[] {
  return visualization.encodings.filter(encoding => encoding.role === 'measure');
}
