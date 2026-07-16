import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';
import { isRecord, readString, readStringArray, uniqueStrings } from './analyzer-plan-utils.js';

/** Removes meaningless sort/limit state from a non-ranking, multi-measure comparison. */
export function normalizeUngroupedAggregateBuildShape(
  args: Record<string, unknown>,
  question: string
): Record<string, unknown> {
  if (!nonRankingUngroupedComparison(args, question)) return args;
  const capability = isRecord(args.capability) ? args.capability : null;
  const actions = Array.isArray(args.actions) ? args.actions.flatMap(action => {
    if (!isRecord(action)) return [action];
    if (readString(action.action) === 'set_table_sort') return [];
    if (readString(action.action) !== 'create_table') return [action];
    const params = isRecord(action.params) ? action.params : {};
    const { limit: _limit, orderBy: _orderBy, sort: _sort, ...aggregateParams } = params;
    return [{ ...action, params: aggregateParams }];
  }) : null;
  const normalized = { ...args, ...(actions ? { actions } : {}) };
  if (!capability) return normalized;
  const { limit: _limit, orderBy: _orderBy, ...aggregateCapability } = capability;
  return { ...normalized, capability: aggregateCapability };
}

export function normalizeUngroupedAggregatePlanShape(
  plan: AnalyzerActionPlanResponse,
  args: Record<string, unknown>,
  question: string
): AnalyzerActionPlanResponse {
  if (!nonRankingUngroupedComparison(args, question)) return plan;
  return {
    ...plan,
    actions: plan.actions.flatMap(action => {
      if (action.action === 'set_table_sort') return [];
      if (action.action !== 'create_table') return [action];
      const { limit: _limit, orderBy: _orderBy, sort: _sort, ...params } = action.params;
      return [{ ...action, params }];
    })
  };
}

function nonRankingUngroupedComparison(args: Record<string, unknown>, question: string): boolean {
  const capability = isRecord(args.capability) ? args.capability : {};
  const measure = readString(capability.measure);
  const measures = uniqueStrings([...(measure ? [measure] : []), ...readStringArray(capability.measures)]);
  return readString(capability.operation) === 'compare'
    && readStringArray(capability.groupBy).length === 0
    && measures.length > 1
    && !explicitOrdering(question);
}

function explicitOrdering(question: string): boolean {
  return /\b(?:ascending|bottom|descending|highest|largest|lowest|rank|ranked|ranking|smallest|sort|sorted)\b/i.test(question)
    || /\b(?:first|last|limit(?:ed)?(?:\s+to)?|top)\s+\d+\b/i.test(question);
}
