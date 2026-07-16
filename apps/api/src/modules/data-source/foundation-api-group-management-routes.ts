import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, uuidv7 } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendCreated, sendJson, sendOk } from '../../http.js';
import {
  apiGroupFromImportBundle,
  buildApiGroupBundlePayload,
  readApiGroupBundlePayload
} from './api-group-bundles.js';
import type {
  ApiClientApiGroupGrantRecord,
  ApiGroupGrantRecord,
  ApiGroupRecord
} from './api-group-types.js';
import { validateApiGroupDefinition } from './api-group-validation.js';
import { findApiGroup } from './foundation-api-group-core.js';
import {
  apiClientApiGroupGrantForResponse,
  apiClientApiGroupGrantFromPrisma,
  apiEndpointForResponse,
  apiEndpointFromPrisma,
  apiGroupForResponse,
  apiGroupFromPrisma,
  apiGroupGrantForResponse,
  apiGroupGrantFromPrisma,
  apiGroupRestoreInput,
  apiGroupUpdateInput,
  applyApiGroupPatch,
  endpointCreateInput,
  endpointFlatCreateInput,
  endpointNestedCreateInput,
  readApiEndpointInput,
  readApiEndpointInputs,
  readApiGroupVisibility
} from './foundation-api-group-mappers.js';
import {
  apiGroups,
  canWriteApiGroup
} from './foundation-api-group-state.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import {
  inputJson,
  isRecord,
  readJsonStringArray,
  readRecord,
  readString,
  toApiSlug
} from './foundation-route-utils.js';
import {
  canCreateDataSource,
  type DataSourceAccessPolicy
} from './source-access.js';

export async function createApiGroup(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  access: DataSourceAccessPolicy
): Promise<void> {
  if (!canCreateDataSource(access)) {
    sendJson(res, 403, fail('Tenant context is required to create an API group'));
    return;
  }
  const body = await readJsonBody(req);
  if (!isRecord(body)) {
    sendBadRequest(res, 'API group request body must be an object');
    return;
  }
  const name = readString(body.name);
  const slug = toApiSlug(readString(body.slug) ?? name ?? '');
  if (!name || !slug) {
    sendBadRequest(res, 'name is required');
    return;
  }
  const now = new Date().toISOString();
  const group: ApiGroupRecord = {
    id: readString(body.id) ?? uuidv7(),
    tenantId: access.scope?.tenantId ?? readString(body.tenantId),
    slug,
    name,
    description: readString(body.description),
    visibility: readApiGroupVisibility(body.visibility),
    status: readString(body.status) ?? 'draft',
    settings: readRecord(body.settings),
    createdBy: access.scope?.userId ?? readString(body.createdBy),
    createdAt: now,
    updatedAt: now,
    endpoints: readApiEndpointInputs(body.endpoints, '', slug)
  };
  group.endpoints = group.endpoints.map(endpoint => ({ ...endpoint, groupId: group.id }));

  if (context.prismaClient) {
    const created = await context.prismaClient.apiGroup.create({
      data: {
        id: group.id,
        tenantId: group.tenantId ?? null,
        slug: group.slug,
        name: group.name,
        description: group.description ?? null,
        visibility: group.visibility,
        status: group.status,
        settings: inputJson(group.settings),
        createdBy: group.createdBy ?? null,
        endpoints: {
          create: group.endpoints.map(endpointNestedCreateInput)
        }
      },
      include: {
        clientGrants: true,
        endpoints: { orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] },
        grants: true
      }
    });
    sendCreated(res, { group: apiGroupForResponse(apiGroupFromPrisma(created)) });
    return;
  }

  apiGroups.push(group);
  sendCreated(res, { group: apiGroupForResponse(group) });
}

export async function createApiEndpoint(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  groupIdOrSlug: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const group = await findApiGroup(context, groupIdOrSlug, access);
  if (!group) {
    sendJson(res, 404, fail('API group not found'));
    return;
  }
  if (!canWriteApiGroup(group, access)) {
    sendJson(res, 403, fail('API group access is denied'));
    return;
  }
  const body = await readJsonBody(req);
  if (!isRecord(body)) {
    sendBadRequest(res, 'API endpoint request body must be an object');
    return;
  }
  const endpoint = readApiEndpointInput(body, group.id, group.slug);
  if (!endpoint) {
    sendBadRequest(res, 'Endpoint name or slug is required');
    return;
  }
  if (context.prismaClient) {
    const created = await context.prismaClient.apiEndpoint.create({
      data: endpointCreateInput(endpoint)
    });
    sendCreated(res, { endpoint: apiEndpointForResponse(apiEndpointFromPrisma(created)) });
    return;
  }
  group.endpoints.push(endpoint);
  sendCreated(res, { endpoint: apiEndpointForResponse(endpoint) });
}

