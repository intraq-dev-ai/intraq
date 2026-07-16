import type { ServerResponse } from 'node:http';
import type { ApiRuntimeStateOptions } from '../data-source/api-data-source-runtime.js';
import {
  readApiDataSourceDirectExport,
  readApiDataSourceExportRows
} from '../data-source/api-data-source-runtime.js';
import {
  applyExportRowTransforms,
  hasExportRowTransforms,
  readExportSectionOptions
} from '../data-source/export-row-transforms.js';
import {
  findDataSource,
  findTableInDataSource
} from '../data-source/foundation-store.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from '../data-source/prisma-runtime-sync.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import {
  buildChartData,
  chartConfigForLoadedRows
} from './chart-data-builder.js';
import {
  columnsForRows,
  csvLinesForSection,
  csvForSections,
  exportFileName,
  rowsFromChartData,
  sanitizeExportBaseName,
  sanitizeExportFileName,
  workbookXmlForSections
} from './chart-export-formatters.js';
import { mergeExportTransformConfigs } from './chart-export-workflows.js';
import { parseChartRequestBodyWithTimeout } from './chart-request-parser.js';
import {
  chartDataOperationTimeoutMs,
  loadChartRows
} from './chart-row-loader.js';
import type { ComponentConfig } from './component-sql-builder/index.js';
import {
  DEFAULT_EXPORT_LIMIT,
  MAX_EXPORT_LIMIT,
  type ChartDataExportFormat,
  type ChartDataExportItem,
  type ChartDataExportPayload,
  type ChartDataExportSection,
  type WorkflowExportResolution,
  type WorkflowExportResolver
} from './foundation-route-types.js';
import {
  asString,
  isRecord,
  positiveNumber,
  readRecord,
  sendRawBuffer,
  sendRawJson,
  sendRawText
} from './foundation-route-utils.js';
import type {
  SqlEditorDataSource,
  SqlEditorTable
} from './sql-editor-data.js';
import {
  SqlOperationTimeoutError,
  withSqlOperationTimeout
} from './sql-operation-timeout.js';

type ExportSectionResult =
  | { ok: true; data: ChartDataExportSection }
  | { ok: false; statusCode: 400 | 401 | 403 | 404 | 502 | 504; error: string };

export async function sendChartDataExportForBody(
  body: unknown,
  res: ServerResponse,
  access: DataSourceAccessPolicy,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
  workflowResolver: WorkflowExportResolver = async (_item, request) => ({ ok: true, request }),
  apiRuntimeState: ApiRuntimeStateOptions = {}
): Promise<void> {
  const payload = normalizeExportPayload(body);
  if (!payload) {
    sendRawJson(res, 400, { success: false, error: 'format and at least one export item are required' });
    return;
  }

  const directExport = payload.items.length === 1
    ? await tryDirectApiExportForItem(
      payload.items[0] as ChartDataExportItem,
      payload.format,
      access,
      ensureDataSourcesLoaded,
      workflowResolver,
      apiRuntimeState
    )
    : null;
  if (directExport) {
    if (!directExport.ok) {
      sendRawJson(res, directExport.statusCode, { success: false, error: directExport.error });
      return;
    }
    const fileName = directExport.data.filename ?? exportFileName(payload.dashboardName, payload.items[0]?.componentTitle, directExport.data.extension);
    sendRawBuffer(res, 200, directExport.data.body, {
      'content-type': directExport.data.contentType,
      'content-disposition': `attachment; filename="${sanitizeExportFileName(fileName, directExport.data.extension)}"`
    });
    return;
  }

  const sections: ChartDataExportSection[] = [];
  for (const item of payload.items) {
    const section = await exportSectionForItem(
      item,
      access,
      ensureDataSourcesLoaded,
      workflowResolver,
      apiRuntimeState,
      payload.limit,
      payload.format
    );
    if (!section.ok) {
      sendRawJson(res, section.statusCode, { success: false, error: section.error, componentTitle: item.componentTitle });
      return;
    }
    sections.push(section.data);
  }
  const fileBase = sanitizeExportBaseName(payload.dashboardName ?? 'dashboard_export');
  if (payload.format === 'json') {
    sendRawText(res, 200, JSON.stringify(sections, null, 2), {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${fileBase}.json"`
    });
    return;
  }
  if (payload.format === 'excel') {
    sendRawText(res, 200, workbookXmlForSections(sections), {
      'content-type': 'application/vnd.ms-excel; charset=utf-8',
      'content-disposition': `attachment; filename="${fileBase}.xls"`
    });
    return;
  }
  sendRawText(res, 200, csvForSections(sections), {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${fileBase}.csv"`
  });
}

