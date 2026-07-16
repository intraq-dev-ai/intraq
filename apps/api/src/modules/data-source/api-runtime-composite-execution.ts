import type { DataSourceRecord, TableDefinition } from './foundation-store.js';
import { findDataSource } from './foundation-store.js';
import {
  executeLiveDataSourceSqlQuery,
  isLiveSqlDataSource,
  type LiveSqlRunner
} from './live-sql-query-engine.js';
import {
  executeCustomQueryDataSourceSqlQuery,
  isCustomQueryDataSource
} from './custom-query-live-engine.js';
import { executeDataSourceSqlQuery } from './sql-query-engine.js';
import type { SqlQueryEngineResult, SqlQueryResult } from './sql-query-types.js';
import {
  type ApiRowsOptions,
  type ApiRowsReader,
  type ApiRuntimeResult,
  type CompositeApiConfig,
  type CompositeApiSegmentConfig
} from './api-runtime-types.js';
import {
  applyValueTemplate,
  normalizedLimit,
  readPath
} from './api-runtime-utils.js';
import { defaultApiTable } from './api-runtime-response.js';
import {
  compositeSegmentKeys,
  dedupeCompositeRows,
  executeCompositeWorkflowSteps,
  sortCompositeRows
} from './api-runtime-composite-join.js';
import {
  compositeSegmentSqlQuery,
  evaluateCompositeSegmentCondition,
  type CompositeSqlQuery
} from './api-runtime-composite-sql.js';

let compositeLiveSqlRunnerForTest: LiveSqlRunner | null = null;

export function setCompositeApiLiveSqlRunnerForTest(runner: LiveSqlRunner | null): void {
  compositeLiveSqlRunnerForTest = runner;
}

export async function readCompositeApiRows(
  source: DataSourceRecord,
  table: TableDefinition,
  config: CompositeApiConfig,
  options: ApiRowsOptions,
  started: number,
  baseTemplateValues: Record<string, unknown>,
  readApiRows: ApiRowsReader
): Promise<ApiRuntimeResult<{ executionTime: number; rows: Array<Record<string, unknown>> }>> {
  if ((options.compositeDepth ?? 0) > 4) {
    return { ok: false, statusCode: 400, error: 'Composite API data source references are nested too deeply' };
  }
  const limit = normalizedLimit(options.defaultLimit, options.maxLimit);
  const jobs = config.segments.flatMap(segment => {
    const runtimeValues = compositeSegmentTemplateValues(segment, baseTemplateValues);
    return runtimeValues ? [{ runtimeValues, segment }] : [];
  });
  if (jobs.length === 0) {
    return {
      ok: true,
      data: {
        executionTime: Math.max(1, Date.now() - started),
        rows: []
      }
    };
  }

  const results = await Promise.all(jobs.map(job => readCompositeApiSegmentRows(job.segment, job.runtimeValues, {
    ...options,
    compositeDepth: (options.compositeDepth ?? 0) + 1,
    defaultLimit: limit,
    maxLimit: limit
  }, readApiRows)));
  const failed = results.find((result): result is Exclude<typeof result, { ok: true }> => !result.ok);
  if (failed && !config.continueOnError) return failed;
  const rowsByNodeId = new Map<string, Array<Record<string, unknown>>>();
  jobs.forEach((job, index) => {
    const result = results[index];
    const rows = result?.ok ? result.data.rows : [];
    for (const key of compositeSegmentKeys(job.segment)) rowsByNodeId.set(key, rows);
  });
  const fallbackRows = sortCompositeRows(
    dedupeCompositeRows(results.flatMap(result => result.ok ? result.data.rows : []), config.dedupeBy),
    config.sortBy,
    config.sortDirection
  );
  const merged = config.steps.length > 0
    ? executeCompositeWorkflowSteps(config, rowsByNodeId, fallbackRows, baseTemplateValues)
    : fallbackRows;
  return {
    ok: true,
    data: {
      executionTime: Math.max(1, Date.now() - started),
      rows: merged.slice(0, limit)
    }
  };
}

async function readCompositeApiSegmentRows(
  segment: CompositeApiSegmentConfig,
  templateValues: Record<string, unknown>,
  options: ApiRowsOptions,
  readApiRows: ApiRowsReader
): Promise<ApiRuntimeResult<{ rows: Array<Record<string, unknown>> }>> {
  const childSource = findDataSource(segment.dataSourceId);
  if (!childSource) return { ok: false, statusCode: 404, error: `Composite API segment data source was not found: ${segment.dataSourceId}` };
  const limit = normalizedLimit(options.defaultLimit, options.maxLimit);
  const childTable = segment.tableName
    ? childSource.tables.find(item => item.name === segment.tableName || item.id === segment.tableName)
    : childSource.tables[0];
  if (childSource.type === 'api') {
    const table = childTable ?? defaultApiTable(childSource);
    const result = await readApiRows(childSource, table, {
      ...options,
      defaultLimit: limit,
      maxLimit: limit,
      parameterValues: templateValues
    });
    if (!result.ok) return result;
    return { ok: true, data: { rows: result.data.rows.map(row => mapCompositeSegmentRow(row, segment)) } };
  }

  const queryResult = compositeSegmentSqlQuery(childSource, segment, templateValues, childTable);
  if (!queryResult.ok) return queryResult;
  const result = await executeCompositeSegmentSqlQuery(childSource, queryResult.data, segment, templateValues, limit);
  if (!result.ok) return result;
  return { ok: true, data: { rows: result.data.rows.map(row => mapCompositeSegmentRow(row, segment)) } };
}

