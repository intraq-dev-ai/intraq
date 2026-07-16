import { requestApi } from './api-request';
import type { DashboardFilter } from './types';

export interface DashboardAiSummaryEvidence {
  elementId: string;
  values: Array<Record<string, boolean | null | number | string>>;
}

export interface DashboardAiSummaryResponse {
  cache: 'coalesced' | 'hit' | 'miss';
  evidenceRequired: boolean;
  expiresAt?: string;
  generatedAt?: string;
  text?: string;
}

export function fetchDashboardAiSummary(input: {
  dashboardId: string;
  elementId: string;
  evidence?: DashboardAiSummaryEvidence[];
  filters: DashboardFilter[];
  runtimeParameterValues?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<DashboardAiSummaryResponse> {
  return requestApi<DashboardAiSummaryResponse>(
    `/api/dashboards/${encodeURIComponent(input.dashboardId)}/elements/${encodeURIComponent(input.elementId)}/ai-summary`,
    {
      method: 'POST',
      body: {
        filters: input.filters.map(dashboardAiSummaryFilterState),
        ...(input.runtimeParameterValues ? { runtimeParameterValues: input.runtimeParameterValues } : {}),
        ...(input.evidence ? { evidence: input.evidence } : {})
      },
      ...(input.signal ? { signal: input.signal } : {})
    }
  );
}

export function dashboardAiSummaryFilterState(filter: DashboardFilter): Record<string, unknown> {
  const config = filter.config ?? {};
  return compactRecord({
    id: filter.id,
    field: filter.field,
    operator: filter.operator,
    value: filter.value,
    type: filter.type,
    isActive: filter.isActive,
    enabled: filter.enabled,
    disabled: filter.disabled,
    isDisabled: filter.isDisabled,
    target: filter.target,
    targetComponents: filter.targetComponents,
    targetDataSources: filter.targetDataSources,
    targetElementIds: filter.targetElementIds,
    targetDataSourceId: filter.targetDataSourceId,
    targetType: filter.targetType,
    config: compactRecord({
      target: config.target,
      targets: config.targets,
      targeting: config.targeting,
      targetComponents: config.targetComponents,
      targetDataSources: config.targetDataSources,
      targetElementIds: config.targetElementIds,
      targetElements: config.targetElements,
      targetTable: config.targetTable,
      targetTableId: config.targetTableId,
      targetTableName: config.targetTableName,
      targetTables: config.targetTables,
      targetTableIds: config.targetTableIds,
      targetTableNames: config.targetTableNames
    })
  });
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
