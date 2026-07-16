import type {
  BuilderActionPlan,
  BuilderDataSource,
  BuilderDataTable,
  DataModelRecommendation
} from '../types';
import {
  fieldMetadata,
  fieldRole,
  readString,
  routingMetadata
} from './planner-metadata';
import { defaultActionPlanLayout, defaultCardActionPlanLayout } from './action-plan-layout';
import { cardPresentationDefaults } from './card-planning-defaults';
import { scoreTable } from './planner-table-scoring';
import { normalizeSearchText, wordsFromText } from './text-normalization';
import { aiReadyDataModels } from './ai-ready-data-model';
export {
  createFilterDraft,
  createRecommendedFilterDrafts
} from './planner-filters';
export type { FilterDraft } from './planner-filters';

export interface ElementDraft {
  name: string;
  type: string;
  chartType?: string;
  dataSourceId?: string;
  config: Record<string, unknown>;
  layout: Record<string, unknown>;
}

export function chooseDefaultDataSource(
  sources: BuilderDataSource[],
  selectedId = ''
): BuilderDataSource | null {
  return sources.find(source => source.id === selectedId)
    ?? [...sources].reverse().find(source => source.settings?.dashboard?.isDefault && source.tables.length > 0)
    ?? [...sources].reverse().find(source => source.tables.length > 0)
    ?? sources.at(-1)
    ?? null;
}

export function chooseDefaultTable(
  source: BuilderDataSource | null,
  selectedId = ''
): BuilderDataTable | null {
  if (!source) return null;
  return source.tables.find(table => table.id === selectedId || table.name === selectedId)
    ?? source.tables[0]
    ?? null;
}

export function chooseDefaultAiTable(
  source: BuilderDataSource | null,
  selectedId = ''
): BuilderDataTable | null {
  const tables = aiReadyDataModels(source);
  return tables.find(table => table.id === selectedId || table.name === selectedId)
    ?? tables[0]
    ?? null;
}

