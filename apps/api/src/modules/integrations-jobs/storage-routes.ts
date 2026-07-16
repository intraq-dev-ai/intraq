import type { IncomingMessage, ServerResponse } from 'node:http';
import { uuidv7 } from '@intraq/contracts';
import { readCompatRecord, sendCompatBadRequest, sendCompatJson, sendCompatNotFound } from './compat-http.js';
import type { IntegrationsJobsStore, S3BucketRecord, S3ObjectRecord } from './store.js';
import { asString, fixedNow, isNonEmptyString, readPositiveInteger } from './shared.js';

export class S3StorageCompatRoutes {
  constructor(private readonly store: IntegrationsJobsStore) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/api/s3/')) return false;
    if (req.method !== 'POST') {
      sendCompatJson(res, 405, { success: false, error: 'Method not allowed' });
      return true;
    }

    if (url.pathname === '/api/s3/test-connection') return this.testConnection(req, res);
    if (url.pathname === '/api/s3/list-buckets') return this.listBuckets(req, res);
    if (url.pathname === '/api/s3/list-objects') return this.listObjects(req, res);
    if (url.pathname === '/api/s3/object-info') return this.objectInfo(req, res);
    if (url.pathname === '/api/s3/read-object') return this.readObject(req, res);
    if (url.pathname === '/api/s3/discover-structure') return this.discoverStructure(req, res);
    if (url.pathname === '/api/s3/save-data-source') return this.saveDataSource(req, res);

