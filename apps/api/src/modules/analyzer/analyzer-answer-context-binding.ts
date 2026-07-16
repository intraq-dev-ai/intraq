import type { IncomingMessage } from 'node:http';
import type { ConfirmedAnalyzerBusinessScope } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { getRequestSecurityContext } from '../../security/request-context.js';
import {
  findDataSource,
  type DataSourceRecord,
  type TableDefinition
} from '../data-source/foundation-store.js';
import type { EnsureDataSourcesLoaded } from '../data-source/prisma-runtime-sync.js';
import {
  canReadDataSource,
  canReadDataSourceTable,
  dataSourceAccessPolicy,
  type DataSourceAccessPolicy
} from '../data-source/source-access.js';
import { analyzerBusinessScopeSignature } from './analyzer-business-scope-plan.js';
import { parseConfirmedAnalyzerBusinessScope } from './analyzer-business-scope.js';
import { loadAnalyzerConversationContext } from './analyzer-conversation-context.js';
import { analyzerHistoryAccessForRequest } from './analyzer-history-access.js';
import type { AnalyzerHistoryStore } from './history-foundation-store.js';

export type AnalyzerAnswerContextBinding =
  | {
      body: Record<string, unknown>;
      businessScope: ConfirmedAnalyzerBusinessScope | null;
      dataSourceId: string | null;
      ok: true;
    }
  | { ok: false; reason: 'not_found' | 'unauthorized' };

export interface AnalyzerAnswerContextBindingOptions {
  body: Record<string, unknown>;
  conversationId?: string;
  dataSourceId?: string;
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded;
  historyStore: AnalyzerHistoryStore;
  prismaClient: IntraQPrismaClient | null;
  req: IncomingMessage;
  requireScopedPlanForEvidence?: boolean;
  sourceAuthorizer?: (dataSourceId: string) => Promise<boolean>;
}

export async function bindAnalyzerAnswerContext(
  options: AnalyzerAnswerContextBindingOptions
): Promise<AnalyzerAnswerContextBinding> {
  const access = analyzerHistoryAccessForRequest(options.req);
  if (!access) return { ok: false, reason: 'unauthorized' };

  const conversationId = options.conversationId?.trim();
  const conversationContext = conversationId
    ? await loadAnalyzerConversationContext(options.historyStore, options.req, conversationId)
    : null;
  if (conversationId && (!conversationContext || conversationContext.conversation.isArchived)) {
    return notFound();
  }
  if (conversationContext?.invalidBusinessScope) return notFound();

  const requestedSourceId = options.dataSourceId?.trim() || null;
  const conversationSourceId = conversationContext?.conversation.dataSourceId ?? null;
  if (conversationContext && (!conversationSourceId || (requestedSourceId && requestedSourceId !== conversationSourceId))) {
    return notFound();
  }
  const dataSourceId = requestedSourceId ?? conversationSourceId;
  if (!dataSourceId) {
    if (hasClientEvidence(options.body) || options.body.businessScope !== undefined) return notFound();
    return bound(options.body, null, null, conversationId);
  }

  await options.ensureDataSourcesLoaded({ dataSourceId });
  const source = findDataSource(dataSourceId);
  const accessPolicy = options.sourceAuthorizer
    ? null
    : await dataSourceAccessPolicy(getRequestSecurityContext(options.req), options.prismaClient);
  const sourceReadable = options.sourceAuthorizer
    ? await options.sourceAuthorizer(dataSourceId)
    : Boolean(source && accessPolicy && canReadDataSource(source, accessPolicy));
  if (!sourceReadable) return notFound();

  const businessScope = conversationContext?.businessScope ?? null;
  const referencedModels = source ? resolveReferencedTables(options.body, source, accessPolicy) : [];
  if (referencedModels === null) return notFound();
  if (!clientScopeMatches(options.body.businessScope, businessScope)) return notFound();

  return bound(options.body, dataSourceId, businessScope, conversationId);
}

function resolveReferencedTables(
  body: Record<string, unknown>,
  source: DataSourceRecord,
  policy: DataSourceAccessPolicy | null
): TableDefinition[] | null {
  for (const referencedSourceId of referencedDataSourceIds(body)) {
    if (referencedSourceId !== source.id) return null;
  }
  const resolved = new Map<string, TableDefinition>();
  for (const reference of referencedTables(body)) {
    const byId = reference.id ? source.tables.find(table => table.id === reference.id) : null;
    const byName = reference.name
      ? source.tables.find(table => table.name === reference.name || table.id === reference.name)
      : null;
    if ((reference.id && !byId) || (reference.name && !byName)) return null;
    const table = byId ?? byName;
    if (!table || (byId && byName && byId.id !== byName.id)) return null;
    if (policy && !canReadDataSourceTable(source, table, policy)) return null;
    resolved.set(table.id, table);
  }
  return [...resolved.values()];
}

