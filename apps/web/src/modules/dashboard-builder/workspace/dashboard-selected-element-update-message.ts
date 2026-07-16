import type {
  BuilderActionPlan,
  DashboardAgentMessage,
  DashboardElement
} from '../types';
import {
  createFollowUpDetails,
  dashboardElementUpdatedMessage,
  readString
} from './dashboard-agent-conversation';

export function selectedElementAppliedMessage(
  original: DashboardElement,
  updated: DashboardElement,
  plan: BuilderActionPlan,
  fieldLabels: string[]
): Omit<DashboardAgentMessage, 'id'> {
  const actions = plan.actions ?? [];
  const chartType = changedChartType(actions, updated);
  const renamed = updated.name !== original.name;
  const dataFieldsChanged = hasAnyAction(actions, [
    'set_dimension',
    'set_measure',
    'set_metrics',
    'set_matrix_fields',
    'set_table_columns',
    'set_x_axis',
    'set_y_axis'
  ]);
  const changes = updateChangeLabels(actions, chartType, renamed);

  if (dataFieldsChanged) {
    if (changes.length === 0) {
      return dashboardElementUpdatedMessage(updated.name, fieldLabels, updated.type);
    }
    const fields = uniqueLabels(fieldLabels);
    return {
      role: 'assistant',
      kind: 'plan',
      title: 'Updated',
      body: `Updated "${updated.name}": ${readableList([
        ...changes,
        fields.length > 0 ? `remapped data to ${readableList(fields)}` : 'remapped data fields'
      ])}.`,
      details: createFollowUpDetails('update', updated.type)
    };
  }

  if (chartType && actions.length === 1 && !renamed) {
    return {
      role: 'assistant',
      kind: 'plan',
      title: 'Updated',
      body: `Changed "${updated.name}" to ${chartTypeLabel(chartType)} chart.`,
      details: createFollowUpDetails('update', updated.type)
    };
  }

  if (changes.length === 0) {
    return dashboardElementUpdatedMessage(updated.name, [], updated.type);
  }

  return {
    role: 'assistant',
    kind: 'plan',
    title: 'Updated',
    body: `Updated "${updated.name}": ${readableList(changes)}.`,
    details: createFollowUpDetails('update', updated.type)
  };
}

type ActionStep = NonNullable<BuilderActionPlan['actions']>[number];

function changedChartType(actions: ActionStep[], updated: DashboardElement): string | null {
  const action = actions.find(item => item.action === 'set_chart_type');
  if (!action) return null;
  return readString(action.params.chartType)
    ?? readString(action.params.type)
    ?? readString(updated.chartType)
    ?? null;
}

function updateChangeLabels(actions: ActionStep[], chartType: string | null, renamed: boolean): string[] {
  const labels = [
    chartType ? `changed to ${chartTypeLabel(chartType)} chart` : '',
    renamed ? 'renamed it' : '',
    hasAnyAction(actions, ['set_chart_color', 'set_line_color', 'set_series_color']) ? 'updated style' : '',
    hasAnyAction(actions, ['set_chart_option']) ? 'updated chart settings' : '',
    hasAnyAction(actions, ['set_table_sort']) ? 'updated sorting' : '',
    hasAnyAction(actions, ['set_table_total']) ? 'updated totals' : '',
    hasAnyAction(actions, ['set_table_format']) ? 'updated table formatting' : '',
    hasAnyAction(actions, ['add_calculated_field']) ? 'added a calculated field' : '',
    hasAnyAction(actions, ['add_conditional_formatting']) ? 'added conditional formatting' : '',
    hasAnyAction(actions, ['set_supporting_metric']) ? 'updated supporting context' : ''
  ];
  return Array.from(new Set(labels.filter(Boolean))).slice(0, 4);
}

function chartTypeLabel(value: string): string {
  return value
    .split('_')
    .flatMap(part => part.split('-'))
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function hasAnyAction(actions: ActionStep[], names: string[]): boolean {
  return actions.some(action => names.includes(action.action));
}

function uniqueLabels(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).slice(0, 4);
}

function readableList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}
