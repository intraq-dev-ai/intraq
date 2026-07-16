import type { DataSourceSummary } from '../../analyzer/types';
import type { Dashboard, DashboardElement, DashboardFilter } from '../types';

export type DashboardAnalyzerScope = 'component' | 'dashboard' | 'related';

export interface DashboardAnalyzerComponentOption {
  contextText?: string;
  dataSourceId: string;
  dataSourceTableId?: string;
  fields?: string[];
  id: string;
  kind: string;
  name: string;
  tableName?: string;
}

export interface DashboardAnalyzerPlanContext extends Record<string, unknown> {
  components: DashboardAnalyzerComponentOption[];
  contentTrust: 'untrusted-display-context';
  dashboardId: string;
  dashboardName: string;
  filters: Array<{
    field?: string;
    id: string;
    name: string;
    operator?: string;
    value?: unknown;
  }>;
  origin: 'dashboard-ai';
  scope: DashboardAnalyzerScope;
  selectedComponent?: DashboardAnalyzerComponentOption;
}

const DATA_COMPONENT_TYPES = new Set(['card', 'chart', 'matrix', 'table']);

export function dashboardAnalyzerComponents(dashboard: Dashboard): DashboardAnalyzerComponentOption[] {
  return dashboard.elements.flatMap(element => {
    if (element.isVisible === false) return [];
    const type = normalizedType(element);
    const isAiSummary = type === 'text' && element.config?.aiGenerated === true;
    if (!DATA_COMPONENT_TYPES.has(type) && !isAiSummary) return [];
    const dataSourceId = elementSourceId(element);
    if (!dataSourceId) return [];
    const tableName = elementTableName(element);
    const dataSourceTableId = elementTableId(element);
    const fields = elementFields(element);
    const contextText = isAiSummary ? normalizedContextText(element.config?.text ?? element.config?.content) : undefined;
    return [{
      ...(contextText ? { contextText: contextText.slice(0, 600) } : {}),
      dataSourceId,
      ...(dataSourceTableId ? { dataSourceTableId } : {}),
      ...(fields.length > 0 ? { fields } : {}),
      id: element.id,
      kind: isAiSummary ? 'AI summary' : element.chartType || element.type,
      name: element.name || 'Untitled component',
      ...(tableName ? { tableName } : {})
    }];
  });
}

export function dashboardAnalyzerDataSources(
  dashboard: Dashboard,
  sources: DataSourceSummary[]
): DataSourceSummary[] {
  const visibleSources = sources.filter(source => source.settings?.dashboard?.visible !== false);
  const dashboardSourceIds = new Set(dashboardAnalyzerComponents(dashboard).map(component => component.dataSourceId));
  if (dashboardSourceIds.size > 0) {
    return visibleSources.filter(source => dashboardSourceIds.has(source.id));
  }
  const defaultSource = [...visibleSources].reverse().find(source => source.settings?.dashboard?.isDefault);
  return defaultSource ? [defaultSource] : visibleSources.slice(0, 1);
}

export function preferredDashboardDataSourceId(
  dashboard: Dashboard,
  sources: DataSourceSummary[]
): string {
  const availableIds = new Set(sources.map(source => source.id));
  const counts = new Map<string, number>();
  for (const component of dashboardAnalyzerComponents(dashboard)) {
    if (!availableIds.has(component.dataSourceId)) continue;
    counts.set(component.dataSourceId, (counts.get(component.dataSourceId) ?? 0) + 1);
  }
  const dashboardSource = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (dashboardSource) return dashboardSource;
  return [...sources].reverse().find(source => source.settings?.dashboard?.isDefault)?.id ?? sources[0]?.id ?? '';
}

export function dashboardAnalyzerPlanContext(input: {
  component: DashboardAnalyzerComponentOption | null;
  dataSourceId: string;
  dashboard: Dashboard;
  scope: DashboardAnalyzerScope;
}): DashboardAnalyzerPlanContext {
  const components = dashboardAnalyzerComponents(input.dashboard)
    .filter(component => component.dataSourceId === input.dataSourceId)
    .slice(0, 12);
  const selectedComponent = input.scope === 'component' && input.component
    ? componentPlanContext(input.component)
    : undefined;
  return {
    components: components.map(componentPlanContext),
    contentTrust: 'untrusted-display-context',
    dashboardId: input.dashboard.id,
    dashboardName: input.dashboard.name,
    filters: input.dashboard.filters.filter(isActiveFilter).slice(0, 8).map(filterPlanContext),
    origin: 'dashboard-ai',
    scope: input.scope,
    ...(selectedComponent ? { selectedComponent } : {})
  };
}

export function dashboardAnalyzerQuickQuestions(scope: DashboardAnalyzerScope): string[] {
  if (scope === 'component') {
    return ['What is driving this result?', 'How has this changed over time?', 'Which segment needs attention?'];
  }
  if (scope === 'related') {
    return ['What related risk is not shown here?', 'What could explain the current pattern?', 'Which other metric should we monitor?'];
  }
  return ['Which result needs attention first?', 'What is driving the biggest change?', 'Where should the team act next?'];
}