export async function sendChartDataCsvDownloadForBody(
  body: unknown,
  res: ServerResponse,
  access: DataSourceAccessPolicy,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
  workflowResolver: WorkflowExportResolver = async (_item, request) => ({ ok: true, request }),
  apiRuntimeState: ApiRuntimeStateOptions = {}
): Promise<void> {
  const payload = normalizeExportPayload(body);
  if (!payload) {
    sendRawJson(res, 400, { success: false, error: 'format and at least one export item are required' });
    return;
  }
  if (payload.format !== 'csv') {
    await sendChartDataExportForBody(body, res, access, ensureDataSourcesLoaded, workflowResolver, apiRuntimeState);
    return;
  }

  const directExport = payload.items.length === 1
    ? await tryDirectApiExportForItem(
      payload.items[0] as ChartDataExportItem,
      payload.format,
      access,
      ensureDataSourcesLoaded,
      workflowResolver,
      apiRuntimeState
    )
    : null;
  if (directExport) {
    if (!directExport.ok) {
      sendRawJson(res, directExport.statusCode, { success: false, error: directExport.error });
      return;
    }
    const fileName = directExport.data.filename ?? exportFileName(payload.dashboardName, payload.items[0]?.componentTitle, directExport.data.extension);
    sendRawBuffer(res, 200, directExport.data.body, {
      'content-type': directExport.data.contentType,
      'content-disposition': `attachment; filename="${sanitizeExportFileName(fileName, directExport.data.extension)}"`
    });
    return;
  }

  const fileBase = sanitizeExportBaseName(payload.dashboardName ?? 'dashboard_export');
  let started = false;
  for (const item of payload.items) {
    const section = await exportSectionForItem(
      item,
      access,
      ensureDataSourcesLoaded,
      workflowResolver,
      apiRuntimeState,
      payload.limit,
      payload.format
    );
    if (!section.ok) {
      if (!started) {
        sendRawJson(res, section.statusCode, { success: false, error: section.error, componentTitle: item.componentTitle });
      } else {
        res.destroy(new Error(section.error));
      }
      return;
    }
    if (!started) {
      started = true;
      res.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${fileBase}.csv"`
      });
    }
    for (const line of csvLinesForSection(section.data)) {
      res.write(`${line}\n`);
    }
    res.write('\n');
  }
  if (!started) {
    sendRawJson(res, 400, { success: false, error: 'No export sections were available' });
    return;
  }
  res.end();
}

async function tryDirectApiExportForItem(
  item: ChartDataExportItem,
  format: ChartDataExportFormat,
  access: DataSourceAccessPolicy,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded,
  workflowResolver: WorkflowExportResolver,
  apiRuntimeState: ApiRuntimeStateOptions
): Promise<Awaited<ReturnType<typeof readApiDataSourceDirectExport>> | null> {
  const request = isRecord(item.chartDataRequest) ? item.chartDataRequest : item.request;
  const workflowRequest = await workflowResolver(item, request);
  if (!workflowRequest.ok) {
    return { ok: false, statusCode: workflowRequest.statusCode, error: workflowRequest.error };
  }
  if (workflowRequest.rowTransform && hasExportRowTransforms(workflowRequest.rowTransform)) return null;
  const parsed = await parseChartRequestBodyWithTimeout(workflowRequest.request, access, ensureDataSourcesLoaded, 'Export data source load timed out.');
  if ('error' in parsed) return null;
  const source = findDataSource(parsed.dataSourceId);
  if (!source || source.type !== 'api') return null;
  const lookup = findTableInDataSource(parsed.dataSourceId, parsed.tableName);
  if (!lookup) return null;
  const tableSettings = readRecord(lookup.table.settings);
  const hasTableDirectExport = Boolean(tableSettings.export || tableSettings.exports || tableSettings.apiExport || tableSettings.download || readRecord(tableSettings.api).export);
  const hasSourceDirectExport = Boolean(source.config.export || source.config.exports);
  if (!hasTableDirectExport && !hasSourceDirectExport) return null;
  return readApiDataSourceDirectExport(source, lookup.table, {
    ...apiRuntimeState,
    format,
    parameterValues: parsed.parameterValues
  });
}

