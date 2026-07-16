import type { DataSourceRecord, TableDefinition } from './foundation-store.js';
import {
  MAX_API_WORKFLOW_RUN_LOGS,
  type ApiWorkflowRunLog
} from './api-runtime-types.js';

const apiWorkflowRunLogs: ApiWorkflowRunLog[] = [];

export function clearApiWorkflowRunLogsForTest(): void {
  apiWorkflowRunLogs.length = 0;
}

export function listApiWorkflowRunLogs(
  dataSourceId: string,
  tableIdOrName?: string,
  limit = 25
): ApiWorkflowRunLog[] {
  const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return apiWorkflowRunLogs
    .filter(log => log.dataSourceId === dataSourceId && (!tableIdOrName || log.tableId === tableIdOrName || log.tableName === tableIdOrName))
    .slice(0, normalizedLimit);
}

export function createApiWorkflowLogger(
  source: DataSourceRecord,
  table: TableDefinition,
  started: number,
  startedAt: string
): (input: {
  endpoint?: string;
  error?: string;
  method?: string;
  ok: boolean;
  pageCount?: number;
  rowCount?: number;
  statusCode?: number;
}) => void {
  return input => {
    apiWorkflowRunLogs.unshift({
      dataSourceId: source.id,
      durationMs: Math.max(1, Date.now() - started),
      endpoint: input.endpoint ?? '',
      ...(input.error ? { error: input.error } : {}),
      id: `${started}-${source.id}-${table.id}-${Math.random().toString(36).slice(2, 8)}`,
      method: input.method ?? '',
      ok: input.ok,
      pageCount: input.pageCount ?? 0,
      rowCount: input.rowCount ?? 0,
      startedAt,
      ...(input.statusCode ? { statusCode: input.statusCode } : {}),
      tableId: table.id,
      tableName: table.name
    });
    if (apiWorkflowRunLogs.length > MAX_API_WORKFLOW_RUN_LOGS) {
      apiWorkflowRunLogs.splice(MAX_API_WORKFLOW_RUN_LOGS);
    }
  };
}