export function dashboardAnalyzerContextSummary(
  scope: DashboardAnalyzerScope,
  component: DashboardAnalyzerComponentOption | null,
  componentCount: number,
  filterCount: number
): string {
  if (scope === 'component') return component?.name ?? 'No component selected';
  if (scope === 'related') return 'Related dashboard data';
  return `${componentCount} components · ${filterCount} filters`;
}

export function dashboardAnalyzerQuestionPlaceholder(scope: DashboardAnalyzerScope): string {
  if (scope === 'component') return 'Ask about the selected component';
  if (scope === 'related') return 'Ask beyond the current dashboard';
  return 'Ask a follow-up about this dashboard';
}

export function dashboardAnalyzerPlanModelContext(
  scope: DashboardAnalyzerScope,
  component: DashboardAnalyzerComponentOption | null
): { dataSourceTableId?: string; tableName?: string } {
  if (scope !== 'component' || !component) return {};
  return {
    ...(component.dataSourceTableId ? { dataSourceTableId: component.dataSourceTableId } : {}),
    ...(component.tableName ? { tableName: component.tableName } : {})
  };
}

export function dashboardAnalyzerScopeMetadata(
  scope: DashboardAnalyzerScope,
  component: DashboardAnalyzerComponentOption | null
): Record<string, unknown> {
  if (scope !== 'component' || !component) return { questionScope: scope };
  return {
    dashboardElementId: component.id,
    dashboardElementName: component.name,
    questionScope: scope,
    ...(component.tableName ? { tableName: component.tableName } : {})
  };
}

function componentPlanContext(component: DashboardAnalyzerComponentOption): DashboardAnalyzerComponentOption {
  return {
    ...(component.contextText ? { contextText: component.contextText } : {}),
    dataSourceId: component.dataSourceId,
    ...(component.dataSourceTableId ? { dataSourceTableId: component.dataSourceTableId } : {}),
    ...(component.fields?.length ? { fields: component.fields } : {}),
    id: component.id,
    kind: component.kind,
    name: component.name,
    ...(component.tableName ? { tableName: component.tableName } : {})
  };
}

function filterPlanContext(filter: DashboardFilter): DashboardAnalyzerPlanContext['filters'][number] {
  const field = readString(filter.field ?? filter.config?.field);
  const operator = readString(filter.operator ?? filter.config?.operator);
  const value = filter.value ?? filter.config?.value;
  return {
    ...(field ? { field } : {}),
    id: filter.id,
    name: filter.name,
    ...(operator ? { operator } : {}),
    ...(value === undefined ? {} : { value })
  };
}

function normalizedType(element: DashboardElement): string {
  const type = element.type.trim().toLowerCase();
  return ['area', 'bar', 'column', 'doughnut', 'line', 'pie', 'scatter', 'stacked'].includes(type) ? 'chart' : type;
}

function elementSourceId(element: DashboardElement): string | undefined {
  return readString(element.dataSourceId)
    ?? readString(element.config?.dataSourceId)
    ?? readString(element.config?.analyzerDataSourceId)
    ?? readString(visualizationDataRef(element)?.sourceId);
}

function elementTableId(element: DashboardElement): string | undefined {
  return readString(element.config?.dataSourceTableId ?? element.config?.tableId)
    ?? readString(visualizationDataRef(element)?.tableId);
}

function elementTableName(element: DashboardElement): string | undefined {
  return readString(element.config?.tableName ?? element.config?.dataSource)
    ?? readString(visualizationDataRef(element)?.tableName);
}

function elementFields(element: DashboardElement): string[] {
  const config = element.config ?? {};
  const visualization = readRecord(config.visualization);
  const encodings = Array.isArray(visualization?.encodings) ? visualization.encodings : [];
  return [...new Set([
    config.field,
    config.valueField,
    config.supportingField,
    config.comparisonField,
    config.xField,
    config.yField,
    ...readFieldArray(config.fields),
    ...readFieldArray(config.columns),
    ...readFieldArray(config.ySeries),
    ...readFieldArray(config.yFields),
    ...readFieldArray(config.rowFields),
    ...readFieldArray(config.columnFields),
    ...readFieldArray(config.valueFields),
    ...readFieldArray(encodings)
  ].flatMap(readFieldValue))].slice(0, 20);
}

function readFieldArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readFieldValue(value: unknown): string[] {
  const direct = readString(value);
  if (direct) return [direct];
  const record = readRecord(value);
  const field = readString(record?.field ?? record?.name ?? record?.key);
  return field ? [field] : [];
}

function visualizationDataRef(element: DashboardElement): Record<string, unknown> | undefined {
  const visualization = readRecord(element.config?.visualization);
  return readRecord(visualization?.dataRef);
}

function isActiveFilter(filter: DashboardFilter): boolean {
  return filter.isActive !== false && filter.enabled !== false && filter.disabled !== true && filter.isDisabled !== true;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizedContextText(value: unknown): string | undefined {
  return readString(value)?.replace(/\s+/g, ' ');
}
