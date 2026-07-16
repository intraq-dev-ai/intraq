import { buildComponentArgsWithSelectedSchema } from './analyzer-plan-agent-loop-recovery.js';
import type { AnalyzerPlanToolState } from './analyzer-plan-agent-loop-types.js';
import { isRecord, readString } from './analyzer-plan-utils.js';

/**
 * Applies the same preflight-verified capability, filters, and parameters used
 * by build_component to every build_multi_component result.
 */
export function preflightVerifiedMultiComponentBuildArgs(
  args: Record<string, unknown>,
  state: AnalyzerPlanToolState,
  question = state.requestBreakdown?.query ?? ''
): Record<string, unknown> | null {
  if (!Array.isArray(args.results)) return args;
  if (state.capabilityPreflightHadNoEligibleModels) return null;
  const normalized = {
    ...args,
    results: args.results.map(result => isRecord(result)
      ? buildComponentArgsWithSelectedSchema(result, state, question)
      : result)
  };
  const modelIds = state.preflightModelIds ?? [];
  const modelNames = state.preflightModelNames ?? [];
  if (modelIds.length === 0 && modelNames.length === 0) return normalized;
  const allowed = normalized.results.every(result => {
    if (!isRecord(result)) return false;
    const tableId = readString(result.tableId);
    const tableName = readString(result.tableName);
    if (!tableId && !tableName) return false;
    return (!tableId || modelIds.includes(tableId))
      && (!tableName || modelNames.includes(tableName));
  });
  return allowed ? normalized : null;
}