async function exportSectionForItem(
  item: ChartDataExportItem,
  access: DataSourceAccessPolicy,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded,
  workflowResolver: (item: ChartDataExportItem, request: unknown) => Promise<WorkflowExportResolution>,
  apiRuntimeState: ApiRuntimeStateOptions,
  limit: number,
  format: ChartDataExportFormat
): Promise<
  ExportSectionResult
> {
  const request = exportChartRequest(item, limit);
  if (!request) return { ok: false, statusCode: 400, error: 'Export item must include a chart data request' };
  const workflowRequest = await workflowResolver(item, request);
  if (!workflowRequest.ok) return workflowRequest;
  const parsed = await parseChartRequestBodyWithTimeout(workflowRequest.request, access, ensureDataSourcesLoaded, 'Export data source load timed out.');
  if ('error' in parsed) {
    return {
      ok: false,
      statusCode: ('statusCode' in parsed ? parsed.statusCode : 400) as 400 | 401 | 403 | 404 | 502 | 504,
      error: parsed.error
    };
  }
  const configuredApiRows = await readConfiguredApiExportRows(parsed, apiRuntimeState, item, limit, format, workflowRequest.rowTransform);
  if (configuredApiRows) return configuredApiRows;
  const rows = await withSqlOperationTimeout(
    loadChartRows({ ...parsed, apiRuntimeState }),
    'Export data query timed out.',
    chartDataOperationTimeoutMs(parsed)
  ).catch(error => {
    if (error instanceof SqlOperationTimeoutError) return { error: error.message, statusCode: 504 } as const;
    throw error;
  });
  if ('error' in rows) {
    return {
      ok: false,
      statusCode: rows.statusCode as 400 | 401 | 403 | 404 | 502 | 504,
      error: rows.error
    };
  }
  const rowTransform = mergeExportTransformConfigs(
    exportRowTransformConfig(parsed.componentConfig, parsed.table.settings),
    workflowRequest.rowTransform
  ) ?? {};
  if (hasExportRowTransforms(rowTransform)) {
    const transformed = applyExportRowTransforms(rows.rows, rowTransform, columnsForRows(rows.rows));
    return {
      ok: true,
      data: {
        columns: transformed.columns,
        ...(item.componentId ? { componentId: item.componentId } : {}),
        componentTitle: asString(item.componentTitle) ?? parsed.tableName,
        componentType: asString(item.componentType) ?? parsed.chartConfig.chartType,
        ...(transformed.includeSectionHeader === undefined ? {} : { includeSectionHeader: transformed.includeSectionHeader }),
        rows: transformed.rows
      }
    };
  }
  const chartConfig = chartConfigForLoadedRows(parsed.chartConfig, parsed.componentConfig, rows.rows, rows.rowsAggregatedAtSource);
  const chartData = buildChartData(
    chartConfig,
    true,
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
  const exportRows = rowsFromChartData(chartData);
  return {
    ok: true,
    data: {
      columns: columnsForRows(exportRows),
      ...(item.componentId ? { componentId: item.componentId } : {}),
      componentTitle: asString(item.componentTitle) ?? parsed.tableName,
      componentType: asString(item.componentType) ?? parsed.chartConfig.chartType,
      ...readExportSectionOptions(rowTransform),
      rows: exportRows
    }
  };
}

async function readConfiguredApiExportRows(
  parsed: {
    componentConfig: ComponentConfig | null;
    dataSourceId: string;
    tableName: string;
    source: SqlEditorDataSource;
    table: SqlEditorTable;
    parameterValues: Record<string, unknown>;
  },
  apiRuntimeState: ApiRuntimeStateOptions,
  item: ChartDataExportItem,
  limit: number,
  format: ChartDataExportFormat,
  workflowTransform?: Record<string, unknown>
): Promise<
  ExportSectionResult
  | null
> {
  const source = findDataSource(parsed.dataSourceId);
  const lookup = findTableInDataSource(parsed.dataSourceId, parsed.tableName);
  if (!source || source.type !== 'api' || !lookup) return null;
  const result = await readApiDataSourceExportRows(source, lookup.table, {
    ...apiRuntimeState,
    defaultLimit: limit,
    format,
    maxLimit: MAX_EXPORT_LIMIT,
    parameterValues: parsed.parameterValues
  });
  if (!result) return null;
  if (!result.ok) {
    return {
      ok: false,
      statusCode: result.statusCode as 400 | 401 | 403 | 404 | 502 | 504,
      error: result.error
    };
  }
  const componentTransform = exportRowTransformConfig(parsed.componentConfig, {}, {});
  const postTransform = mergeExportTransformConfigs(componentTransform, workflowTransform);
  const exportRows = postTransform && hasExportRowTransforms(postTransform)
    ? applyExportRowTransforms(result.data.rows, postTransform, result.data.columns)
    : { columns: result.data.columns, rows: result.data.rows };
  const sectionOptions = readExportSectionOptions(mergeExportTransformConfigs(
    exportRowTransformConfig(parsed.componentConfig, lookup.table.settings, source.config),
    workflowTransform
  ));
  return {
    ok: true,
    data: {
      columns: exportRows.columns,
      ...(item.componentId ? { componentId: item.componentId } : {}),
      componentTitle: asString(item.componentTitle) ?? parsed.tableName,
      componentType: asString(item.componentType) ?? 'export',
      ...(sectionOptions.includeSectionHeader === undefined ? {} : { includeSectionHeader: sectionOptions.includeSectionHeader }),
      rows: exportRows.rows
    }
  };
}

function exportChartRequest(item: ChartDataExportItem, limit: number): Record<string, unknown> | null {
  const raw = isRecord(item.chartDataRequest) ? item.chartDataRequest : isRecord(item.request) ? item.request : null;
  if (!raw) return null;
  return applyExportLimit(raw, limit);
}

function applyExportLimit(raw: Record<string, unknown>, limit: number): Record<string, unknown> {
  const chartConfig = isRecord(raw.chartConfig)
    ? { ...raw.chartConfig, limit: exportLimitValue(raw.chartConfig.limit, limit) }
    : raw.chartConfig;
  const visualization = isRecord(raw.visualization)
    ? { ...raw.visualization, limit: exportLimitValue(raw.visualization.limit, limit) }
    : raw.visualization;
  const componentConfig = isRecord(raw.componentConfig)
    ? { ...raw.componentConfig, limit: exportLimitValue(raw.componentConfig.limit, limit) }
    : raw.componentConfig;
  return {
    ...raw,
    editMode: true,
    ...(chartConfig ? { chartConfig } : {}),
    ...(visualization ? { visualization } : {}),
    ...(componentConfig ? { componentConfig } : {})
  };
}

function exportLimitValue(value: unknown, requestedLimit: number): number {
  const existing = positiveNumber(value);
  return Math.min(Math.max(existing ?? 0, requestedLimit), MAX_EXPORT_LIMIT);
}

function normalizeExportPayload(value: unknown): ChartDataExportPayload | null {
  if (!isRecord(value)) return null;
  const format = normalizeExportFormat(value.format);
  const items = Array.isArray(value.items)
    ? value.items.filter(isRecord) as ChartDataExportItem[]
    : isRecord(value.chartDataRequest) || isRecord(value.request)
      ? [value as ChartDataExportItem]
      : [];
  if (!format || items.length === 0) return null;
  return {
    ...(asString(value.dashboardName ?? value.name) ? { dashboardName: asString(value.dashboardName ?? value.name) as string } : {}),
    format,
    items,
    limit: Math.min(positiveNumber(value.limit) ?? DEFAULT_EXPORT_LIMIT, MAX_EXPORT_LIMIT)
  };
}

function normalizeExportFormat(value: unknown): ChartDataExportFormat | null {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === 'csv' || normalized === 'json' || normalized === 'excel' || normalized === 'xlsx' || normalized === 'xls') {
    return normalized === 'xlsx' || normalized === 'xls' ? 'excel' : normalized;
  }
  return null;
}

function exportRowTransformConfig(
  componentConfig: ComponentConfig | null | undefined,
  tableSettings: unknown,
  sourceConfig?: unknown
): Record<string, unknown> {
  const source = readRecord(sourceConfig);
  const table = readRecord(tableSettings);
  const tableApi = readRecord(table.api ?? table.request);
  const component = readRecord(componentConfig);
  return {
    ...readRecord(source.export ?? source.exports),
    ...readRecord(tableApi.export ?? tableApi.exports),
    ...readRecord(table.export ?? table.exports ?? table.apiExport ?? table.download),
    ...readRecord(component.export ?? component.exports),
    ...readRecord(component.rowTransform ?? component.rowTransforms ?? component.exportTransform ?? component.exportTransforms)
  };
}
