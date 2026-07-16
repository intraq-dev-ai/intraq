import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import {
  findDataSource,
  type DataSourceRecord
} from './foundation-store.js';
import {
  replaceRuntimeDataSourceTables,
  updateRuntimeDataSource
} from './prisma-runtime-persistence.js';
import { readDataSourceTableRows } from './source-table-rows.js';
import {
  canWriteDataSource,
  scopedDataSourceForRead,
  type DataSourceAccessPolicy
} from './source-access.js';
import {
  buildApiTable,
  buildSqlModelTable,
  isApiTableRequest,
  replaceSampleRowsForTable
} from './data-source-table-models.js';
import {
  isNonEmptyString,
  isRecord
} from './data-source-table-common.js';
import {
  parameterTargetAliases,
  readTableDataRequestOptions
} from './data-source-table-request-options.js';
import {
  readDataSourceFieldOptions
} from './data-source-field-options.js';

export {
  readDataSourceFieldOptions
} from './data-source-field-options.js';
export type {
  DataSourceFieldOptionItem,
  DataSourceFieldOptionsResult
} from './data-source-field-options.js';

export async function handleSourceTables(
  req: IncomingMessage,
  res: ServerResponse,
  dataSourceId: string,
  prismaClient: IntraQPrismaClient | null,
  access?: DataSourceAccessPolicy
): Promise<void> {
  const source = findDataSource(dataSourceId);
  const scopedSource = source && access ? scopedDataSourceForRead(source, access) : source;
  if (!source || !scopedSource) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  if (req.method === 'POST') {
    if (access && !canWriteDataSource(source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'Table model body must be a JSON object');
      return;
    }
    const model = source.type === 'api' && isApiTableRequest(body)
      ? buildApiTable(body, source.tables)
      : buildSqlModelTable(body, source.tables);
    if (!model) {
      sendBadRequest(res, source.type === 'api'
        ? 'tableName and API request configuration are required for API endpoint targets'
        : 'name and query are required for saved SQL data models');
      return;
    }
    const existingIndex = source.tables.findIndex(table => table.id === model.id || table.name === model.name);
    if (existingIndex >= 0) {
      source.tables[existingIndex] = { ...source.tables[existingIndex], ...model };
    } else {
      source.tables.push(model);
    }
    if (prismaClient) {
      await replaceRuntimeDataSourceTables(prismaClient, source);
      await replaceSampleRowsForTable(prismaClient, model);
    }
    sendOk(res, { dataSourceId: source.id, table: model });
    return;
  }
  if (req.method === 'PUT') {
    if (access && !canWriteDataSource(source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    const body = await readJsonBody(req);
    if (!isRecord(body) || !Array.isArray(body.selectedTables)) {
      sendBadRequest(res, 'selectedTables array is required');
      return;
    }
    const selected = new Set(body.selectedTables.filter(isNonEmptyString).map(value => value.trim()));
    for (const table of source.tables) {
      if (!table.isSelected) continue;
      table.settings = { ...table.settings, isDataModel: selected.has(table.name) || selected.has(table.id) };
    }
    if (prismaClient) await replaceRuntimeDataSourceTables(prismaClient, source);
  }
  sendOk(res, {
    dataSourceId: source.id,
    dataSourceName: source.name,
    dataSourceType: source.type,
    selectedTables: scopedSource.tables
  });
}

export async function sendTableData(
  req: IncomingMessage,
  res: ServerResponse,
  dataSourceId: string,
  tableName: string,
  prismaClient: IntraQPrismaClient | null = null,
  access?: DataSourceAccessPolicy
): Promise<void> {
  const options = await readTableDataRequestOptions(req, dataSourceId, tableName, parameterTargetAliases(dataSourceId, tableName));
  const result = await readDataSourceTableRows(dataSourceId, tableName, {
    ...options,
    ...apiRuntimePersistence(prismaClient),
    ...(access ? { access } : {})
  });
  if (!result.ok) {
    sendJson(res, result.statusCode, fail(result.error));
    return;
  }
  sendOk(res, {
    columns: result.data.columns,
    rows: result.data.rows,
    totalRows: result.data.rowCount,
    page: result.data.pagination?.page ?? 1,
    pageSize: result.data.pagination?.pageSize ?? result.data.rowCount,
    offset: result.data.pagination?.offset ?? 0,
    hasMore: result.data.pagination?.hasMore ?? false,
    ...(result.data.pagination?.totalRows !== undefined ? { totalAvailableRows: result.data.pagination.totalRows } : {})
  });
}

export async function sendFieldValues(
  req: IncomingMessage,
  res: ServerResponse,
  dataSourceId: string,
  prismaClient: IntraQPrismaClient | null = null,
  access?: DataSourceAccessPolicy
): Promise<void> {
  const body = await readJsonBody(req);
  const result = await readDataSourceFieldOptions(dataSourceId, body, prismaClient, access);
  if (!result.ok) {
    if (result.statusCode === 400) sendBadRequest(res, result.error);
    else sendJson(res, result.statusCode, fail(result.error));
    return;
  }
  sendOk(res, { values: result.data.values, options: result.data.options, total: result.data.total });
}

export async function sendFilterOptions(
  req: IncomingMessage,
  res: ServerResponse,
  dataSourceId: string,
  prismaClient: IntraQPrismaClient | null = null,
  access?: DataSourceAccessPolicy
): Promise<void> {
  const body = await readJsonBody(req);
  const result = await readDataSourceFieldOptions(dataSourceId, body, prismaClient, access);
  if (!result.ok) {
    if (result.statusCode === 400) sendBadRequest(res, result.error);
    else sendJson(res, result.statusCode, fail(result.error));
    return;
  }
  sendOk(res, result.data);
}

function apiRuntimePersistence(
  prismaClient: IntraQPrismaClient | null
): { persistSourceConfig?: (source: DataSourceRecord) => Promise<void> } {
  return prismaClient
    ? { persistSourceConfig: source => updateRuntimeDataSource(prismaClient, source) }
    : {};
}
