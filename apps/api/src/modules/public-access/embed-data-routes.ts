import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody } from '../../http.js';
import { dataSources, rowsForTable, type DataSourceRecord } from '../data-source/foundation-store.js';
import { resolveDownloadTable, sanitizeFileName, toCsv } from '../data-source/compat-data.js';
import { readDataSourceFieldOptions } from '../data-source/data-source-table-actions.js';
import type { EnsureDataSourcesLoaded } from '../data-source/prisma-runtime-sync.js';
import type { ApiRuntimeStateOptions } from '../data-source/api-data-source-runtime.js';
import { updateRuntimeDataSource } from '../data-source/prisma-runtime-persistence.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import {
  resolveWorkflowExportRequestForPrisma,
  sendChartDataExportForBody,
  sendChartDataForBody
} from '../sql-chart/foundation-routes.js';
import { readBearerToken as readAuthBearerToken } from '../auth-setup/auth-tokens.js';
import {
  dataSourceAllowedByDataAccessRules,
  resolveEmbedDataAccessFilters
} from './embed-access-scope.js';
import {
  dataSourceAllowedByScope,
  filterRowsByEmbedScope,
  filtersForEmbedTable
} from './embed-data-scope.js';
import {
  addTableKeys,
  bodyWithEmbedParameterValues,
  sanitizeDashboardRenderEvent,
  toEmbedDataSource
} from './embed-data-helpers.js';
import type { EmbedScopeFilter, EmbedToken } from './embed-token-store.js';
import {
  isNonEmptyString,
  isRecord,
  readDownloadInteger,
  readLimit,
  readOptionalString,
  sendDownloadText,
  sendJson
} from './embed-common.js';
import type { EmbedTokenService } from './embed-token-service.js';

