import type { IncomingMessage } from 'node:http';
import { readJsonBody } from '../../http.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import type { EnsureDataSourcesLoaded } from '../data-source/prisma-runtime-sync.js';
import type { ComponentConfig } from './component-sql-builder/index.js';
import {
  applyAnalyzerChartDataLimit,
  applyAnalyzerComponentDataLimit,
  mergeChartConfigWithComponentConfig,
  normalizeChartConfig,
  synthesizeComponentConfigFromChartConfig,
  validateChartBody
} from './chart-config.js';
import { lookupTable } from './chart-source-lookup.js';
import type {
  ChartRequestParseResult,
  ChartRequestParseWithTimeoutResult
} from './foundation-route-types.js';
import {
  isNonEmptyString,
  isRecord,
  readParameterValues
} from './foundation-route-utils.js';
import {
  SqlOperationTimeoutError,
  withSqlOperationTimeout
} from './sql-operation-timeout.js';
import { buildGeneratedXAxisBucket } from './x-axis-generated-bucket.js';
import {
  analyzerExecutionScopeError,
  validateAnalyzerExecutionScope
} from './analyzer-chart-execution-scope.js';

export async function parseChartRequest(
  req: IncomingMessage,
  access: DataSourceAccessPolicy,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded
): Promise<ChartRequestParseResult> {
  const body = await readJsonBody(req);
  return parseChartRequestBody(body, access, ensureDataSourcesLoaded);
}

export async function parseChartRequestBodyWithTimeout(
  body: unknown,
  access: DataSourceAccessPolicy,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded,
  timeoutMessage: string
): Promise<ChartRequestParseWithTimeoutResult> {
  try {
    return await withSqlOperationTimeout(
      parseChartRequestBody(body, access, ensureDataSourcesLoaded),
      timeoutMessage
    );
  } catch (error) {
    if (error instanceof SqlOperationTimeoutError) return { error: error.message, statusCode: 504 };
    throw error;
  }
}

export async function parseChartRequestBody(
  body: unknown,
  access: DataSourceAccessPolicy,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded
): Promise<ChartRequestParseResult> {
  const dataSourceId = isRecord(body) && isNonEmptyString(body.dataSourceId) ? body.dataSourceId.trim() : null;
  if (dataSourceId) await ensureDataSourcesLoaded({ dataSourceId });
  const config = isRecord(body) ? normalizeChartConfig(body.visualization ?? body.chartConfig) : null;
  const rawComponentConfig = isRecord(body) && isRecord(body.componentConfig)
    ? (body.componentConfig as ComponentConfig)
    : null;
  const generatedXAxisBucket = buildGeneratedXAxisBucket(
    rawComponentConfig ?? (isRecord(body) && isRecord(body.chartConfig) ? body.chartConfig : null)
  );
  const componentConfig = rawComponentConfig
    ?? (generatedXAxisBucket && config && isRecord(body) && isRecord(body.chartConfig)
      ? synthesizeComponentConfigFromChartConfig(config, body.chartConfig)
      : null);
  const mergedConfig = applyAnalyzerChartDataLimit(body, mergeChartConfigWithComponentConfig(config, componentConfig));
  const safeComponentConfig = applyAnalyzerComponentDataLimit(body, componentConfig, mergedConfig);
  const chartTable = isRecord(body) && isNonEmptyString(body.dataSourceId) && isNonEmptyString(body.tableName)
    ? lookupTable(body.dataSourceId, body.tableName, access)
    : null;
  const errors = validateChartBody(body, mergedConfig, chartTable?.table ?? null, access, { strictFields: false });
  if (errors.length > 0) return { error: errors.join('; ') };
  if (!chartTable) return { error: 'Valid dataSourceId is required; Valid tableName is required' };
  const parameterValues = readParameterValues(body as Record<string, unknown>);
  const executionScopeError = analyzerExecutionScopeError(validateAnalyzerExecutionScope({
    parameterValues,
    requester: isRecord(body) ? body.requester : undefined,
    table: chartTable.table
  }));
  if (executionScopeError) return { error: executionScopeError };
  return {
    dataSourceId: (body as Record<string, unknown>).dataSourceId as string,
    tableName: chartTable.table.name,
    source: chartTable.source,
    table: chartTable.table,
    rows: chartTable.rows,
    chartConfig: mergedConfig as NonNullable<typeof mergedConfig>,
    componentConfig: safeComponentConfig,
    generatedXAxisBucket,
    editMode: isRecord(body) && body.editMode === true,
    access,
    parameterValues
  };
}
