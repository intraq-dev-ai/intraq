import { randomUUID } from 'node:crypto';
import type { IntraQPrismaClient } from '@intraq/db';
import {
  analyzerUnmappedConceptEventListLimit,
  type AnalyzerUnmappedConceptEvent,
  type AnalyzerUnmappedConceptEventListFilters
} from './analyzer-unmapped-concept-log.js';

interface AnalyzerUnmappedConceptRow {
  conversation_id: string | null;
  coverage_ratio: number | null;
  created_at: Date | string;
  data_source_id: string;
  invalid_fields: unknown;
  meaningful_tokens: unknown;
  metadata: unknown;
  question: string;
  reason: string;
  table_id: string | null;
  table_name: string | null;
  tenant_id: string | null;
  unsupported_concepts: unknown;
  user_id: string | null;
}

export async function persistAnalyzerUnmappedConceptEvent(
  client: IntraQPrismaClient,
  event: AnalyzerUnmappedConceptEvent
): Promise<void> {
  await client.$executeRawUnsafe(
    [
      'insert into "ai_analyzer_unmapped_concept_events"',
      '("id", "tenant_id", "user_id", "conversation_id", "data_source_id", "table_id", "table_name", "question", "reason",',
      '"unsupported_concepts", "invalid_fields", "meaningful_tokens", "coverage_ratio", "metadata", "created_at")',
      'values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb, $15)'
    ].join(' '),
    randomUUID(),
    event.tenantId ?? null,
    event.userId ?? null,
    event.conversationId ?? null,
    event.dataSourceId,
    event.tableId ?? null,
    event.tableName ?? null,
    event.question,
    event.reason,
    JSON.stringify(event.unsupportedConcepts ?? []),
    event.invalidFields ? JSON.stringify(event.invalidFields) : null,
    event.meaningfulTokens ? JSON.stringify(event.meaningfulTokens) : null,
    typeof event.coverageRatio === 'number' ? event.coverageRatio : null,
    JSON.stringify(event.metadata ?? {}),
    validDate(event.at)
  );
}

export async function listPersistedAnalyzerUnmappedConceptEvents(
  client: IntraQPrismaClient,
  filtersOrLimit: AnalyzerUnmappedConceptEventListFilters | number = {}
): Promise<AnalyzerUnmappedConceptEvent[]> {
  const filters = typeof filtersOrLimit === 'number' ? { limit: filtersOrLimit } : filtersOrLimit;
  const safeLimit = analyzerUnmappedConceptEventListLimit(filters.limit);
  const clauses: string[] = [];
  const values: unknown[] = [];
  addClause(clauses, values, filters.tenantId, '"tenant_id" =');
  addClause(clauses, values, filters.dataSourceId, '"data_source_id" =');
  const where = clauses.length > 0 ? `where ${clauses.join(' and ')}` : '';
  const rows = await client.$queryRawUnsafe<AnalyzerUnmappedConceptRow[]>(
    [
      'select "tenant_id", "user_id", "conversation_id", "data_source_id", "table_id", "table_name", "question", "reason",',
      '"unsupported_concepts", "invalid_fields", "meaningful_tokens", "coverage_ratio", "metadata", "created_at"',
      'from "ai_analyzer_unmapped_concept_events"',
      where,
      'order by "created_at" desc',
      `limit ${safeLimit}`
    ].filter(Boolean).join(' '),
    ...values
  );
  return rows.map(rowToEvent);
}

function addClause(clauses: string[], values: unknown[], value: string | undefined, prefix: string): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  values.push(trimmed);
  clauses.push(`${prefix} $${values.length}`);
}

function rowToEvent(row: AnalyzerUnmappedConceptRow): AnalyzerUnmappedConceptEvent {
  return {
    at: dateToIso(row.created_at),
    dataSourceId: row.data_source_id,
    question: row.question,
    reason: row.reason,
    unsupportedConcepts: readStringArray(row.unsupported_concepts),
    ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
    ...(typeof row.coverage_ratio === 'number' ? { coverageRatio: row.coverage_ratio } : {}),
    ...(readStringArray(row.invalid_fields).length > 0 ? { invalidFields: readStringArray(row.invalid_fields) } : {}),
    ...(readStringArray(row.meaningful_tokens).length > 0 ? { meaningfulTokens: readStringArray(row.meaningful_tokens) } : {}),
    ...(isRecord(row.metadata) && Object.keys(row.metadata).length > 0 ? { metadata: row.metadata } : {}),
    ...(row.table_id ? { tableId: row.table_id } : {}),
    ...(row.table_name ? { tableName: row.table_name } : {}),
    ...(row.tenant_id ? { tenantId: row.tenant_id } : {}),
    ...(row.user_id ? { userId: row.user_id } : {})
  };
}

function validDate(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateToIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function readStringArray(value: unknown): string[] {
  const parsed = typeof value === 'string' ? parseJson(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
