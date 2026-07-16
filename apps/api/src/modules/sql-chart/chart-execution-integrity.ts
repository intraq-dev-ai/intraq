import { createHash } from 'node:crypto';
import type { ParsedChartRequest } from './foundation-route-types.js';

export interface ChartExecutionIntegrity {
  algorithm: 'sha256';
  executionSql: {
    fingerprint: string;
    provenance: 'loader-reported-sql';
  };
  modelFingerprint: string;
  queryFingerprint: string;
  resultFingerprint: string;
}

export function buildChartExecutionIntegrity(input: {
  chartData: Record<string, unknown>;
  parsed: ParsedChartRequest;
  sqlQuery: string;
}): ChartExecutionIntegrity {
  const sqlFingerprint = sha256IntegrityFingerprint(input.sqlQuery);
  return {
    algorithm: 'sha256',
    executionSql: {
      fingerprint: sqlFingerprint,
      // `sqlQuery` can describe an executed query or a generated fallback,
      // depending on the row-loader path. Keep the public provenance honest.
      provenance: 'loader-reported-sql'
    },
    modelFingerprint: sha256IntegrityFingerprint(modelPayload(input.parsed)),
    queryFingerprint: sha256IntegrityFingerprint({
      request: queryPayload(input.parsed),
      sqlQuery: input.sqlQuery
    }),
    resultFingerprint: sha256IntegrityFingerprint(resultPayload(input.chartData))
  };
}

function resultPayload(chartData: Record<string, unknown>): Record<string, unknown> {
  const {
    executionTime: _executionTime,
    sqlQuery: _sqlQuery,
    ...result
  } = chartData;
  return result;
}

export function sha256IntegrityFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function queryPayload(parsed: ParsedChartRequest): Record<string, unknown> {
  return {
    access: {
      allowUnscopedAccess: parsed.access.allowUnscopedAccess,
      allowedDataSourceIds: sortedSetValues(parsed.access.allowedDataSourceIds),
      allowedTableIds: sortedSetValues(parsed.access.allowedTableIds),
      scope: parsed.access.scope ?? null,
      showSampleDataSources: parsed.access.showSampleDataSources
    },
    chartConfig: parsed.chartConfig,
    componentConfig: parsed.componentConfig,
    dataSourceId: parsed.dataSourceId,
    editMode: parsed.editMode,
    generatedXAxisBucket: parsed.generatedXAxisBucket,
    parameterValues: parsed.parameterValues,
    tableName: parsed.tableName
  };
}

function modelPayload(parsed: ParsedChartRequest): Record<string, unknown> {
  return {
    source: {
      id: parsed.source.id,
      type: parsed.source.type
    },
    table: {
      columns: parsed.table.columns,
      description: parsed.table.description,
      guidance: parsed.table.guidance,
      hasSqlQuery: parsed.table.hasSqlQuery,
      id: parsed.table.id ?? null,
      isDataModel: parsed.table.isDataModel,
      name: parsed.table.name,
      settings: parsed.table.settings ?? {},
      sqlQuery: parsed.table.sqlQuery ?? null,
      targetType: parsed.table.targetType
    }
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function sortedSetValues(values: ReadonlySet<string> | undefined): string[] {
  return values ? [...values].sort((left, right) => left.localeCompare(right)) : [];
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : canonicalValue(item));
  if (value instanceof Date) return value.toJSON();
  if (!isRecord(value)) return canonicalPrimitive(value);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .flatMap(key => value[key] === undefined ? [] : [[key, canonicalValue(value[key])]])
  );
}

function canonicalPrimitive(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
