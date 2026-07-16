import { uuidv7 } from '@intraq/contracts';
import type {
  AnalyzerExecutionContract,
  AnalyzerExecutionIntegrity,
  AnalyzerTableData
} from './types';

export function buildAnalyzerExecutionContract(input: {
  conversationId: string;
  request: Record<string, unknown>;
  runId: string;
  tableData: AnalyzerTableData;
}): AnalyzerExecutionContract {
  const request = cloneJsonRecord(input.request);
  const resultSnapshot = {
    columns: input.tableData.columns,
    rows: input.tableData.rows,
    totalRows: input.tableData.totalRows
  };
  return {
    schemaVersion: 1,
    executionId: uuidv7(),
    executedAt: new Date().toISOString(),
    evidenceLevel: input.tableData.integrity ? 'server_attested' : 'query_executed',
    origin: {
      conversationId: input.conversationId,
      runId: input.runId
    },
    request,
    requestFingerprint: input.tableData.integrity?.queryHash ?? fingerprintCanonicalValue(request),
    resultFingerprint: input.tableData.integrity?.resultHash ?? fingerprintCanonicalValue(resultSnapshot),
    ...(input.tableData.integrity ? { integrity: input.tableData.integrity } : {})
  };
}

export function readAnalyzerExecutionContract(value: unknown): AnalyzerExecutionContract | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1) return undefined;
  const executionId = readString(value.executionId);
  const executedAt = readString(value.executedAt);
  const evidenceLevel = value.evidenceLevel === 'server_attested' ? 'server_attested' : value.evidenceLevel === 'query_executed' ? 'query_executed' : null;
  const origin = isRecord(value.origin) ? value.origin : null;
  const conversationId = readString(origin?.conversationId);
  const runId = readString(origin?.runId);
  const request = isRecord(value.request) ? cloneJsonRecord(value.request) : null;
  const requestFingerprint = readString(value.requestFingerprint);
  const resultFingerprint = readString(value.resultFingerprint);
  if (!executionId || !executedAt || !evidenceLevel || !conversationId || !runId || !request || !requestFingerprint || !resultFingerprint) {
    return undefined;
  }
  const integrity = readAnalyzerExecutionIntegrity(value.integrity);
  if (evidenceLevel === 'server_attested' && !integrity) return undefined;
  return {
    schemaVersion: 1,
    executionId,
    executedAt,
    evidenceLevel,
    origin: { conversationId, runId },
    request,
    requestFingerprint,
    resultFingerprint,
    ...(integrity ? { integrity } : {})
  };
}

export function readAnalyzerExecutionIntegrity(value: unknown): AnalyzerExecutionIntegrity | undefined {
  if (!isRecord(value) || value.algorithm !== 'sha256') return undefined;
  const queryHash = readSha256(value.queryHash ?? value.queryFingerprint);
  const resultHash = readSha256(value.resultHash ?? value.resultFingerprint);
  const modelHash = readSha256(value.modelHash ?? value.modelFingerprint);
  if (!queryHash || !resultHash) return undefined;
  const sql = isRecord(value.executionSql) ? value.executionSql : null;
  const sqlFingerprint = readSha256(sql?.fingerprint);
  const executionSql = sqlFingerprint && sql?.provenance === 'loader-reported-sql'
    ? { fingerprint: sqlFingerprint, provenance: 'loader-reported-sql' as const }
    : undefined;
  return {
    algorithm: 'sha256',
    queryHash,
    resultHash,
    ...(executionSql ? { executionSql } : {}),
    ...(modelHash ? { modelHash } : {})
  };
}

export function fingerprintCanonicalValue(value: unknown): string {
  const serialized = canonicalJson(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `fnv1a64:${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function readSha256(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) return undefined;
  const normalized = text.toLowerCase();
  if (/^sha256:[a-f0-9]{64}$/.test(normalized)) return normalized;
  return /^[a-f0-9]{64}$/.test(normalized) ? `sha256:${normalized}` : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
