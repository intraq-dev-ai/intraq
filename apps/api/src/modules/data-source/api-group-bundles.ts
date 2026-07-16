import { uuidv7 } from '@intraq/contracts';
import type {
  ApiEndpointRecord,
  ApiGroupBundlePayload,
  ApiGroupRecord,
  ApiGroupSnapshotPayload
} from './api-group-types.js';

export interface ApiGroupImportContext {
  tenantId?: string | null;
  userId?: string | null;
}

export function buildApiGroupSnapshotPayload(group: ApiGroupRecord): ApiGroupSnapshotPayload {
  return {
    group: {
      id: group.id,
      tenantId: group.tenantId ?? null,
      slug: group.slug,
      name: group.name,
      description: group.description ?? null,
      visibility: group.visibility,
      status: group.status,
      settings: group.settings,
      createdBy: group.createdBy ?? null,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    },
    endpoints: group.endpoints.map(endpoint => ({ ...endpoint, settings: { ...endpoint.settings } }))
  };
}

export function buildApiGroupBundlePayload(group: ApiGroupRecord): ApiGroupBundlePayload {
  return {
    kind: 'api-group-bundle',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...buildApiGroupSnapshotPayload(group)
  };
}

export function readApiGroupBundlePayload(value: unknown): ApiGroupBundlePayload | null {
  if (!isRecord(value)) return null;
  const payload = readApiGroupSnapshotPayload(value);
  if (!payload) return null;
  return {
    kind: 'api-group-bundle',
    version: 1,
    exportedAt: readString(value.exportedAt) ?? new Date().toISOString(),
    ...payload
  };
}

export function readApiGroupSnapshotPayload(value: unknown): ApiGroupSnapshotPayload | null {
  if (!isRecord(value)) return null;
  const groupRecord = readRecord(value.group);
  const id = readString(groupRecord.id);
  const slug = toApiSlug(readString(groupRecord.slug) ?? '');
  const name = readString(groupRecord.name);
  if (!id || !slug || !name) return null;
  const group: ApiGroupSnapshotPayload['group'] = {
    id,
    tenantId: readString(groupRecord.tenantId),
    slug,
    name,
    description: readString(groupRecord.description),
    visibility: groupRecord.visibility === 'public' ? 'public' : 'private',
    status: readString(groupRecord.status) ?? 'draft',
    settings: readRecord(groupRecord.settings),
    createdBy: readString(groupRecord.createdBy),
    createdAt: readString(groupRecord.createdAt) ?? undefined,
    updatedAt: readString(groupRecord.updatedAt) ?? undefined
  };
  const endpoints = Array.isArray(value.endpoints)
    ? value.endpoints.map(apiEndpointFromBundle).filter(endpoint => endpoint.slug && endpoint.name)
    : [];
  return { group, endpoints };
}

export function apiGroupFromImportBundle(
  bundle: ApiGroupBundlePayload,
  body: Record<string, unknown>,
  context: ApiGroupImportContext
): ApiGroupRecord {
  const remap = readRecord(body.remap ?? body.mapping ?? body.idMap);
  const groupId = readString(body.id) ?? uuidv7();
  const groupSlug = toApiSlug(readString(body.slug) ?? bundle.group.slug);
  const group: ApiGroupRecord = {
    id: groupId,
    tenantId: context.tenantId ?? readString(body.tenantId) ?? bundle.group.tenantId ?? null,
    slug: groupSlug,
    name: readString(body.name) ?? bundle.group.name,
    description: 'description' in body ? readString(body.description) : bundle.group.description ?? null,
    visibility: 'visibility' in body ? readApiGroupVisibility(body.visibility) : bundle.group.visibility,
    status: readString(body.status) ?? bundle.group.status,
    settings: { ...bundle.group.settings, ...readRecord(body.settings) },
    createdBy: context.userId ?? readString(body.createdBy) ?? bundle.group.createdBy ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    endpoints: []
  };
  group.endpoints = bundle.endpoints.map(endpoint => remapImportedEndpoint(endpoint, groupId, groupSlug, remap));
  return group;
}

function remapImportedEndpoint(
  endpoint: ApiEndpointRecord,
  groupId: string,
  groupSlug: string,
  remap: Record<string, unknown>
): ApiEndpointRecord {
  return {
    ...endpoint,
    id: uuidv7(),
    groupId,
    dataSourceId: remappedIdentifier(endpoint.dataSourceId, remap, ['dataSourceIds', 'dataSources', 'sources']) ?? null,
    dataSourceTableId: remappedIdentifier(endpoint.dataSourceTableId, remap, ['dataSourceTableIds', 'tables', 'dataModels']) ?? null,
    settings: { ...endpoint.settings, groupSlug },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function apiEndpointFromBundle(row: unknown): ApiEndpointRecord {
  const record = readRecord(row);
  const slug = toApiSlug(readString(record.slug) ?? '');
  return {
    id: readString(record.id) ?? uuidv7(),
    groupId: readString(record.groupId) ?? '',
    slug,
    method: (readString(record.method) ?? 'GET').toUpperCase(),
    name: readString(record.name) ?? 'Untitled endpoint',
    description: readString(record.description),
    status: readString(record.status) ?? 'active',
    executionType: readString(record.executionType) ?? 'data_model',
    dataSourceId: readString(record.dataSourceId),
    dataSourceTableId: readString(record.dataSourceTableId),
    pipelineId: readString(record.pipelineId),
    parameters: Array.isArray(record.parameters) ? record.parameters : [],
    requestSchema: readRecord(record.requestSchema),
    responseSchema: readRecord(record.responseSchema),
    responseContract: readRecord(record.responseContract),
    security: readRecord(record.security),
    settings: readRecord(record.settings),
    createdAt: readString(record.createdAt) ?? undefined,
    updatedAt: readString(record.updatedAt) ?? undefined
  };
}

function remappedIdentifier(value: string | null | undefined, remap: Record<string, unknown>, keys: string[]): string | null | undefined {
  if (!value) return value;
  for (const key of keys) {
    const replacement = readString(readRecord(remap[key])[value]);
    if (replacement) return replacement;
  }
  return value;
}

function readApiGroupVisibility(value: unknown): 'private' | 'public' {
  return readString(value)?.toLowerCase() === 'public' ? 'public' : 'private';
}

function toApiSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
