import { readAnalyzerExecutionIntegrity } from './analyzer-execution-contract';
import { normalizeAnalyzerTableData } from './analyzer-execution-data';
import type { AnalyzerPlanTableDataRequest } from './plan-table-data-request';
import type { AnalyzerTableData } from './types';

export async function fetchAnalyzerChartData(
  request: AnalyzerPlanTableDataRequest,
  tableName: string,
  signal?: AbortSignal
): Promise<AnalyzerTableData> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json'
  };
  const response = await fetch('/api/chart-data', {
    method: 'POST',
    headers,
    body: JSON.stringify(request.body),
    ...(signal ? { signal } : {})
  });
  const parsed = await parseResponse(response);
  const payload = parsed.data;
  const rows = chartRows(payload);
  const columns = chartColumns(payload, rows) ?? request.columns;
  const sql = chartSql(payload);
  const integrity = readAnalyzerExecutionIntegrity(
    isRecord(parsed.meta) ? parsed.meta.integrity : undefined
  );
  return normalizeAnalyzerTableData({
    rows,
    columns,
    totalRows: chartTotalRows(payload) ?? rows.length,
    tableName,
    ...(sql ? { sql } : {}),
    ...(integrity ? { integrity } : {})
  });
}

async function parseResponse(response: Response): Promise<{ data: unknown; meta?: unknown }> {
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error('Response from /api/chart-data was not valid JSON.');
    }
  }
  if (isRecord(payload) && typeof payload.success === 'boolean') {
    if (!response.ok || !payload.success) {
      throw new Error(readString(payload.error) || 'Request to /api/chart-data failed.');
    }
    return {
      data: payload.data,
      ...('meta' in payload ? { meta: payload.meta } : {})
    };
  }
  if (!response.ok) throw new Error('Request to /api/chart-data failed.');
  return { data: payload };
}

function chartRows(payload: unknown): Array<Record<string, unknown>> {
  if (!isRecord(payload)) return [];
  const rawData = Array.isArray(payload.rawData) ? payload.rawData : [];
  return rawData.filter(isRecord).map(row => ({ ...row }));
}

function chartColumns(payload: unknown, rows: Array<Record<string, unknown>>): unknown[] | string[] | null {
  if (isRecord(payload)) {
    if (Array.isArray(payload.columns)) return payload.columns;
    if (Array.isArray(payload.fields)) return payload.fields;
  }
  if (rows.length === 0) return null;
  const fields = new Set<string>();
  for (const row of rows) {
    for (const field of Object.keys(row)) fields.add(field);
  }
  return [...fields];
}

function chartTotalRows(payload: unknown): number | null {
  if (!isRecord(payload)) return null;
  for (const key of ['totalRows', 'total', 'rowCount']) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function chartSql(payload: unknown): string | undefined {
  return isRecord(payload) ? readString(payload.sqlQuery) || undefined : undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