async function executeCompositeSegmentSqlQuery(
  source: DataSourceRecord,
  query: CompositeSqlQuery,
  segment: CompositeApiSegmentConfig,
  templateValues: Record<string, unknown>,
  limit: number
): Promise<SqlQueryEngineResult<SqlQueryResult>> {
  if (isCustomQueryDataSource(source)) {
    if (query.values.length > 0) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Composite SQL parameters require a live SQL data source that supports bound values'
      };
    }
    return executeCustomQueryDataSourceSqlQuery({
      source,
      query: query.sql,
      defaultLimit: limit,
      maxLimit: limit,
      parameterValues: templateValues
    });
  }
  if (isLiveSqlDataSource(source)) {
    return executeLiveDataSourceSqlQuery({
      source,
      query: query.sql,
      defaultLimit: limit,
      maxLimit: limit,
      preLimited: true,
      ...(query.values.length > 0 ? { values: query.values } : {}),
      ...(compositeLiveSqlRunnerForTest ? { runner: compositeLiveSqlRunnerForTest } : {}),
      ...(segment.timeoutMs ? { queryTimeoutMs: segment.timeoutMs } : {})
    });
  }
  if (query.values.length > 0) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Composite SQL parameters are not supported for this data source type'
    };
  }
  return executeDataSourceSqlQuery({
    dataSourceId: source.id,
    query: query.sql,
    defaultLimit: limit,
    maxLimit: limit,
    parameterValues: templateValues
  });
}

function compositeSegmentTemplateValues(
  segment: CompositeApiSegmentConfig,
  baseTemplateValues: Record<string, unknown>
): Record<string, unknown> | null {
  const merged = {
    ...baseTemplateValues,
    ...segment.parameterValues
  };
  const templated = applyValueTemplate(merged, baseTemplateValues);
  if (!templated.ok || typeof templated.data !== 'object' || templated.data === null || Array.isArray(templated.data)) return merged;
  const baseValues = addCompositeRangeValues({
    ...baseTemplateValues,
    ...templated.data as Record<string, unknown>
  });
  if (segment.condition && !evaluateCompositeSegmentCondition(segment.condition, baseValues)) return null;
  return compositeSegmentRangeValues(segment, baseValues);
}

function addCompositeRangeValues(values: Record<string, unknown>): Record<string, unknown> {
  const range = readCompositeRange(values);
  if (!range) return values;
  return {
    ...values,
    segmentStartDate: values.segmentStartDate ?? toIsoDateTime(range.start),
    segmentEndDate: values.segmentEndDate ?? toIsoDateTime(range.end),
    segmentStartDateOnly: values.segmentStartDateOnly ?? toIsoDate(range.start),
    segmentEndDateOnly: values.segmentEndDateOnly ?? toIsoDate(range.end)
  };
}

function compositeSegmentRangeValues(
  segment: CompositeApiSegmentConfig,
  templateValues: Record<string, unknown>
): Record<string, unknown> | null {
  const mode = segment.when?.toLowerCase().replace(/[\s_-]+/g, '');
  if (!mode || !['history', 'beforeboundary', 'beforecutoff', 'current', 'afterboundary', 'aftercutoff', 'sinceboundary'].includes(mode)) {
    return templateValues;
  }
  const range = readCompositeRange(templateValues);
  const boundary = readCompositeBoundary(templateValues);
  if (!range || !boundary) return templateValues;
  const beforeBoundary = mode === 'history' || mode === 'beforeboundary' || mode === 'beforecutoff';
  const inclusiveHistoryBoundary = new Date(boundary.getTime() - 1);
  const start = beforeBoundary ? range.start : maxDate(range.start, boundary);
  const end = beforeBoundary ? minDate(range.end, inclusiveHistoryBoundary) : range.end;
  if (end.getTime() < start.getTime()) return null;
  return {
    ...templateValues,
    segmentStartDate: toIsoDateTime(start),
    segmentEndDate: toIsoDateTime(end),
    segmentStartDateOnly: toIsoDate(start),
    segmentEndDateOnly: toIsoDate(end)
  };
}

function readCompositeRange(values: Record<string, unknown>): { start: Date; end: Date } | null {
  const startRaw = firstTemplatePath(values, ['fromDate', 'startDate', 'StartDate', 'selectedDate', 'SelectedDate', 'businessDate']);
  const endRaw = firstTemplatePath(values, ['toDate', 'endDate', 'EndDate', 'selectedDate', 'SelectedDate', 'businessDate']);
  const start = parseCompositeDate(startRaw);
  const end = parseCompositeDate(endRaw);
  if (!start || !end) return null;
  return { start, end };
}

function readCompositeBoundary(values: Record<string, unknown>): Date | null {
  return parseCompositeDate(firstTemplatePath(values, [
    'todayTradingStart',
    'today_trading_start',
    'boundaryDate',
    'boundary',
    'cutoffDate',
    'cutoff'
  ]));
}

function firstTemplatePath(values: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(values, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function parseCompositeDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 9_999_999_999 ? value : value * 1000);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function toIsoDateTime(value: Date): string {
  return value.toISOString();
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function mapCompositeSegmentRow(row: Record<string, unknown>, segment: CompositeApiSegmentConfig): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[segment.fieldMap[key] ?? key] = value;
  }
  if (segment.sourceLabelField && segment.name) output[segment.sourceLabelField] = segment.name;
  return output;
}
