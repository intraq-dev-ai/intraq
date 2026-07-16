import { readAnalyzerExecutionIntegrity } from './analyzer-execution-contract';
import {
  ANALYZER_RESULT_PAGE_SIZE,
  analyzerExecutionSummary,
  analyzerResultTitle,
  normalizeAnalyzerColumns
} from './result-data';
import type {
  AnalyzerExecution,
  AnalyzerExecutionContract,
  AnalyzerTableData
} from './types';

export function normalizeAnalyzerTableData(input: unknown): AnalyzerTableData {
  const record = isRecord(input) ? input : {};
  const rows = readRows(record.rows);
  const totalRows = readNumber(record.totalRows ?? record.total ?? record.rowCount) ?? rows.length;
  const columns = normalizeAnalyzerColumns(record.columns ?? record.fields, rows);
  const tableName = readString(record.tableName);
  const sql = readString(record.sql);
  const integrity = readAnalyzerExecutionIntegrity(record.integrity);
  return {
    columns,
    rows,
    totalRows,
    ...(tableName ? { tableName } : {}),
    ...(sql ? { sql } : {}),
    ...(integrity ? { integrity } : {})
  };
}

export function attachAnalyzerExecutionData(
  execution: AnalyzerExecution,
  options: {
    dataModelId?: string;
    dataModelName?: string;
    dataSourceId: string;
    executionContract?: AnalyzerExecutionContract;
    planColumns?: unknown;
    sql?: string;
    tableData: AnalyzerTableData;
    title: string;
  }
): AnalyzerExecution {
  const columns = normalizeAnalyzerColumns(options.tableData.columns, options.tableData.rows, options.planColumns);
  const totalRows = options.tableData.totalRows || options.tableData.rows.length;
  const fetchedRows = options.tableData.rows.length;
  const result: AnalyzerExecution = {
    ...execution,
    columns,
    dataSourceId: options.dataSourceId,
    fetchedRows,
    rowCount: totalRows,
    rows: options.tableData.rows.slice(0, ANALYZER_RESULT_PAGE_SIZE),
    totalRows
  };
  if (options.executionContract) result.executionContract = options.executionContract;
  const dataModelId = readString(options.dataModelId) ?? readString(execution.dataModelId);
  const dataModelName = readString(options.dataModelName) ?? readString(execution.dataModelName);
  const sql = readString(options.sql) ?? readString(execution.sql);
  const title = readString(options.title) ?? readString(execution.title);
  if (dataModelId) result.dataModelId = dataModelId;
  if (dataModelName) result.dataModelName = dataModelName;
  if (sql) result.sql = sql;
  if (title) result.title = title;
  result.title = analyzerResultTitle(result);
  if (!readString(result.message)) result.message = analyzerExecutionSummary(result, totalRows);
  return result;
}

function readRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord).map(row => ({ ...row })) : [];
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
