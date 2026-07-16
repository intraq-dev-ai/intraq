import { dashboardDataCachePolicyFromSettings } from './dashboard-data-cache-policy';
import type { DashboardAiSummaryEvidence } from './dashboard-ai-summary-api';
import type {
  DashboardElement,
  DashboardFilter,
  DashboardSettings,
  VisualizationData
} from './types';
import {
  loadVisualizationData,
  type VisualizationDataRequestContext
} from './visualization/data';
import { visualizationSpecFromElement } from './visualization/spec';

const DATA_TYPES = new Set(['area', 'bar', 'card', 'chart', 'column', 'line', 'matrix', 'pie', 'stacked', 'table']);
const DEFAULT_EVIDENCE_LIMIT = 8;

export async function collectDashboardAiSummaryEvidence(input: {
  dashboardElements: DashboardElement[];
  dashboardSettings?: DashboardSettings;
  filters: DashboardFilter[];
  requestContext?: VisualizationDataRequestContext;
  signal?: AbortSignal;
  summaryElement: DashboardElement;
}): Promise<DashboardAiSummaryEvidence[]> {
  const candidates = evidenceCandidates(input.summaryElement, input.dashboardElements);
  const values = await Promise.all(candidates.map(async element => {
    try {
      const data = await loadVisualizationData(
        element,
        visualizationSpecFromElement(element),
        input.filters,
        {
          cachePolicy: dashboardDataCachePolicyFromSettings(input.dashboardSettings),
          peerElements: input.dashboardElements,
          requestContext: input.requestContext,
          rowLimit: 5,
          signal: input.signal
        }
      );
      const rows = evidenceRows(element, data);
      return rows.length > 0 ? { elementId: element.id, values: rows } : null;
    } catch (error) {
      if (isAbortError(error)) throw error;
      return null;
    }
  }));
  return values.filter((value): value is DashboardAiSummaryEvidence => value !== null);
}

function evidenceCandidates(summary: DashboardElement, elements: DashboardElement[]): DashboardElement[] {
  const configuredIds = readStringArray(summary.config?.aiEvidenceElementIds);
  const allowedIds = configuredIds.length > 0 ? new Set(configuredIds) : null;
  const sourceId = readString(summary.config?.analyzerDataSourceId);
  const limit = readPositiveInteger(summary.config?.aiEvidenceLimit) ?? DEFAULT_EVIDENCE_LIMIT;
  return elements
    .filter(element =>
      element.id !== summary.id
      && element.isVisible !== false
      && DATA_TYPES.has(element.type.trim().toLowerCase())
      && (!allowedIds || allowedIds.has(element.id))
      && (!sourceId || elementSourceId(element) === sourceId)
    )
    .sort((left, right) => evidencePriority(left) - evidencePriority(right) || left.order - right.order)
    .slice(0, Math.min(limit, 12));
}

function evidenceRows(
  element: DashboardElement,
  data: VisualizationData
): Array<Record<string, boolean | null | number | string>> {
  const fields = evidenceFields(element);
  const rawRows = (data.rawData ?? []).slice(0, 5).map(row => scalarFields(row, fields)).filter(hasKeys);
  if (rawRows.length > 0) return rawRows;

  const fallback: Record<string, boolean | null | number | string> = {};
  data.datasets.forEach((dataset, index) => {
    const value = dataset.data[0];
    if (typeof value === 'number' && Number.isFinite(value)) {
      fallback[fields[index] ?? dataset.label ?? `value_${index + 1}`] = value;
    }
  });
  if (data.labels[0]) fallback.label = data.labels[0];
  return hasKeys(fallback) ? [fallback] : [];
}

function evidenceFields(element: DashboardElement): string[] {
  return unique([
    readString(element.config?.valueField),
    readString(element.config?.field),
    readString(element.config?.comparisonField),
    readString(element.config?.supportingField),
    ...readStringArray(element.config?.ySeries ?? element.config?.yFields)
  ].filter((value): value is string => Boolean(value)));
}

function scalarFields(
  row: Record<string, unknown>,
  preferredFields: string[]
): Record<string, boolean | null | number | string> {
  const fields = preferredFields.length > 0 ? preferredFields : Object.keys(row).slice(0, 12);
  return Object.fromEntries(fields.flatMap(field => {
    const value = row[field];
    if (value === null || typeof value === 'boolean') return [[field, value]];
    if (typeof value === 'number' && Number.isFinite(value)) return [[field, value]];
    if (typeof value === 'string' && value.trim()) return [[field, value.trim().slice(0, 240)]];
    return [];
  }));
}

function elementSourceId(element: DashboardElement): string | undefined {
  return readString(element.dataSourceId)
    ?? readString(element.config?.dataSourceId)
    ?? readString(element.config?.dataSource)
    ?? visualizationDataSourceId(element);
}

function visualizationDataSourceId(element: DashboardElement): string | undefined {
  const visualization = readRecord(element.config?.visualization);
  const dataRef = readRecord(visualization?.dataRef);
  return readString(dataRef?.sourceId);
}

function evidencePriority(element: DashboardElement): number {
  return element.type.trim().toLowerCase() === 'card' ? 0 : 1;
}

function hasKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => readString(item) ?? []) : [];
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
