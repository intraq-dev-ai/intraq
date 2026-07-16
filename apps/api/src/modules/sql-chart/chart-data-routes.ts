import type { ServerResponse } from 'node:http';
import type { ApiRuntimeStateOptions } from '../data-source/api-data-source-runtime.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from '../data-source/prisma-runtime-sync.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import {
  buildChartData,
  chartConfigForLoadedRows
} from './chart-data-builder.js';
import { buildChartExecutionIntegrity } from './chart-execution-integrity.js';
import { parseChartRequestBodyWithTimeout } from './chart-request-parser.js';
import {
  chartDataOperationTimeoutMs,
  loadChartRows
} from './chart-row-loader.js';
import { sendRawJson } from './foundation-route-utils.js';
import {
  SqlOperationTimeoutError,
  withSqlOperationTimeout
} from './sql-operation-timeout.js';

export async function sendChartDataForBody(
  body: unknown,
  res: ServerResponse,
  access: DataSourceAccessPolicy,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
  apiRuntimeState: ApiRuntimeStateOptions = {}
): Promise<void> {
  const parsed = await parseChartRequestBodyWithTimeout(body, access, ensureDataSourcesLoaded, 'Chart data source load timed out.');
  if ('error' in parsed) {
    sendRawJson(res, 'statusCode' in parsed ? parsed.statusCode : 400, { success: false, error: parsed.error });
    return;
  }
  const rows = await withSqlOperationTimeout(
    loadChartRows({ ...parsed, apiRuntimeState }),
    'Chart data query timed out.',
    chartDataOperationTimeoutMs(parsed)
  ).catch(error => {
    if (error instanceof SqlOperationTimeoutError) return { error: error.message, statusCode: 504 } as const;
    throw error;
  });
  if ('error' in rows) {
    sendRawJson(res, rows.statusCode, { success: false, error: rows.error });
    return;
  }
  const chartConfig = chartConfigForLoadedRows(parsed.chartConfig, parsed.componentConfig, rows.rows, rows.rowsAggregatedAtSource);
  const chartData = buildChartData(
    chartConfig,
    parsed.editMode,
    rows.rows,
    parsed.tableName,
    parsed.source.type,
    {
      filtersAppliedAtSource: rows.filtersAppliedAtSource,
      generatedXAxisBucket: parsed.generatedXAxisBucket,
      rowsAggregatedAtSource: rows.rowsAggregatedAtSource,
      sqlQuery: rows.sqlQuery
    }
  );
  sendRawJson(res, 200, {
    success: true,
    data: chartData,
    meta: {
      aggregatedOnServer: true,
      executionTime: 1,
      editMode: parsed.editMode,
      integrity: buildChartExecutionIntegrity({ chartData, parsed, sqlQuery: rows.sqlQuery })
    }
  });
}
