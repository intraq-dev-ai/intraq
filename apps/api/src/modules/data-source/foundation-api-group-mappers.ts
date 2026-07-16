import { uuidv7 } from '@intraq/contracts';
import type { Prisma } from '@intraq/db';
import { readApiGroupSnapshotPayload } from './api-group-bundles.js';
import type {
  ApiClientApiGroupGrantRecord,
  ApiEndpointRecord,
  ApiGroupGrantRecord,
  ApiGroupRecord,
  ApiGroupSnapshotPayload,
  ApiGroupSnapshotRecord
} from './api-group-types.js';
import { isPublicApiWorkflowSource } from './api-workflow-openapi.js';
import {
  inputJson,
  isRecord,
  readJsonStringArray,
  readRecord,
  readString,
  toApiSlug
} from './foundation-route-utils.js';
import {
  dataSources,
  tablePathSlug,
  toLabel,
  type TableDefinition
} from './foundation-store.js';

export function apiGroupFromPrisma(row: {
  clientGrants?: unknown[];
  createdAt?: Date;
  createdBy?: string | null;
  description?: string | null;
  endpoints?: unknown[];
  grants?: unknown[];
  id: string;
  name: string;
  settings: unknown;
  slug: string;
  status: string;
  tenantId?: string | null;
  updatedAt?: Date;
  visibility: string;
}): ApiGroupRecord {
  return {
    id: row.id,
    tenantId: row.tenantId ?? null,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    status: row.status,
    settings: readRecord(row.settings),
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
    endpoints: Array.isArray(row.endpoints) ? row.endpoints.map(apiEndpointFromPrisma) : [],
    grants: Array.isArray(row.grants) ? row.grants.map(apiGroupGrantFromPrisma) : [],
    clientGrants: Array.isArray(row.clientGrants) ? row.clientGrants.map(apiClientApiGroupGrantFromPrisma) : []
  };
}

export function apiEndpointFromPrisma(row: unknown): ApiEndpointRecord {
  const record = readRecord(row);
  return {
    id: readString(record.id) ?? uuidv7(),
    groupId: readString(record.groupId) ?? '',
    slug: toApiSlug(readString(record.slug) ?? ''),
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
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : readString(record.createdAt) ?? undefined,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : readString(record.updatedAt) ?? undefined
  };
}

export function apiGroupGrantFromPrisma(row: unknown): ApiGroupGrantRecord {
  const record = readRecord(row);
  return {
    id: readString(record.id) ?? uuidv7(),
    apiGroupId: readString(record.apiGroupId) ?? '',
    targetType: readString(record.targetType) ?? '',
    targetId: readString(record.targetId),
    permission: readString(record.permission) ?? 'read',
    settings: readRecord(record.settings)
  };
}

export function apiClientApiGroupGrantFromPrisma(row: unknown): ApiClientApiGroupGrantRecord {
  const record = readRecord(row);
  return {
    id: readString(record.id) ?? uuidv7(),
    clientId: readString(record.clientId) ?? '',
    apiGroupId: readString(record.apiGroupId) ?? '',
    scopes: readJsonStringArray(record.scopes)
  };
}

export function apiGroupForResponse(group: ApiGroupRecord): Record<string, unknown> {
  return {
    ...group,
    endpoints: group.endpoints.map(apiEndpointForResponse),
    grants: (group.grants ?? []).map(apiGroupGrantForResponse),
    clientGrants: (group.clientGrants ?? []).map(apiClientApiGroupGrantForResponse)
  };
}

export function apiEndpointForResponse(endpoint: ApiEndpointRecord): Record<string, unknown> {
  return { ...endpoint };
}

export function apiGroupSnapshotForResponse(value: unknown): Record<string, unknown> {
  const snapshot = apiGroupSnapshotFromRecord(value);
  return {
    id: snapshot.id,
    apiGroupId: snapshot.apiGroupId,
    snapshotNumber: snapshot.snapshotNumber,
    name: snapshot.name,
    comment: snapshot.comment ?? null,
    snapshot: snapshot.snapshot,
    createdBy: snapshot.createdBy ?? null,
    createdAt: snapshot.createdAt
  };
}