export async function exportApiGroup(
  context: DataSourceFoundationRouteContext,
  res: ServerResponse,
  groupIdOrSlug: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const group = await findApiGroup(context, groupIdOrSlug, access);
  if (!group) {
    sendJson(res, 404, fail('API group not found'));
    return;
  }
  if (!canWriteApiGroup(group, access)) {
    sendJson(res, 403, fail('API group access is denied'));
    return;
  }
  sendOk(res, { bundle: buildApiGroupBundlePayload(group) });
}

export async function importApiGroup(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  access: DataSourceAccessPolicy
): Promise<void> {
  if (!canCreateDataSource(access)) {
    sendJson(res, 403, fail('Tenant context is required to import an API group'));
    return;
  }
  const body = await readJsonBody(req);
  if (!isRecord(body)) {
    sendBadRequest(res, 'API group import body must be an object');
    return;
  }
  const bundle = readApiGroupBundlePayload(body.bundle ?? body);
  if (!bundle) {
    sendBadRequest(res, 'API group bundle is invalid');
    return;
  }
  const overwrite = body.overwrite === true || readString(body.mode)?.toLowerCase() === 'overwrite';
  const group = apiGroupFromImportBundle(bundle, body, {
    tenantId: access.scope?.tenantId ?? null,
    userId: access.scope?.userId ?? null
  });
  const existing = await findApiGroup(context, group.slug, access);
  if (existing && !overwrite) {
    sendJson(res, 409, fail('API group slug already exists'));
    return;
  }
  if (existing && !canWriteApiGroup(existing, access)) {
    sendJson(res, 403, fail('API group access is denied'));
    return;
  }

  if (context.prismaClient) {
    const saved = existing
      ? await context.prismaClient.$transaction(async tx => {
        await tx.apiEndpoint.deleteMany({ where: { groupId: existing.id } });
        await tx.apiGroup.update({
          where: { id: existing.id },
          data: apiGroupRestoreInput({
            ...group,
            id: existing.id,
            createdBy: existing.createdBy ?? group.createdBy ?? null
          })
        });
        if (group.endpoints.length > 0) {
          await tx.apiEndpoint.createMany({
            data: group.endpoints.map(endpoint => endpointFlatCreateInput({
              ...endpoint,
              groupId: existing.id
            }))
          });
        }
        return tx.apiGroup.findUnique({
          where: { id: existing.id },
          include: {
            clientGrants: true,
            endpoints: { orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] },
            grants: true
          }
        });
      })
      : await context.prismaClient.apiGroup.create({
        data: {
          id: group.id,
          tenantId: group.tenantId ?? null,
          slug: group.slug,
          name: group.name,
          description: group.description ?? null,
          visibility: group.visibility,
          status: group.status,
          settings: inputJson(group.settings),
          createdBy: group.createdBy ?? null,
          endpoints: {
            create: group.endpoints.map(endpointNestedCreateInput)
          }
        },
        include: {
          clientGrants: true,
          endpoints: { orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] },
          grants: true
        }
      });
    sendCreated(res, {
      imported: true,
      overwritten: Boolean(existing),
      group: saved ? apiGroupForResponse(apiGroupFromPrisma(saved)) : null
    });
    return;
  }

  if (existing) {
    existing.slug = group.slug;
    existing.name = group.name;
    existing.description = group.description ?? null;
    existing.visibility = group.visibility;
    existing.status = group.status;
    existing.settings = group.settings;
    existing.endpoints = group.endpoints.map(endpoint => ({ ...endpoint, groupId: existing.id }));
    existing.updatedAt = new Date().toISOString();
    sendCreated(res, { imported: true, overwritten: true, group: apiGroupForResponse(existing) });
    return;
  }

  apiGroups.push(group);
  sendCreated(res, { imported: true, overwritten: false, group: apiGroupForResponse(group) });
}

export async function validateApiGroup(
  context: DataSourceFoundationRouteContext,
  res: ServerResponse,
  groupIdOrSlug: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const group = await findApiGroup(context, groupIdOrSlug, access);
  if (!group) {
    sendJson(res, 404, fail('API group not found'));
    return;
  }
  if (!canWriteApiGroup(group, access)) {
    sendJson(res, 403, fail('API group access is denied'));
    return;
  }
  const result = await validateApiGroupDefinition(group, {
    access,
    ensureDataSourcesLoaded: options => context.ensureDataSourcesLoaded(options)
  });
  sendOk(res, result);
}

