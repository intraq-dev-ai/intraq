import {
  isRecord,
  readString
} from './analyzer-plan-utils.js';
import type {
  AnalyzerPlanToolState,
  TrustedDirectSchemaCandidate
} from './analyzer-plan-agent-loop-types.js';

export function trustedDirectSchemaCandidateFromContext(
  context: Record<string, unknown>
): TrustedDirectSchemaCandidate | null {
  const retrievalCandidates = isRecord(context.retrievalCandidates) ? context.retrievalCandidates : null;
  const directCandidate = isRecord(retrievalCandidates?.directSchemaCandidate)
    ? retrievalCandidates.directSchemaCandidate
    : null;
  if (!directCandidate || directCandidate.trustedRoutingExampleMatch !== true) return null;
  const id = readString(directCandidate.id);
  const name = readString(directCandidate.name);
  const businessName = readString(directCandidate.businessName);
  const matchedRoutingExample = readString(directCandidate.matchedRoutingExample);
  if (!id && !name) return null;
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(businessName ? { businessName } : {}),
    ...(matchedRoutingExample ? { matchedRoutingExample } : {})
  };
}

export function schemaArgsMatchTrustedDirectCandidate(
  tableId: string | null,
  tableName: string | null,
  candidate: TrustedDirectSchemaCandidate
): boolean {
  return Boolean(
    candidate.id && tableId === candidate.id
    || candidate.name && tableName === candidate.name
  );
}

export function trustedDirectSchemaIsLoaded(state: AnalyzerPlanToolState): boolean {
  const candidate = state.trustedDirectCandidate;
  if (!candidate || !state.loadedSchema) return false;
  return schemaArgsMatchTrustedDirectCandidate(
    state.selectedTableId ?? null,
    state.selectedTableName ?? null,
    candidate
  );
}
