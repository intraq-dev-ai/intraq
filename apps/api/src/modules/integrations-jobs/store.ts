import { fixedNow, parseCsv } from './shared.js';

export interface DatabricksJob {
  id: string;
  jobId: string;
  job_id: number;
  pipelineId: string;
  pipelineName: string;
  jobUrl: string;
  settings: Record<string, unknown>;
  created_time: number;
  updatedAt: string;
  lastRunId: string | null;
}

export interface S3ObjectRecord {
  key: string;
  size: number;
  contentType: string;
  content: string;
  lastModified: string;
  etag: string;
  metadata: Record<string, string>;
}

export interface S3BucketRecord {
  name: string;
  creationDate: string;
  objects: S3ObjectRecord[];
}

export interface FlatFileSource {
  id: string;
  name: string;
  type: 'flatfile';
  tableName: string;
  fileName: string;
  fields: Array<{ name: string; type: string; description: string }>;
  rows: Array<Record<string, string>>;
  createdAt: string;
  tenantId: string | null;
}

export interface CacheSettings {
  dataSourceId: string;
  dataSourceName: string;
  cacheEnabled: boolean | null;
  cacheTTL: number | null;
  cacheSettings: Record<string, unknown> | null;
  tenantCacheEnabled: boolean;
  tenantCacheTTL: number;
}

export interface PdfRecord {
  fileName: string;
  dashboardId: string;
  fileSize: number;
  createdAt: string;
  options: Record<string, unknown>;
}

export interface TenantCacheSettings {
  tenantId: string;
  tenantName: string;
  cacheEnabled: boolean | null;
  cacheTTL: number | null;
}

const systemEventsCsv = [
  'event_date,event_type,event_count',
  '2026-05-01,loaded,12',
  '2026-05-01,validated,11'
].join('\n');

const qualityCsv = [
  'check_name,status,record_count',
  'schema_validation,passed,120',
  'null_scan,warning,3'
].join('\n');

export class IntegrationsJobsStore {
  databricksJobs: DatabricksJob[] = [buildInitialDatabricksJob()];
  nextDatabricksJobId = 8402;
  nextDatabricksRunId = 1;

  s3Buckets: S3BucketRecord[] = [{
    name: 'intraq-foundation',
    creationDate: fixedNow,
    objects: [
      buildS3Object('imports/system_events.csv', systemEventsCsv, 'text/csv'),
      buildS3Object('exports/pipeline-summary.json', '{"pipelineId":"pipeline-foundation","status":"ready"}', 'application/json')
    ]
  }, {
    name: 'intraq-archive',
    creationDate: fixedNow,
    objects: [buildS3Object('archive/data_quality.csv', qualityCsv, 'text/csv')]
  }];

  flatFiles: FlatFileSource[] = [buildFlatFileSource('source-flatfile-foundation', 'Data Quality Flatfile', 'data_quality.csv', qualityCsv)];
  nextFlatFileId = 1;

  cacheEntries = new Map<string, { sizeBytes: number; createdAt: string }>([
    ['source-flatfile-foundation:data_quality:data', { sizeBytes: 1024, createdAt: fixedNow }]
  ]);

  cacheSettings = new Map<string, CacheSettings>([
    ['source-flatfile-foundation', {
      dataSourceId: 'source-flatfile-foundation',
      dataSourceName: 'Data Quality Flatfile',
      cacheEnabled: null,
      cacheTTL: null,
      cacheSettings: null,
      tenantCacheEnabled: true,
      tenantCacheTTL: 600
    }]
  ]);

  tenantCacheSettings = new Map<string, TenantCacheSettings>([
    ['tenant-foundation', {
      tenantId: 'tenant-foundation',
      tenantName: 'Foundation Tenant',
      cacheEnabled: true,
      cacheTTL: 600
    }]
  ]);

  pdfs = new Map<string, PdfRecord>();
  nextPdfId = 1;
}

function buildInitialDatabricksJob(): DatabricksJob {
  return {
    id: 'databricks-job-foundation',
    jobId: '8401',
    job_id: 8401,
    pipelineId: 'pipeline-foundation',
    pipelineName: 'Foundation Data Pipeline',
    jobUrl: 'https://databricks.example.local/#job/8401',
    settings: {
      name: 'intraQ Foundation Data Pipeline',
      max_concurrent_runs: 1,
      timeout_seconds: 3600,
      tags: { Project: 'intraq', PipelineId: 'pipeline-foundation' },
      new_cluster: { custom_tags: { Project: 'intraq' } }
    },
    created_time: 1_777_680_000_000,
    updatedAt: fixedNow,
    lastRunId: null
  };
}

function buildS3Object(key: string, content: string, contentType: string): S3ObjectRecord {
  return {
    key,
    size: Buffer.byteLength(content),
    contentType,
    content,
    lastModified: fixedNow,
    etag: `"${Buffer.byteLength(content).toString(16)}"`,
    metadata: { source: 'foundation' }
  };
}

function buildFlatFileSource(id: string, name: string, fileName: string, content: string): FlatFileSource {
  const parsed = parseCsv(content);
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