export class EmbedDataRoutes {
  constructor(
    private readonly tokenService: EmbedTokenService,
    private readonly prismaClient: IntraQPrismaClient | null,
    private readonly ensureDataSourcesLoaded: EnsureDataSourcesLoaded
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/embed/data-sources') {
      await this.sendDataSources(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/embed/chart-data') {
      await this.sendEmbedChartData(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/embed/filter-options') {
      await this.sendEmbedFilterOptions(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/embed/chart-data/export') {
      await this.sendEmbedChartDataExport(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/embed/render-events') {
      await this.recordEmbedRenderEvent(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/embed/data-sources/download') {
      await this.sendEmbedDataSourceDownload(req, res);
      return true;
    }
    const dataSourceMatch = /^\/api\/embed\/data-sources\/([^/]+)\/(fields|data|fields-and-data)$/.exec(url.pathname);
    if (req.method === 'GET' && dataSourceMatch?.[1] && dataSourceMatch[2]) {
      await this.sendDataSourcePayload(req, res, url, decodeURIComponent(dataSourceMatch[1]), dataSourceMatch[2]);
      return true;
    }
    return false;
  }

  private async sendDataSources(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const scoped = await this.tokenService.requireScopedToken(req, readAuthBearerToken(req.headers.authorization) ?? null);
    if (scoped.ok === false) {
      sendJson(res, scoped.statusCode, { error: scoped.error });
      return;
    }
    sendJson(res, 200, dataSources
      .filter(source => scoped.dataSourceIds.has(source.id)
        && dataSourceAllowedByScope(source, scoped.token.dataScope)
        && dataSourceAllowedByDataAccessRules(source, scoped.token))
      .map(toEmbedDataSource));
  }

  private async sendDataSourcePayload(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    dataSourceId: string,
    payload: string
  ): Promise<void> {
    const token = payload === 'fields-and-data'
      ? readAuthBearerToken(req.headers.authorization) ?? null
      : url.searchParams.get('token');
    const scoped = await this.tokenService.requireScopedToken(req, token);
    if (scoped.ok === false) {
      sendJson(res, scoped.statusCode, { error: scoped.error });
      return;
    }
    if (!scoped.dataSourceIds.has(dataSourceId)) {
      sendJson(res, 403, { error: 'Data source not allowed for this dashboard' });
      return;
    }
    const dataSource = dataSources.find(source => source.id === dataSourceId);
    if (!dataSource) {
      sendJson(res, 404, { error: 'Data source not found' });
      return;
    }
    if (!dataSourceAllowedByScope(dataSource, scoped.token.dataScope)) {
      sendJson(res, 403, { error: 'Data source not allowed for this embed session' });
      return;
    }
    if (!dataSourceAllowedByDataAccessRules(dataSource, scoped.token)) {
      sendJson(res, 403, { error: 'Data source not allowed for this embed access policy' });
      return;
    }
    const table = dataSource.tables[0];
    if (!table) {
      sendJson(res, 404, { error: 'Data source not found' });
      return;
    }
    const limit = readLimit(url.searchParams.get('limit'));
    if (limit === null) {
      sendJson(res, 400, { error: 'limit must be an integer between 1 and 5000' });
      return;
    }
    const scopeFilters = filtersForEmbedTable(scoped.token.dataScope, dataSource, table);
    const accessFilters = await resolveEmbedDataAccessFilters(scoped.token, dataSource, table);
    const appliedFilters = accessFilters.denyAll ? scopeFilters : [...scopeFilters, ...accessFilters.filters];
    const filteredRows = accessFilters.denyAll
      ? []
      : filterRowsByEmbedScope(rowsForTable(dataSource.id, table.name), appliedFilters);
    const limitedRows = filteredRows.slice(0, limit);
    if (payload === 'fields') {
      sendJson(res, 200, table.fields);
      return;
    }
    if (payload === 'data') {
      sendJson(res, 200, { data: limitedRows });
      return;
    }
    sendJson(res, 200, {
      fields: table.fields,
      rows: limitedRows,
      tableName: table.name,
      appliedFilters,
      defaultFilters: null,
      storedAdditionalFilters: null,
      filteredTotal: filteredRows.length,
      hasData: limitedRows.length > 0,
      filtersApplied: appliedFilters,
      accessPolicyApplied: accessFilters.filters.length > 0 || accessFilters.denyAll,
      dashboardFiltersApplied: [],
      limit,
      offset: 0,
      total: limitedRows.length,
      success: true
    });
  }

  private async sendEmbedChartData(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const token = readAuthBearerToken(req.headers.authorization) ?? null;
    const scoped = await this.tokenService.requireScopedToken(req, token);
    if (scoped.ok === false) {
      sendJson(res, scoped.statusCode, { success: false, error: scoped.error });
      return;
    }

    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dataSourceId) || !isNonEmptyString(body.tableName)) {
      sendJson(res, 400, { success: false, error: 'Valid dataSourceId is required; Valid tableName is required' });
      return;
    }
    const dataSourceId = body.dataSourceId.trim();
    const tableName = body.tableName.trim();
    if (!scoped.dataSourceIds.has(dataSourceId)) {
      sendJson(res, 403, { success: false, error: 'Data source not allowed for this dashboard' });
      return;
    }

    await this.ensureDataSourcesLoaded({ dataSourceId });
    const dataSource = dataSources.find(source => source.id === dataSourceId);
    const table = dataSource?.tables.find(item => item.name === tableName || item.id === tableName);
    if (!dataSource || !table) {
      sendJson(res, 404, { success: false, error: 'Data source not found' });
      return;
    }
    if (!dataSourceAllowedByScope(dataSource, scoped.token.dataScope)) {
      sendJson(res, 403, { success: false, error: 'Data source not allowed for this embed session' });
      return;
    }
    if (!dataSourceAllowedByDataAccessRules(dataSource, scoped.token)) {
      sendJson(res, 403, { success: false, error: 'Data source not allowed for this embed access policy' });
      return;
    }

    const accessFilters = await resolveEmbedDataAccessFilters(scoped.token, dataSource, table);
    const scopeFilters = filtersForEmbedTable(scoped.token.dataScope, dataSource, table);
    const appliedAccessFilters = accessFilters.denyAll ? [] : [...scopeFilters, ...accessFilters.filters];
    const tableKeys = [table.id, table.name].filter(isNonEmptyString);
    const access: DataSourceAccessPolicy = {
      allowedDataSourceIds: new Set([dataSource.id]),
      allowedTableIds: new Set(tableKeys),
      allowUnscopedAccess: true,
      showSampleDataSources: true
    };
    await sendChartDataForBody(
      bodyWithEmbedParameterValues(body, scoped.token, appliedAccessFilters, accessFilters.denyAll),
      res,
      access,
      this.ensureDataSourcesLoaded,
      this.apiRuntimeStateOptions()
    );
  }

  private async sendEmbedFilterOptions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const token = readAuthBearerToken(req.headers.authorization) ?? null;
    const scoped = await this.tokenService.requireScopedToken(req, token);
    if (scoped.ok === false) {
      sendJson(res, scoped.statusCode, { success: false, error: scoped.error });
      return;
    }

    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dataSourceId) || !isNonEmptyString(body.tableName)) {
      sendJson(res, 400, { success: false, error: 'Valid dataSourceId is required; Valid tableName is required' });
      return;
    }
    const dataSourceId = body.dataSourceId.trim();
    const tableName = body.tableName.trim();
    if (!scoped.dataSourceIds.has(dataSourceId)) {
      sendJson(res, 403, { success: false, error: 'Data source not allowed for this dashboard' });
      return;
    }

