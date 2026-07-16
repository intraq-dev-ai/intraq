import type { IncomingMessage, ServerResponse } from 'node:http';
import { uuidv7 } from '@intraq/contracts';
import { readCompatRecord, sendCompatBadRequest, sendCompatJson } from './compat-http.js';
import type { FlatFileSource, IntegrationsJobsStore } from './store.js';
import { asString, decodePart, fileExtension, fixedNow, isNonEmptyString, parseCsv, readOffset, readPositiveInteger } from './shared.js';

export class FlatfileCompatRoutes {
  constructor(private readonly store: IntegrationsJobsStore) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/flatfile/test') return this.testR2Connection(res);
    if (req.method === 'POST' && url.pathname === '/api/flatfile/upload') return this.upload(req, res);

    const dataMatch = /^\/api\/flatfile\/data\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && dataMatch?.[1] && dataMatch[2]) {
      return this.getData(res, decodePart(dataMatch[1]), decodePart(dataMatch[2]), url);
    }

    const schemaMatch = /^\/api\/flatfile\/schema\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && schemaMatch?.[1] && schemaMatch[2]) {
      return this.getSchema(res, decodePart(schemaMatch[1]), decodePart(schemaMatch[2]));
    }

    return false;
  }

  private testR2Connection(res: ServerResponse): true {
    sendCompatJson(res, 200, {
      success: true,
      message: 'R2 connection successful',
      endpoint: 'https://foundation.r2.cloudflarestorage.com',
      bucket: 'intraq-flatfiles',
      keyCount: this.store.flatFiles.length
    });
    return true;
  }

  private async upload(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readCompatRecord(req);
    if (!body) {
      sendCompatBadRequest(res, 'Flat file upload body must be a JSON object or multipart form data.');
      return true;
    }
    if (!isNonEmptyString(body.fileName)) {
      sendCompatJson(res, 400, { success: false, error: 'No file uploaded' });
      return true;
    }
    if (!isNonEmptyString(body.name)) {
      sendCompatJson(res, 400, { success: false, error: 'Data source name is required' });
      return true;
    }

    const extension = fileExtension(body.fileName);
    if (!['.csv', '.xlsx', '.xls'].includes(extension)) {
      sendCompatJson(res, 400, { success: false, error: 'Only CSV and Excel files are allowed' });
      return true;
    }

    const source = this.createFlatFileSource(body);
    this.store.flatFiles.unshift(source);
    this.store.cacheSettings.set(source.id, {
      dataSourceId: source.id,
      dataSourceName: source.name,
      cacheEnabled: null,
      cacheTTL: null,
      cacheSettings: null,
      tenantCacheEnabled: true,
      tenantCacheTTL: 600
    });

    const r2Key = `flatfiles/tenant-foundation/${source.id}-${source.fileName}`;
    sendCompatJson(res, 200, {
      success: true,
      message: 'File uploaded to Cloudflare R2 and data source created successfully',
      dataSource: {
        id: source.id,
        name: source.name,
        type: source.type,
        createdAt: source.createdAt
      },
      schema: {
        fields: source.fields,
        fieldCount: source.fields.length
      },
      file: {
        fileName: source.fileName,
        fileSize: readPositiveInteger(body.fileSize, Buffer.byteLength(asString(body.fileContent) ?? asString(body.content) ?? '')),
        bucket: 'intraq-flatfiles',
        r2Key,
        path: `r2://intraq-flatfiles/${r2Key}`,
        tenantPath: 'flatfiles/tenant-foundation/'
      },
      endpoint: 'https://foundation.r2.cloudflarestorage.com'
    });
    return true;
  }

  private getSchema(res: ServerResponse, dataSourceId: string, tableName: string): true {
    const source = this.findSource(dataSourceId, tableName);
    if (!source) {
      sendCompatJson(res, 404, { error: 'Flat file data source or table not found' });
      return true;
    }

    sendCompatJson(res, 200, {
      success: true,
      fields: source.fields,
      tableName: source.tableName,
      dataSourceId: source.id,
      cached: true
    });
    return true;
  }

  private getData(res: ServerResponse, dataSourceId: string, tableName: string, url: URL): true {
    const source = this.findSource(dataSourceId, tableName);
    if (!source) {
      sendCompatJson(res, 404, { error: 'Flat file data source or table not found' });
      return true;
    }

    const limit = readPositiveInteger(url.searchParams.get('limit'), 100);
    const offset = readOffset(url.searchParams.get('offset'));
    const rows = source.rows.slice(offset, offset + limit);
    sendCompatJson(res, 200, {
      success: true,
      data: {
        rows,
        total: source.rows.length,
        filteredTotal: source.rows.length,
        limit,
        offset,
        source: 'flatfile',
        hasData: rows.length > 0,
        filtersApplied: [],
        dashboardFiltersApplied: []
      }
    });
    return true;
  }

  private createFlatFileSource(body: Record<string, unknown>): FlatFileSource {
    const fileName = String(body.fileName).trim();
    const content = asString(body.fileContent) ?? asString(body.content) ?? defaultCsvFor(fileName);
    const parsed = fileExtension(fileName) === '.csv' ? parseCsv(content) : { fields: [], rows: [] };
    const name = String(body.name).trim();
    const id = uuidv7();
    return {
      id,
      name,
      type: 'flatfile',
      tableName: fileName.replace(/\.[^.]+$/, ''),
      fileName,
      fields: parsed.fields,
      rows: parsed.rows,
      createdAt: fixedNow,
      tenantId: 'tenant-foundation'
    };
  }

  private findSource(dataSourceId: string, tableName: string): FlatFileSource | undefined {
    return this.store.flatFiles.find(source => source.id === dataSourceId && source.tableName === tableName);
  }
}

function defaultCsvFor(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '');
  return `name,value\n${stem},1`;
}