export function apiGroupSnapshotFromRecord(value: unknown): ApiGroupSnapshotRecord {
  const record = readRecord(value);
  return {
    id: readString(record.id) ?? uuidv7(),
    apiGroupId: readString(record.apiGroupId) ?? '',
    snapshotNumber: Number(record.snapshotNumber) || 1,
    name: readString(record.name) ?? 'Snapshot',
    comment: readString(record.comment),
    snapshot: readApiGroupSnapshotPayload(record.snapshot) ?? {
      group: {
        id: '',
        tenantId: null,
        slug: '',
        name: '',
        description: null,
        visibility: 'private',
        status: 'draft',
        settings: {},
        createdBy: null
      },
      endpoints: []
    },
    createdBy: readString(record.createdBy),
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : readString(record.createdAt) ?? undefined
  };
}

export function apiGroupGrantForResponse(grant: ApiGroupGrantRecord): Record<string, unknown> {
  return { ...grant };
}

export function apiClientApiGroupGrantForResponse(grant: ApiClientApiGroupGrantRecord): Record<string, unknown> {
  return { ...grant };
}

export function endpointNestedCreateInput(endpoint: ApiEndpointRecord): Prisma.ApiEndpointCreateWithoutGroupInput {
  return {
    id: endpoint.id,
    slug: endpoint.slug,
    method: endpoint.method,
    name: endpoint.name,
    description: endpoint.description ?? null,
    status: endpoint.status,
    executionType: endpoint.executionType,
    dataSourceId: endpoint.dataSourceId ?? null,
    dataSourceTableId: endpoint.dataSourceTableId ?? null,
    pipelineId: endpoint.pipelineId ?? null,
    parameters: inputJson(endpoint.parameters),
    requestSchema: inputJson(endpoint.requestSchema),
    responseSchema: inputJson(endpoint.responseSchema),
    responseContract: inputJson(endpoint.responseContract),
    security: inputJson(endpoint.security),
    settings: inputJson(endpoint.settings)
  };
}

export function endpointCreateInput(endpoint: ApiEndpointRecord): Prisma.ApiEndpointCreateInput {
  return {
    ...endpointNestedCreateInput(endpoint),
    group: { connect: { id: endpoint.groupId } }
  };
}

export function endpointFlatCreateInput(endpoint: ApiEndpointRecord): Prisma.ApiEndpointCreateManyInput {
  return {
    id: endpoint.id,
    groupId: endpoint.groupId,
    slug: endpoint.slug,
    method: endpoint.method,
    name: endpoint.name,
    description: endpoint.description ?? null,
    status: endpoint.status,
    executionType: endpoint.executionType,
    dataSourceId: endpoint.dataSourceId ?? null,
    dataSourceTableId: endpoint.dataSourceTableId ?? null,
    pipelineId: endpoint.pipelineId ?? null,
    parameters: inputJson(endpoint.parameters),
    requestSchema: inputJson(endpoint.requestSchema),
    responseSchema: inputJson(endpoint.responseSchema),
    responseContract: inputJson(endpoint.responseContract),
    security: inputJson(endpoint.security),
    settings: inputJson(endpoint.settings)
  };
}

export function apiGroupRestoreInput(group: ApiGroupSnapshotPayload['group']): Prisma.ApiGroupUpdateInput {
  return {
    slug: group.slug,
    name: group.name,
    description: group.description ?? null,
    visibility: group.visibility,
    status: group.status,
    settings: inputJson(group.settings)
  };
}

export function apiGroupUpdateInput(body: Record<string, unknown>): Prisma.ApiGroupUpdateInput {
  const data: Prisma.ApiGroupUpdateInput = {};
  const name = readString(body.name);
  const slug = readString(body.slug);
  const description = readString(body.description);
  const status = readString(body.status);
  if (name) data.name = name;
  if (slug) data.slug = toApiSlug(slug);
  if ('description' in body) data.description = description;
  if (status) data.status = status;
  if ('visibility' in body) data.visibility = readApiGroupVisibility(body.visibility);
  if (isRecord(body.settings)) data.settings = inputJson(body.settings);
  return data;
}