function referencedDataSourceIds(body: Record<string, unknown>): string[] {
  const values = [readString(body.dataSourceId)];
  for (const execution of executionRecords(body.execution)) values.push(readString(execution.dataSourceId));
  const plan = readRecord(body.plan);
  values.push(readString(readRecord(plan.params).dataSourceId));
  for (const action of readRecordArray(plan.actions)) {
    const params = readRecord(action.params);
    values.push(readString(params.dataSourceId), readString(params._dataSourceId));
  }
  return values.filter((value): value is string => value !== null);
}

function referencedTables(body: Record<string, unknown>): Array<{ id: string | null; name: string | null }> {
  const references: Array<{ id: string | null; name: string | null }> = [];
  const summary = readRecord(body.summary);
  const summaryModel = readRecord(summary.selectedModel);
  pushReferenceGroup(
    references,
    [summaryModel.id, summary.dataSourceTableId],
    [summaryModel.name, summary.tableName]
  );
  for (const execution of executionRecords(body.execution)) {
    pushReferenceGroup(
      references,
      [execution.dataModelId, execution.dataSourceTableId],
      [execution.tableName]
    );
  }
  const plan = readRecord(body.plan);
  const planParams = readRecord(plan.params);
  pushReferenceGroup(
    references,
    [planParams.dataSourceTableId, planParams._dataSourceTableId],
    [planParams.tableName, planParams._tableName]
  );
  const intentDetails = readRecord(plan.intentDetails);
  pushReference(references, readRecord(intentDetails.selectedModel), 'id', 'name');
  for (const model of readRecordArray(intentDetails.selectedModels)) pushReference(references, model, 'id', 'name');
  for (const action of readRecordArray(plan.actions)) {
    const params = readRecord(action.params);
    pushReferenceGroup(
      references,
      [params.dataSourceTableId, params._dataSourceTableId],
      [params.tableName, params._tableName]
    );
  }
  return references;
}

function clientScopeMatches(value: unknown, expected: ConfirmedAnalyzerBusinessScope | null): boolean {
  if (value === undefined) return true;
  const parsed = parseConfirmedAnalyzerBusinessScope(value);
  return Boolean(parsed && expected && analyzerBusinessScopeSignature(parsed) === analyzerBusinessScopeSignature(expected));
}

function bound(
  body: Record<string, unknown>,
  dataSourceId: string | null,
  businessScope: ConfirmedAnalyzerBusinessScope | null,
  conversationId?: string
): AnalyzerAnswerContextBinding {
  const sanitized = { ...body };
  delete sanitized.tenantId;
  delete sanitized.userId;
  delete sanitized.businessScope;
  if (dataSourceId) sanitized.dataSourceId = dataSourceId;
  if (conversationId) sanitized.conversationId = conversationId;
  if (businessScope) sanitized.businessScope = businessScope;
  sanitized.evidencePolicy = {
    browserRowsAndSql: 'not_independently_verified',
    conversationAndSource: conversationId ? 'authenticated_and_bound' : 'authenticated_source_only'
  };
  return { body: sanitized, businessScope, dataSourceId, ok: true };
}

function hasClientEvidence(body: Record<string, unknown>): boolean {
  return hasResultEvidence(body) || isRecord(body.plan) || isRecord(body.summary) || body.sql !== undefined;
}

function hasResultEvidence(body: Record<string, unknown>): boolean {
  return isRecord(body.execution) || isRecord(body.data);
}

function executionRecords(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) return [];
  return [value, ...readRecordArray(value.relatedExecutions)];
}

function pushReference(
  output: Array<{ id: string | null; name: string | null }>,
  record: Record<string, unknown>,
  idKey: string,
  nameKey: string
): void {
  const id = readString(record[idKey]);
  const name = readString(record[nameKey]);
  if (id || name) output.push({ id, name });
}

function pushReferenceGroup(
  output: Array<{ id: string | null; name: string | null }>,
  idValues: unknown[],
  nameValues: unknown[]
): void {
  const ids = [...new Set(idValues.map(readString).filter((value): value is string => value !== null))];
  const names = [...new Set(nameValues.map(readString).filter((value): value is string => value !== null))];
  if (ids.length > 0 && names.length > 0) {
    for (const id of ids) for (const name of names) output.push({ id, name });
    return;
  }
  for (const id of ids) output.push({ id, name: null });
  for (const name of names) output.push({ id: null, name });
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function notFound(): AnalyzerAnswerContextBinding {
  return { ok: false, reason: 'not_found' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
