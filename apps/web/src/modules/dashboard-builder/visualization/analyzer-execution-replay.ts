import type {
  DashboardElement,
  VisualizationSpec
} from '../types';
import type { VisualizationDataRequest } from './data-request-types';

export function analyzerExecutionReplayRequest(
  element: DashboardElement,
  spec: VisualizationSpec
): VisualizationDataRequest | null | undefined {
  const analyzer = readRecord(element.config?.analyzer);
  const contract = readRecord(analyzer?.executionContract);
  if (!contract) return undefined;
  const request = readRecord(contract?.request);
  const visualization = readRecord(request?.visualization);
  if (contract?.schemaVersion !== 1 || !request || !visualization) return null;

  const dataSourceId = readString(request.dataSourceId);
  const tableName = readString(request.tableName);
  const kind = readString(visualization.kind);
  if (!dataSourceId || !tableName) return null;
  if (kind !== spec.kind) return undefined;
  if (dataSourceId !== spec.dataRef?.sourceId || tableName !== spec.dataRef.tableName) return null;

  const encodings = readRecordArray(visualization.encodings);
  if (encodings.length === 0 || encodings.some(item => !readString(item.field) || !readString(item.role))) return null;
  const filters = readRecordArray(visualization.filters);
  const sort = readRecordArray(visualization.sort);
  const parameterValues = readRecord(request.parameterValues);
  const componentConfig = readRecord(request.componentConfig);
  const limit = readPositiveInteger(visualization.limit ?? request.limit);
  return {
    dataSourceId,
    tableName,
    editMode: request.editMode !== false,
    ...(parameterValues && Object.keys(parameterValues).length > 0 ? { parameterValues } : {}),
    ...(componentConfig ? { componentConfig } : {}),
    visualization: {
      kind: spec.kind,
      encodings: encodings as unknown as VisualizationSpec['encodings'],
      filters: filters as unknown as NonNullable<VisualizationSpec['filters']>,
      sort: sort as unknown as NonNullable<VisualizationSpec['sort']>,
      ...(limit ? { limit } : {})
    }
  };
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord).map(item => ({ ...item })) : [];
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? { ...value } : null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
