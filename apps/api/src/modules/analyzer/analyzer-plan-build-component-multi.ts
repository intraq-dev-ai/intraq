import type { KnowledgeReference } from '@intraq/contracts';
import {
  isRecord,
  readString,
  uniqueStrings
} from './analyzer-plan-utils.js';
import type {
  AnalyzerActionStep,
  AnalyzerSelectedModel
} from './analyzer-plan-build-component-types.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

export function readMultiComponentResultArgs(args: Record<string, unknown>): Record<string, unknown>[] {
  const results = Array.isArray(args.results)
    ? args.results
    : Array.isArray(args.components)
      ? args.components
      : [];
  return results
    .filter(isRecord)
    .slice(0, 4)
    .map(result => ({
      ...result,
      mode: readString(result.mode) ?? 'create',
      componentType: readString(result.componentType) ?? 'table'
    }));
}

export function annotatePlanActionsForMultiModel(
  plan: AnalyzerActionPlanResponse,
  index: number
): AnalyzerActionStep[] {
  const tableName = readString(plan.params.tableName);
  const dataSourceTableId = readString(plan.params.dataSourceTableId);
  const dataSourceId = readString(plan.params.dataSourceId);
  return plan.actions.map(action => ({
    action: action.action,
    params: {
      ...action.params,
      _multiPlanIndex: index,
      ...(dataSourceId ? { dataSourceId, _dataSourceId: dataSourceId } : {}),
      ...(dataSourceTableId ? { dataSourceTableId, _dataSourceTableId: dataSourceTableId } : {}),
      ...(tableName ? { tableName, _tableName: tableName } : {})
    }
  }));
}

/** Collapses normalized subplans that would issue the same executable request. */
export function deduplicateBuiltAnalyzerSubplans(
  plans: AnalyzerActionPlanResponse[]
): AnalyzerActionPlanResponse[] {
  const bySignature = new Map<string, AnalyzerActionPlanResponse>();
  for (const plan of plans) {
    const signature = builtPlanExecutionSignature(plan);
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, plan);
      continue;
    }
    existing.intentDetails.knowledgeReferences = uniqueKnowledgeReferences([
      ...existing.intentDetails.knowledgeReferences,
      ...plan.intentDetails.knowledgeReferences
    ]);
    existing.intentDetails.insightGuidance = uniqueStrings([
      ...existing.intentDetails.insightGuidance,
      ...plan.intentDetails.insightGuidance
    ]);
  }
  return [...bySignature.values()];
}

function builtPlanExecutionSignature(plan: AnalyzerActionPlanResponse): string {
  const selected = plan.intentDetails.selectedModel;
  return JSON.stringify(stableExecutionValue({
    actions: plan.actions.map(action => ({
      action: action.action,
      params: executableActionParams(action.params)
    })),
    dataSourceId: plan.params.dataSourceId,
    dataSourceTableId: plan.params.dataSourceTableId,
    modelId: selected?.id,
    modelName: selected?.name,
    tableName: plan.params.tableName
  }));
}

function executableActionParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([key]) =>
    key !== 'title' && key !== 'insightPrompt' && key !== 'message'
  ));
}

function stableExecutionValue(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    const items = value.map(item => stableExecutionValue(item));
    return key === 'columns' || key === 'filters'
      ? items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : items;
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value)
    .sort()
    .map(item => [item, stableExecutionValue(value[item], item)]));
}

export function uniqueSelectedModels(models: AnalyzerSelectedModel[]): AnalyzerSelectedModel[] {
  const seen = new Set<string>();
  const result: AnalyzerSelectedModel[] = [];
  for (const model of models) {
    const key = model.id || model.name || model.businessName;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(model);
  }
  return result;
}

export function uniqueKnowledgeReferences(references: KnowledgeReference[]): KnowledgeReference[] {
  const seen = new Set<string>();
  const result: KnowledgeReference[] = [];
  for (const reference of references) {
    if (seen.has(reference.id)) continue;
    seen.add(reference.id);
    result.push(reference);
  }
  return result;
}
