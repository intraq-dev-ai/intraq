import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, uuidv7 } from '@intraq/contracts';
import { readJsonBody, sendJson, sendOk, sendCreated } from '../../http.js';
import {
  buildApiGroupSnapshotPayload,
  readApiGroupSnapshotPayload
} from './api-group-bundles.js';
import type { ApiGroupRecord, ApiGroupSnapshotPayload, ApiGroupSnapshotRecord } from './api-group-types.js';
import { findApiGroup } from './foundation-api-group-core.js';
import {
  apiGroupForResponse,
  apiGroupFromPrisma,
  apiGroupRestoreInput,
  apiGroupSnapshotForResponse,
  endpointFlatCreateInput
} from './foundation-api-group-mappers.js';
import {
  apiGroupSnapshots,
  canWriteApiGroup
} from './foundation-api-group-state.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import {
  inputJson,
  isRecord,
  readString
} from './foundation-route-utils.js';
import type { DataSourceAccessPolicy } from './source-access.js';

export async function listApiGroupSnapshots(
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
  if (context.prismaClient) {
    const snapshots = await context.prismaClient.apiGroupSnapshot.findMany({
      where: { apiGroupId: group.id },
      orderBy: [{ snapshotNumber: 'desc' }, { createdAt: 'desc' }]
    });
    sendOk(res, { snapshots: snapshots.map(apiGroupSnapshotForResponse) });
    return;
  }
  sendOk(res, {
    snapshots: apiGroupSnapshots
      .filter(snapshot => snapshot.apiGroupId === group.id)
      .sort((left, right) => right.snapshotNumber - left.snapshotNumber)
      .map(apiGroupSnapshotForResponse)
  });
}

export async function createApiGroupSnapshot(
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
  const body = await readJsonBody(req).catch(() => undefined);
  const bodyRecord = isRecord(body) ? body : {};
  const lastSnapshotNumber = await latestApiGroupSnapshotNumber(context, group.id);
  const snapshotNumber = lastSnapshotNumber + 1;
  const name = readString(bodyRecord.name) ?? `Snapshot ${snapshotNumber}`;
  const comment = readString(bodyRecord.comment);
  const snapshot: ApiGroupSnapshotRecord = {
    id: readString(bodyRecord.id) ?? uuidv7(),
    apiGroupId: group.id,
    snapshotNumber,
    name,
    comment,
    snapshot: buildApiGroupSnapshotPayload(group),
    createdBy: access.scope?.userId ?? null,
    createdAt: new Date().toISOString()
  };
  if (context.prismaClient) {
    const created = await context.prismaClient.apiGroupSnapshot.create({
      data: {
        id: snapshot.id,
        apiGroupId: group.id,
        snapshotNumber,
        name,
        comment: comment ?? null,
        snapshot: inputJson(snapshot.snapshot),
        createdBy: snapshot.createdBy ?? null
      }
    });
    sendCreated(res, { snapshot: apiGroupSnapshotForResponse(created) });
    return;
  }
  apiGroupSnapshots.push(snapshot);
  sendCreated(res, { snapshot: apiGroupSnapshotForResponse(snapshot) });
}

export async function restoreApiGroupSnapshot(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  groupIdOrSlug: string,
  snapshotIdOrNumber: string,
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
  if (req.method !== 'POST') {
    sendJson(res, 405, fail('Method not allowed'));
    return;
  }
  if (context.prismaClient) {
    const snapshot = await findPrismaApiGroupSnapshot(context, group.id, snapshotIdOrNumber);
    if (!snapshot) {
      sendJson(res, 404, fail('API group snapshot not found'));
      return;
    }
    const payload = readApiGroupSnapshotPayload(snapshot.snapshot);
    if (!payload) {
      sendJson(res, 400, fail('API group snapshot is invalid'));
      return;
    }
    const restored = await context.prismaClient.$transaction(async tx => {
      await tx.apiEndpoint.deleteMany({ where: { groupId: group.id } });
      await tx.apiGroup.update({
        where: { id: group.id },
        data: apiGroupRestoreInput(payload.group)
      });
      if (payload.endpoints.length > 0) {
        await tx.apiEndpoint.createMany({
          data: payload.endpoints.map(endpoint => endpointFlatCreateInput({
            ...endpoint,
            groupId: group.id,
            settings: {
              ...endpoint.settings,
              groupSlug: payload.group.slug
            }
          }))
        });
      }
      return tx.apiGroup.findUnique({
        where: { id: group.id },
        include: {
          clientGrants: true,
          endpoints: { orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] },
          grants: true
        }
      });
    });
    sendOk(res, {
      restored: true,
      snapshot: apiGroupSnapshotForResponse(snapshot),
      group: restored ? apiGroupForResponse(apiGroupFromPrisma(restored)) : null
    });
    return;
  }

  const snapshot = findInMemoryApiGroupSnapshot(group.id, snapshotIdOrNumber);
  if (!snapshot) {
    sendJson(res, 404, fail('API group snapshot not found'));
    return;
  }
  restoreInMemoryApiGroupFromSnapshot(group, snapshot.snapshot);
  sendOk(res, {
    restored: true,
    snapshot: apiGroupSnapshotForResponse(snapshot),
    group: apiGroupForResponse(group)
  });
}

async function latestApiGroupSnapshotNumber(context: DataSourceFoundationRouteContext, groupId: string): Promise<number> {
  if (context.prismaClient) {
    const latest = await context.prismaClient.apiGroupSnapshot.findFirst({
      where: { apiGroupId: groupId },
      orderBy: { snapshotNumber: 'desc' },
      select: { snapshotNumber: true }
    });
    return latest?.snapshotNumber ?? 0;
  }
  return Math.max(0, ...apiGroupSnapshots.filter(snapshot => snapshot.apiGroupId === groupId).map(snapshot => snapshot.snapshotNumber));
}

function findPrismaApiGroupSnapshot(
  context: DataSourceFoundationRouteContext,
  groupId: string,
  snapshotIdOrNumber: string
) {
  const snapshotNumber = Number(snapshotIdOrNumber);
  return context.prismaClient?.apiGroupSnapshot.findFirst({
    where: {
      apiGroupId: groupId,
      OR: [
        { id: snapshotIdOrNumber },
        ...(Number.isInteger(snapshotNumber) && snapshotNumber > 0 ? [{ snapshotNumber }] : [])
      ]
    }
  }) ?? null;
}

function findInMemoryApiGroupSnapshot(groupId: string, snapshotIdOrNumber: string): ApiGroupSnapshotRecord | null {
  const snapshotNumber = Number(snapshotIdOrNumber);
  return apiGroupSnapshots.find(snapshot => snapshot.apiGroupId === groupId
    && (snapshot.id === snapshotIdOrNumber || (Number.isInteger(snapshotNumber) && snapshot.snapshotNumber === snapshotNumber))) ?? null;
}

function restoreInMemoryApiGroupFromSnapshot(group: ApiGroupRecord, snapshot: ApiGroupSnapshotPayload): void {
  group.slug = snapshot.group.slug;
  group.name = snapshot.group.name;
  group.description = snapshot.group.description ?? null;
  group.visibility = snapshot.group.visibility;
  group.status = snapshot.group.status;
  group.settings = { ...snapshot.group.settings };
  group.endpoints = snapshot.endpoints.map(endpoint => ({
    ...endpoint,
    groupId: group.id,
    settings: {
      ...endpoint.settings,
      groupSlug: snapshot.group.slug
    }
  }));
  group.updatedAt = new Date().toISOString();
}