export function chooseTableForPrompt(
  source: BuilderDataSource | null,
  prompt: string,
  selectedId = '',
  options: { allowSelectedFallback?: boolean } = {}
): BuilderDataTable | null {
  if (!source) return null;
  const normalizedPrompt = normalizeSearchText(prompt);
  const scored = aiReadyDataModels(source)
    .map((table, index) => ({ table, index, score: scoreTable(table, normalizedPrompt) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = scored[0];
  if (best && best.score > 0) return best.table;
  if (options.allowSelectedFallback === false) return null;
  return chooseDefaultAiTable(source, selectedId);
}

export function chooseTableForRecommendation(
  source: BuilderDataSource | null,
  recommendation: DataModelRecommendation | null
): BuilderDataTable | null {
  const subjectArea = recommendation?.subjectArea.trim();
  if (!source || !subjectArea || subjectArea === 'Clarification needed') return null;
  const normalized = subjectArea.toLowerCase();
  return aiReadyDataModels(source).find(table =>
    table.name.toLowerCase() === normalized ||
    table.dictionary?.businessName?.toLowerCase() === normalized
  ) ?? null;
}

export function sampleQuestionsForTable(table: BuilderDataTable | null): string[] {
  const samples = [
    ...(table?.dictionary?.ai?.sampleQuestions ?? []),
    ...(table?.dictionary?.sampleQuestions ?? [])
  ].map(value => value.trim()).filter(Boolean);
  return Array.from(new Set(samples)).slice(0, 4);
}

export function createElementDraft(input: {
  prompt: string;
  plan: BuilderActionPlan | null;
  source: BuilderDataSource | null;
  table: BuilderDataTable | null;
  recommendation: DataModelRecommendation | null;
  elementCount: number;
}): ElementDraft {
  const title = titleFromPlan(input.plan) ?? titleFromPrompt(input.prompt);
  const fields = input.table?.fields ?? [];
  const dimension = preferredDimension(input.table);
  const measures = preferredMeasures(input.table, input.recommendation);
  const chartType = chartTypeFromPlan(input.plan, input.prompt);
  const componentType = componentTypeFromPlan(input.plan, chartType);
  const commonConfig = {
    title,
    dataSourceId: input.source?.id,
    dataSourceName: input.source?.name,
    dataSourceTableId: input.table?.id,
    tableName: input.table?.name,
    dataModelName: input.table?.dictionary?.businessName ?? input.table?.name,
    xField: dimension,
    ySeries: measures,
    fields: fields.map(field => field.name),
    fieldRoles: Object.fromEntries(fields.map(field => [field.name, fieldRole(input.table, field)])),
    fieldFormats: Object.fromEntries(fields.flatMap(field => {
      const format = readString(fieldMetadata(input.table, field.name).format) ?? field.format;
      return format ? [[field.name, format]] : [];
    })),
    aiPlan: input.plan ? {
      title: input.plan.title,
      summary: input.plan.summary,
      actions: input.plan.actions ?? []
    } : undefined
  };
  const cardDefaults = componentType === 'card'
    ? cardPresentationDefaults({ config: {}, plan: input.plan, prompt: input.prompt })
    : {};
  const layout = componentType === 'card'
    ? defaultCardActionPlanLayout(input.elementCount, cardDefaults)
    : defaultActionPlanLayout(componentType, input.elementCount);

  if (componentType === 'table') {
    return {
      name: title,
      type: 'table',
      ...(input.source ? { dataSourceId: input.source.id } : {}),
      config: { ...commonConfig, columns: fields.slice(0, 8).map(field => field.name) },
      layout
    };
  }

  if (componentType === 'card') {
    return {
      name: title,
      type: 'card',
      ...(input.source ? { dataSourceId: input.source.id } : {}),
      config: {
        ...commonConfig,
        valueField: measures[0] ?? fields[0]?.name,
        ...cardDefaults
      },
      layout
    };
  }

  if (componentType === 'matrix') {
    return {
      name: title,
      type: 'matrix',
      ...(input.source ? { dataSourceId: input.source.id } : {}),
      config: {
        ...commonConfig,
        rowFields: dimension ? [dimension] : [],
        columnFields: fields.filter(field => fieldRole(input.table, field) === 'dimension').map(field => field.name).slice(0, 1),
        valueFields: measures
      },
      layout
    };
  }

  return {
    name: title,
    type: 'chart',
    chartType,
    ...(input.source ? { dataSourceId: input.source.id } : {}),
    config: commonConfig,
    layout
  };
}

export function titleFromPrompt(value: string): string {
  return wordsFromText(value).slice(0, 6)
    .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ') || 'Dashboard Insight';
}

function titleFromPlan(plan: BuilderActionPlan | null): string | null {
  const titleAction = plan?.actions?.find(action => action.action === 'set_title');
  const title = titleAction?.params.title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

function componentTypeFromPlan(plan: BuilderActionPlan | null, chartType: string): string {
  if (plan?.componentType === 'table' || plan?.componentType === 'card' || plan?.componentType === 'matrix') {
    return plan.componentType;
  }
  if (chartType === 'table') return 'table';
  if (chartType === 'card') return 'card';
  return 'chart';
}

function chartTypeFromPlan(plan: BuilderActionPlan | null, prompt: string): string {
  if (plan?.componentType === 'pie') return 'pie';
  if (plan?.componentType === 'table') return 'table';
  if (plan?.componentType === 'card') return 'card';
  const plannedType = plan?.actions?.find(action => action.action === 'set_chart_type')?.params.chartType;
  if (plannedType === 'bar' || plannedType === 'line' || plannedType === 'pie') return plannedType;
  const visualizationKind = plan?.params?.visualizationKind ?? plan?.visualizations?.[0]?.kind;
  if (visualizationKind === 'bar' || visualizationKind === 'line' || visualizationKind === 'pie') return visualizationKind;
  const lowered = prompt.toLowerCase();
  if (lowered.includes('kpi') || lowered.includes('card') || lowered.includes('metric tile')) return 'card';
  if (lowered.includes('pie') || lowered.includes('mix')) return 'pie';
  if (lowered.includes('bar') || lowered.includes('top ')) return 'bar';
  return 'line';
}

function preferredDimension(table: BuilderDataTable | null): string | undefined {
  const fields = table?.fields ?? [];
  const primaryTimeField = readString(routingMetadata(table).primaryTimeField);
  return fields.find(field => field.name === primaryTimeField)?.name
    ?? fields.find(field => fieldRole(table, field) === 'time')?.name
    ?? fields.find(field => fieldRole(table, field) === 'dimension')?.name
    ?? fields[0]?.name;
}

function preferredMeasures(
  table: BuilderDataTable | null,
  recommendation: DataModelRecommendation | null
): string[] {
  const fields = table?.fields ?? [];
  const measureFields = fields.filter(field => fieldRole(table, field) === 'measure').map(field => field.name);
  const recommended = recommendation?.measures.filter(measure => measureFields.includes(measure)) ?? [];
  return (recommended.length > 0 ? recommended : measureFields).slice(0, 3);
}