    await this.ensureDataSourcesLoaded({ dataSourceId });
    const dataSource = dataSources.find(source => source.id === dataSourceId);
    if (!dataSource) {
      sendJson(res, 404, { success: false, error: 'Data source not found' });
      return;
    }
    if (!dataSourceAllowedByScope(dataSource, scoped.token.dataScope)) {
      sendJson(res, 403, { success: false, error: 'Data source not allowed for this embed session' });
      return;
    }
    if (!dataSourceAllowedByDataAccessRules(dataSource, scoped.token)) {
      sendJson(res, 403, { success: false, error: 'Data source not allowed for this embed access policy' });
      return;
    }

    const table = dataSource.tables.find(item => item.name === tableName || item.id === tableName);
    if (!table) {
      sendJson(res, 404, { success: false, error: 'Data source table not found' });
      return;
    }
    const accessFilters = await resolveEmbedDataAccessFilters(scoped.token, dataSource, table);
    const scopeFilters = filtersForEmbedTable(scoped.token.dataScope, dataSource, table);
    const appliedAccessFilters = accessFilters.denyAll ? [] : [...scopeFilters, ...accessFilters.filters];
    const tableKeys = [table.id, table.name].filter(isNonEmptyString);
    const access: DataSourceAccessPolicy = {
      allowedDataSourceIds: new Set([dataSource.id]),
      allowedTableIds: new Set(tableKeys),
      allowUnscopedAccess: true,
      showSampleDataSources: true
    };
    const scopedBody = bodyWithEmbedParameterValues(body, scoped.token, appliedAccessFilters, accessFilters.denyAll);
    const result = await readDataSourceFieldOptions(dataSourceId, scopedBody, this.prismaClient, access);
    if (result.ok === false) {
      sendJson(res, result.statusCode, { success: false, error: result.error });
      return;
    }
    sendJson(res, 200, { success: true, data: result.data });
  }

  private async sendEmbedDataSourceDownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const token = readAuthBearerToken(req.headers.authorization) ?? null;
    const scoped = await this.tokenService.requireScopedToken(req, token);
    if (scoped.ok === false) {
      sendJson(res, scoped.statusCode, { success: false, error: scoped.error });
      return;
    }

    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.componentType) || !isNonEmptyString(body.dataSource)) {
      sendJson(res, 400, { success: false, error: 'componentType and dataSource are required' });
      return;
    }

    await Promise.all([...scoped.dataSourceIds].map(dataSourceId => this.ensureDataSourcesLoaded({ dataSourceId })));
    const lookup = resolveDownloadTable(body.dataSource.trim());
    if (!lookup || !scoped.dataSourceIds.has(lookup.source.id)) {
      sendJson(res, 404, { success: false, error: 'Data source not found' });
      return;
    }
    if (!dataSourceAllowedByScope(lookup.source, scoped.token.dataScope)) {
      sendJson(res, 403, { success: false, error: 'Data source not allowed for this embed session' });
      return;
    }
    if (!dataSourceAllowedByDataAccessRules(lookup.source, scoped.token)) {
      sendJson(res, 403, { success: false, error: 'Data source not allowed for this embed access policy' });
      return;
    }

    const accessFilters = await resolveEmbedDataAccessFilters(scoped.token, lookup.source, lookup.table);
    const scopeFilters = filtersForEmbedTable(scoped.token.dataScope, lookup.source, lookup.table);
    const rows = accessFilters.denyAll
      ? []
      : filterRowsByEmbedScope(rowsForTable(lookup.source.id, lookup.table.name), [...scopeFilters, ...accessFilters.filters]);
    const limit = readDownloadInteger(body.limit, rows.length || 1, 1, 1_000_000);
    const offset = readDownloadInteger(body.offset, 0, 0, rows.length);
    const selectedRows = rows.slice(offset, offset + limit);
    const format = (readOptionalString(body.format) ?? 'csv').toLowerCase();
    const fileBase = sanitizeFileName(readOptionalString(body.componentTitle) ?? body.componentType.trim());
    if (format === 'json') {
      sendDownloadText(res, 200, JSON.stringify(selectedRows, null, 2), {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${fileBase}.json"`
      });
      return;
    }
    if (format !== 'csv' && format !== 'excel') {
      sendJson(res, 400, { success: false, error: 'Invalid format. Supported formats: csv, json, excel' });
      return;
    }

    sendDownloadText(res, 200, toCsv(lookup.table, selectedRows), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileBase}.${format === 'excel' ? 'xlsx' : 'csv'}"`
    });
  }

  private async sendEmbedChartDataExport(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const token = readAuthBearerToken(req.headers.authorization) ?? null;
    const scoped = await this.tokenService.requireScopedToken(req, token);
    if (scoped.ok === false) {
      sendJson(res, scoped.statusCode, { success: false, error: scoped.error });
      return;
    }

    const body = await readJsonBody(req);
    const access = await this.embedDataSourceAccessPolicy(scoped.token, scoped.dataSourceIds);
    await sendChartDataExportForBody(
      bodyWithEmbedParameterValues(isRecord(body) ? body : {}, scoped.token, access.appliedFilters, access.denyAll),
      res,
      access.policy,
      this.ensureDataSourcesLoaded,
      (item, request) => resolveWorkflowExportRequestForPrisma(this.prismaClient, item, request),
      this.apiRuntimeStateOptions()
    );
  }

  private async recordEmbedRenderEvent(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const token = readAuthBearerToken(req.headers.authorization) ?? null;
    const scoped = await this.tokenService.requireScopedToken(req, token);
    if (scoped.ok === false) {
      sendJson(res, scoped.statusCode, { success: false, error: scoped.error });
      return;
    }

    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendJson(res, 400, { success: false, error: 'Render event payload is required' });
      return;
    }
    const event = sanitizeDashboardRenderEvent(body, {
      dashboardId: scoped.token.dashboardId,
      runtime: 'embed'
    });
    console.warn('Dashboard render fallback', event);
    sendJson(res, 202, { success: true });
  }

  private async embedDataSourceAccessPolicy(
    token: EmbedToken,
    dataSourceIds: Set<string>
  ): Promise<{ appliedFilters: EmbedScopeFilter[]; denyAll: boolean; policy: DataSourceAccessPolicy }> {
    await Promise.all([...dataSourceIds].map(dataSourceId =>
      this.ensureDataSourcesLoaded({ dataSourceId }).catch(() => undefined)
    ));
    const allowedTableIds = new Set<string>();
    const appliedFilters: EmbedScopeFilter[] = [];
    let denyAll = false;
    for (const dataSource of dataSources) {
      if (!dataSourceIds.has(dataSource.id)) continue;
      if (!dataSourceAllowedByScope(dataSource, token.dataScope) || !dataSourceAllowedByDataAccessRules(dataSource, token)) {
        continue;
      }
      for (const table of dataSource.tables) {
        const accessFilters = await resolveEmbedDataAccessFilters(token, dataSource, table);
        const scopeFilters = filtersForEmbedTable(token.dataScope, dataSource, table);
        const tableDenyAll = accessFilters.denyAll;
        denyAll = denyAll || tableDenyAll;
        if (!tableDenyAll) appliedFilters.push(...scopeFilters, ...accessFilters.filters);
        const tableKeys = new Set<string>();
        addTableKeys(tableKeys, table.id, dataSource.id, table.name);
        for (const key of tableKeys) {
          allowedTableIds.add(key);
        }
      }
    }
    return {
      appliedFilters,
      denyAll,
      policy: {
        allowedDataSourceIds: dataSourceIds,
        allowedTableIds,
        allowUnscopedAccess: true,
        showSampleDataSources: false,
      }
    };
  }

  private apiRuntimeStateOptions(): ApiRuntimeStateOptions {
    return this.prismaClient
      ? { persistSourceConfig: source => this.persistApiRuntimeSourceConfig(source) }
      : {};
  }

  private async persistApiRuntimeSourceConfig(source: DataSourceRecord): Promise<void> {
    if (!this.prismaClient) return;
    await updateRuntimeDataSource(this.prismaClient, source);
  }
}
