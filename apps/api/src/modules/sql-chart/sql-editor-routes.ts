import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import {
  executeSqlEditorQuery,
  getSqlEditorSchema,
  listSqlEditorSources
} from './sql-editor-service.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import type { DataSourceRecord } from '../data-source/foundation-store.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from '../data-source/prisma-runtime-sync.js';
import {
  SqlOperationTimeoutError,
  withSqlOperationTimeout
} from './sql-operation-timeout.js';

export class SqlEditorRoutes {
  constructor(
    private readonly accessPolicy: (req: IncomingMessage) => Promise<DataSourceAccessPolicy | undefined> = async () => undefined,
    private readonly ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
    private readonly persistSourceConfig?: (source: DataSourceRecord) => Promise<void>
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/sql-editor/data-sources') {
      try {
        await withSqlOperationTimeout(this.ensureDataSourcesLoaded(), 'SQL editor data source catalog load timed out.');
        const access = await this.accessPolicy(req);
        sendOk(res, { dataSources: listSqlEditorSources(access) });
      } catch (error) {
        if (sendTimeout(res, error)) return true;
        throw error;
      }
      return true;
    }

    const schemaMatch = /^\/api\/sql-editor\/schema\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && schemaMatch?.[1]) {
      try {
        await withSqlOperationTimeout(
          this.ensureDataSourcesLoaded({ dataSourceId: decodeURIComponent(schemaMatch[1]).trim() }),
          'SQL editor data source schema load timed out.'
        );
        const access = await this.accessPolicy(req);
        this.sendSchema(res, decodeURIComponent(schemaMatch[1]), access);
      } catch (error) {
        if (sendTimeout(res, error)) return true;
        throw error;
      }
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/sql-editor/execute') {
      const access = await this.accessPolicy(req);
      await this.executeQuery(req, res, access);
      return true;
    }

    return false;
  }

  private sendSchema(res: ServerResponse, dataSourceId: string, access?: DataSourceAccessPolicy): void {
    const result = getSqlEditorSchema(dataSourceId, access);
    if (!result.ok) {
      sendJson(res, result.statusCode, fail(result.error));
      return;
    }
    sendOk(res, result.data);
  }

  private async executeQuery(req: IncomingMessage, res: ServerResponse, access?: DataSourceAccessPolicy): Promise<void> {
    const body = await readJsonBody(req);
    const query = isRecord(body) ? asString(body.query) ?? asString(body.sql) : null;
    if (!isRecord(body) || !isNonEmptyString(body.dataSourceId) || !query) {
      sendBadRequest(res, 'dataSourceId and query are required');
      return;
    }
    try {
      await withSqlOperationTimeout(
        this.ensureDataSourcesLoaded({ dataSourceId: body.dataSourceId.trim() }),
        'SQL editor data source load timed out.'
      );
    } catch (error) {
      if (sendTimeout(res, error)) return;
      throw error;
    }

    const defaultLimit = asPositiveInteger(body.defaultLimit);
    const maxLimit = asPositiveInteger(body.maxLimit);
    let result: Awaited<ReturnType<typeof executeSqlEditorQuery>>;
    try {
      result = await withSqlOperationTimeout(
        executeSqlEditorQuery(body.dataSourceId.trim(), query, {
          ...(defaultLimit ? { defaultLimit } : {}),
          ...(maxLimit ? { maxLimit } : {}),
          parameterValues: readParameterValues(body),
          ...(this.persistSourceConfig ? { persistSourceConfig: this.persistSourceConfig } : {}),
          ...(access ? { policy: access } : {})
        }),
        'SQL editor query timed out.'
      );
    } catch (error) {
      if (sendTimeout(res, error)) return;
      throw error;
    }
    if (!result.ok) {
      sendJson(res, result.statusCode, fail(result.error));
      return;
    }
    sendOk(res, result.data);
  }
}

function sendTimeout(res: ServerResponse, error: unknown): boolean {
  if (!(error instanceof SqlOperationTimeoutError)) return false;
  sendJson(res, 504, fail(error.message));
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

function asPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readParameterValues(body: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(body.parameterValues)) return body.parameterValues;
  if (isRecord(body.parameters)) return body.parameters;
  return {};
}