    return false;
  }

  private async testConnection(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readCompatRecord(req);
    if (!body) {
      sendCompatBadRequest(res, 'S3 connection body must be a JSON object.');
      return true;
    }

    sendCompatJson(res, 200, {
      success: true,
      message: 'S3 connection successful',
      bucketsFound: this.store.s3Buckets.length,
      region: asString(body.region) ?? 'us-east-1',
      credentialsMode: isNonEmptyString(body.accessKeyId) ? 'provided' : 'environment'
    });
    return true;
  }

  private async listBuckets(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readCompatRecord(req);
    if (!body) {
      sendCompatBadRequest(res, 'S3 list buckets body must be a JSON object.');
      return true;
    }

    sendCompatJson(res, 200, {
      success: true,
      buckets: this.store.s3Buckets.map(bucket => ({ name: bucket.name, creationDate: bucket.creationDate }))
    });
    return true;
  }

  private async listObjects(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readCompatRecord(req);
    if (!body || !isNonEmptyString(body.bucket)) {
      sendCompatBadRequest(res, 'bucket is required to list S3 objects.');
      return true;
    }

    const bucket = this.findBucket(body.bucket);
    if (!bucket) return sendStorageNotFound(res, 'S3 bucket not found');
    const prefix = asString(body.prefix) ?? '';
    const maxKeys = readPositiveInteger(body.maxKeys, 1000);
    const objects = bucket.objects
      .filter(object => object.key.startsWith(prefix))
      .slice(0, maxKeys)
      .map(toObjectListItem);

    sendCompatJson(res, 200, {
      success: true,
      bucket: bucket.name,
      prefix,
      objects,
      count: objects.length,
      isTruncated: bucket.objects.length > objects.length
    });
    return true;
  }

  private async objectInfo(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const result = await this.readBucketObject(req, res);
    if (!result) return true;
    const { bucket, object } = result;
    sendCompatJson(res, 200, { success: true, object: toObjectDetails(bucket, object) });
    return true;
  }

  private async readObject(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const result = await this.readBucketObject(req, res);
    if (!result) return true;
    const { bucket, object } = result;

    sendCompatJson(res, 200, {
      success: true,
      object: {
        ...toObjectDetails(bucket, object),
        content: parseObjectContent(object),
        preview: object.contentType.includes('csv') ? csvPreview(object.content) : null
      }
    });
    return true;
  }

  private async discoverStructure(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readCompatRecord(req);
    if (!body || !isNonEmptyString(body.bucket)) {
      sendCompatBadRequest(res, 'bucket is required to discover S3 structure.');
      return true;
    }

    const bucket = this.findBucket(body.bucket);
    if (!bucket) return sendStorageNotFound(res, 'S3 bucket not found');
    const prefix = asString(body.prefix) ?? '';
    const objects = bucket.objects.filter(object => object.key.startsWith(prefix));
    const fileTypes = new Map<string, number>();
    const folders = new Set<string>();
    let totalSize = 0;

    for (const object of objects) {
      const extension = object.key.split('.').pop()?.toLowerCase() ?? 'unknown';
      fileTypes.set(extension, (fileTypes.get(extension) ?? 0) + 1);
      totalSize += object.size;
      collectFolders(object.key, folders);
    }

    sendCompatJson(res, 200, {
      success: true,
      structure: {
        bucket: bucket.name,
        prefix,
        totalObjects: objects.length,
        totalSize,
        fileTypes: Object.fromEntries(fileTypes),
        folders: [...folders],
        samples: objects.slice(0, 3).map(object => ({ key: object.key, size: object.size, contentPreview: object.content.slice(0, 500) }))
      }
    });
    return true;
  }

  private async saveDataSource(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readCompatRecord(req);
    if (!body || !isNonEmptyString(body.name)) {
      sendCompatBadRequest(res, 'Data source name is required');
      return true;
    }
    if (!isNonEmptyString(body.region)) {
      sendCompatBadRequest(res, 'AWS region is required');
      return true;
    }

    const id = uuidv7();
    const bucketNames = Array.isArray(body.buckets) ? body.buckets.map(readBucketName).filter(isNonEmptyString) : [];
    const dataSource = {
      id,
      name: body.name.trim(),
      type: 's3',
      config: {
        region: body.region.trim(),
        buckets: bucketNames,
        description: asString(body.description) ?? ''
      },
      isActive: true,
      createdAt: fixedNow,
      tables: bucketNames.map(name => ({ id: uuidv7(), name, description: `S3 bucket: ${name}` }))
    };
    this.store.cacheSettings.set(id, {
      dataSourceId: id,
      dataSourceName: dataSource.name,
      cacheEnabled: null,
      cacheTTL: null,
      cacheSettings: null,
      tenantCacheEnabled: true,
      tenantCacheTTL: 600
    });

    sendCompatJson(res, 200, {
      success: true,
      message: 'S3 data source saved successfully',
      dataSource
    });
    return true;
  }

  private async readBucketObject(req: IncomingMessage, res: ServerResponse): Promise<{ bucket: S3BucketRecord; object: S3ObjectRecord } | null> {
    const body = await readCompatRecord(req);
    if (!body || !isNonEmptyString(body.bucket) || !isNonEmptyString(body.key)) {
      sendCompatBadRequest(res, 'bucket and key are required.');
      return null;
    }

    const bucket = this.findBucket(body.bucket);
    if (!bucket) {
      sendCompatNotFound(res, 'S3 bucket not found');
      return null;
    }
    const object = bucket.objects.find(candidate => candidate.key === body.key);
    if (!object) {
      sendCompatNotFound(res, 'S3 object not found');
      return null;
    }
    return { bucket, object };
  }

  private findBucket(bucketName: unknown): S3BucketRecord | undefined {
    return this.store.s3Buckets.find(bucket => bucket.name === bucketName);
  }
}

function toObjectListItem(object: S3ObjectRecord): Record<string, unknown> {
  return { key: object.key, size: object.size, lastModified: object.lastModified, etag: object.etag };
}

function toObjectDetails(bucket: S3BucketRecord, object: S3ObjectRecord): Record<string, unknown> {
  return { bucket: bucket.name, key: object.key, size: object.size, contentType: object.contentType, lastModified: object.lastModified, etag: object.etag, metadata: object.metadata };
}

function parseObjectContent(object: S3ObjectRecord): unknown {
  if (!object.contentType.includes('json')) return object.content.slice(0, 5000);
  try {
    return JSON.parse(object.content) as unknown;
  } catch {
    return object.content;
  }
}

function csvPreview(content: string): Record<string, unknown> {
  const lines = content.split(/\r?\n/).filter(Boolean);
  return {
    headers: lines[0]?.split(',') ?? [],
    sampleRows: lines.slice(1, 10).map(line => line.split(','))
  };
}

function collectFolders(key: string, folders: Set<string>): void {
  const parts = key.split('/');
  for (let index = 1; index < parts.length; index += 1) {
    folders.add(parts.slice(0, index).join('/'));
  }
}

function readBucketName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string') return value.name;
  return '';
}

function sendStorageNotFound(res: ServerResponse, message: string): true {
  sendCompatNotFound(res, message);
  return true;
}