export async function createApiGroupGrant(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  groupIdOrSlug: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const group = await findApiGroup(context, groupIdOrSlug, access);
  if (!group) {
    sendJson(res, 404, fail('API group not found'));
    return;
  }
  if (!canWriteApiGroup(group, access)) {
    sendJson(res, 403, fail('API group access is denied'));
    return;
  }
  const body = await readJsonBody(req);
  if (!isRecord(body)) {
    sendBadRequest(res, 'API group grant body must be an object');
    return;
  }
  const clientId = readString(body.clientId);
  if (clientId) {
    await createApiClientApiGroupGrant(context, res, group, body, clientId);
    return;
  }
  await createTargetApiGroupGrant(context, res, group, body);
}

export async function handleApiGroupItem(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  groupIdOrSlug: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const group = await findApiGroup(context, groupIdOrSlug, access);
  if (!group) {
    sendJson(res, 404, fail('API group not found'));
    return;
  }
  if (req.method === 'GET') {
    sendOk(res, { group: apiGroupForResponse(group) });
    return;
  }
  if (!canWriteApiGroup(group, access)) {
    sendJson(res, 403, fail('API group access is denied'));
    return;
  }
  if (req.method === 'PUT') {
    await updateApiGroup(context, req, res, group);
    return;
  }
  if (req.method === 'DELETE') {
    await deleteApiGroup(context, res, group);
    return;
  }
  sendJson(res, 405, fail('Method not allowed'));
}

async function createApiClientApiGroupGrant(
  context: DataSourceFoundationRouteContext,
  res: ServerResponse,
  group: ApiGroupRecord,
  body: Record<string, unknown>,
  clientId: string
): Promise<void> {
  const grant: ApiClientApiGroupGrantRecord = {
    id: readString(body.id) ?? uuidv7(),
    clientId,
    apiGroupId: group.id,
    scopes: readJsonStringArray(body.scopes)
  };
  if (context.prismaClient) {
    const created = await context.prismaClient.apiClientApiGroupGrant.upsert({
      where: { clientId_apiGroupId: { apiGroupId: group.id, clientId } },
      create: {
        id: grant.id,
        apiGroupId: group.id,
        clientId,
        scopes: inputJson(grant.scopes)
      },
      update: {
        scopes: inputJson(grant.scopes)
      }
    });
    sendCreated(res, { clientGrant: apiClientApiGroupGrantForResponse(apiClientApiGroupGrantFromPrisma(created)) });
    return;
  }
  group.clientGrants = [...(group.clientGrants ?? []).filter(item => item.clientId !== clientId), grant];
  sendCreated(res, { clientGrant: apiClientApiGroupGrantForResponse(grant) });
}

async function createTargetApiGroupGrant(
  context: DataSourceFoundationRouteContext,
  res: ServerResponse,
  group: ApiGroupRecord,
  body: Record<string, unknown>
): Promise<void> {
  const targetType = readString(body.targetType);
  if (!targetType) {
    sendBadRequest(res, 'targetType or clientId is required');
    return;
  }
  const grant: ApiGroupGrantRecord = {
    id: readString(body.id) ?? uuidv7(),
    apiGroupId: group.id,
    targetType,
    targetId: readString(body.targetId),
    permission: readString(body.permission) ?? 'read',
    settings: readRecord(body.settings)
  };
  if (context.prismaClient) {
    const created = await context.prismaClient.apiGroupGrant.create({
      data: {
        id: grant.id,
        apiGroupId: group.id,
        targetType: grant.targetType,
        targetId: grant.targetId ?? null,
        permission: grant.permission,
        settings: inputJson(grant.settings)
      }
    });
    sendCreated(res, { grant: apiGroupGrantForResponse(apiGroupGrantFromPrisma(created)) });
    return;
  }
  group.grants = [...(group.grants ?? []), grant];
  sendCreated(res, { grant: apiGroupGrantForResponse(grant) });
}

async function updateApiGroup(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  group: ApiGroupRecord
): Promise<void> {
  const body = await readJsonBody(req);
  if (!isRecord(body)) {
    sendBadRequest(res, 'API group update body must be an object');
    return;
  }
  if (context.prismaClient) {
    const updated = await context.prismaClient.apiGroup.update({
      where: { id: group.id },
      data: apiGroupUpdateInput(body),
      include: {
        clientGrants: true,
        endpoints: { orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] },
        grants: true
      }
    });
    sendOk(res, { group: apiGroupForResponse(apiGroupFromPrisma(updated)) });
    return;
  }
  applyApiGroupPatch(group, body);
  sendOk(res, { group: apiGroupForResponse(group) });
}

async function deleteApiGroup(
  context: DataSourceFoundationRouteContext,
  res: ServerResponse,
  group: ApiGroupRecord
): Promise<void> {
  if (context.prismaClient) {
    await context.prismaClient.apiGroup.delete({ where: { id: group.id } });
  } else {
    const index = apiGroups.findIndex(item => item.id === group.id);
    if (index >= 0) apiGroups.splice(index, 1);
  }
  sendOk(res, { deleted: true });
}