export function applyApiGroupPatch(group: ApiGroupRecord, body: Record<string, unknown>): void {
  const name = readString(body.name);
  const slug = readString(body.slug);
  if (name) group.name = name;
  if (slug) group.slug = toApiSlug(slug);
  if ('description' in body) group.description = readString(body.description);
  if ('visibility' in body) group.visibility = readApiGroupVisibility(body.visibility);
  if (readString(body.status)) group.status = readString(body.status) ?? group.status;
  if (isRecord(body.settings)) group.settings = { ...group.settings, ...body.settings };
  group.updatedAt = new Date().toISOString();
}

export function readApiEndpointInputs(value: unknown, groupId: string, groupSlug: string): ApiEndpointRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const endpoint = readApiEndpointInput(item, groupId, groupSlug);
    return endpoint ? [endpoint] : [];
  });
}

export function readApiEndpointInput(value: unknown, groupId: string, groupSlug: string): ApiEndpointRecord | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name) ?? readString(value.label);
  const slug = toApiSlug(readString(value.slug) ?? readString(value.path) ?? name ?? '');
  if (!slug && !name) return null;
  const settings = readRecord(value.settings);
  return {
    id: readString(value.id) ?? uuidv7(),
    groupId,
    slug: slug || toApiSlug(name ?? 'endpoint'),
    method: (readString(value.method) ?? 'GET').toUpperCase(),
    name: name ?? toLabel(slug),
    description: readString(value.description),
    status: readString(value.status) ?? 'active',
    executionType: readString(value.executionType) ?? readString(value.targetType) ?? 'data_model',
    dataSourceId: readString(value.dataSourceId) ?? readString(readRecord(value.target).dataSourceId),
    dataSourceTableId: readString(value.dataSourceTableId) ?? readString(readRecord(value.target).dataSourceTableId),
    pipelineId: readString(value.pipelineId) ?? readString(readRecord(value.target).pipelineId),
    parameters: Array.isArray(value.parameters) ? value.parameters : [],
    requestSchema: readRecord(value.requestSchema),
    responseSchema: readRecord(value.responseSchema),
    responseContract: readRecord(value.responseContract),
    security: readRecord(value.security),
    settings: {
      ...settings,
      ...(readString(value.tableName) ? { tableName: readString(value.tableName) } : {}),
      groupSlug
    }
  };
}

export function readApiGroupVisibility(value: unknown): 'private' | 'public' {
  return readString(value)?.toLowerCase() === 'public' ? 'public' : 'private';
}

export function apiEndpointMethodMatches(configuredMethod: string, requestMethod: string): boolean {
  const configured = configuredMethod.toUpperCase();
  return configured === requestMethod
    || configured === 'ANY'
    || configured === '*'
    || (configured === 'GET' && requestMethod === 'POST');
}

export function virtualApiGroupsFromDataSources(): ApiGroupRecord[] {
  return dataSources
    .filter(source => source.type.toLowerCase() === 'api')
    .map(source => {
      const groupSettings = readRecord(source.settings.apiGroup ?? source.settings.apiProduct ?? source.settings.apiWorkflowGroup);
      const slug = toApiSlug(readString(groupSettings.slug) ?? readString(source.settings.apiGroupSlug) ?? source.name);
      return {
        id: readString(groupSettings.id) ?? `virtual-${source.id}`,
        tenantId: source.tenantId ?? null,
        slug,
        name: readString(groupSettings.name) ?? source.name,
        description: readString(groupSettings.description) ?? source.description ?? null,
        visibility: isPublicApiWorkflowSource(source) ? 'public' : 'private',
        status: source.status === 'inactive' ? 'inactive' : 'active',
        settings: groupSettings,
        createdBy: source.createdBy ?? null,
        endpoints: source.tables.filter(table => table.isSelected !== false).map(table => ({
          id: `virtual-${table.id}`,
          groupId: readString(groupSettings.id) ?? `virtual-${source.id}`,
          slug: tablePathSlug(table),
          method: 'GET',
          name: tableDisplayNameForEndpoint(table),
          description: table.description,
          status: 'active',
          executionType: 'data_model',
          dataSourceId: source.id,
          dataSourceTableId: table.id,
          pipelineId: null,
          parameters: [],
          requestSchema: {},
          responseSchema: {},
          responseContract: {},
          security: {},
          settings: { tableName: table.name, groupSlug: slug }
        }))
      };
    });
}

function tableDisplayNameForEndpoint(table: TableDefinition): string {
  const businessName = readString(table.dictionary.businessName);
  return businessName ?? toLabel(table.name);
}
