import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { sendJson, sendOk } from '../../http.js';
import {
  createApiEndpoint,
  createApiGroup,
  createApiGroupGrant,
  exportApiGroup,
  handleApiGroupItem,
  importApiGroup,
  validateApiGroup
} from './foundation-api-group-management-routes.js';
import {
  apiClientApiGroupGrantForResponse,
  apiEndpointForResponse,
  apiGroupGrantForResponse
} from './foundation-api-group-mappers.js';
import {
  findApiGroup,
  listApiGroups,
  sendPrivateApiGroupEndpointData,
  sendPrivateApiGroupOpenApi
} from './foundation-api-group-core.js';
import {
  createApiGroupSnapshot,
  listApiGroupSnapshots,
  restoreApiGroupSnapshot
} from './foundation-api-group-snapshot-routes.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import type { DataSourceAccessPolicy } from './source-access.js';

export async function handleApiGroupManagement(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  access: DataSourceAccessPolicy
): Promise<boolean> {
  if (!url.pathname.startsWith('/api/api-groups')) return false;

  const openApiMatch = /^\/api\/api-groups\/([^/]+)\/openapi\.json$/.exec(url.pathname);
  if (req.method === 'GET' && openApiMatch?.[1]) {
    await sendPrivateApiGroupOpenApi(context, req, res, decodeURIComponent(openApiMatch[1]), access);
    return true;
  }

  const endpointDataMatch = /^\/api\/api-groups\/([^/]+)\/endpoints\/([^/]+)\/data$/.exec(url.pathname);
  if ((req.method === 'GET' || req.method === 'POST') && endpointDataMatch?.[1] && endpointDataMatch[2]) {
    await sendPrivateApiGroupEndpointData(
      context,
      req,
      res,
      decodeURIComponent(endpointDataMatch[1]),
      decodeURIComponent(endpointDataMatch[2]),
      access
    );
    return true;
  }

  if (url.pathname === '/api/api-groups') {
    if (req.method === 'GET') {
      sendOk(res, { groups: await listApiGroups(context, access) });
      return true;
    }
    if (req.method === 'POST') {
      await createApiGroup(context, req, res, access);
      return true;
    }
    sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  if (url.pathname === '/api/api-groups/import') {
    if (req.method === 'POST') {
      await importApiGroup(context, req, res, access);
      return true;
    }
    sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  const exportMatch = /^\/api\/api-groups\/([^/]+)\/export$/.exec(url.pathname);
  if (exportMatch?.[1]) {
    if (req.method === 'GET') {
      await exportApiGroup(context, res, decodeURIComponent(exportMatch[1]), access);
      return true;
    }
    sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  const validateMatch = /^\/api\/api-groups\/([^/]+)\/validate$/.exec(url.pathname);
  if (validateMatch?.[1]) {
    if (req.method === 'GET' || req.method === 'POST') {
      await validateApiGroup(context, res, decodeURIComponent(validateMatch[1]), access);
      return true;
    }
    sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  const restoreSnapshotMatch = /^\/api\/api-groups\/([^/]+)\/snapshots\/([^/]+)\/restore$/.exec(url.pathname);
  if (restoreSnapshotMatch?.[1] && restoreSnapshotMatch[2]) {
    if (req.method === 'POST') {
      await restoreApiGroupSnapshot(
        context,
        req,
        res,
        decodeURIComponent(restoreSnapshotMatch[1]),
        decodeURIComponent(restoreSnapshotMatch[2]),
        access
      );
      return true;
    }
    sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  const snapshotsMatch = /^\/api\/api-groups\/([^/]+)\/snapshots$/.exec(url.pathname);
  if (snapshotsMatch?.[1]) {
    const groupIdOrSlug = decodeURIComponent(snapshotsMatch[1]);
    if (req.method === 'GET') {
      await listApiGroupSnapshots(context, res, groupIdOrSlug, access);
      return true;
    }
    if (req.method === 'POST') {
      await createApiGroupSnapshot(context, req, res, groupIdOrSlug, access);
      return true;
    }
    sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  const endpointsMatch = /^\/api\/api-groups\/([^/]+)\/endpoints$/.exec(url.pathname);
  if (endpointsMatch?.[1]) {
    const groupIdOrSlug = decodeURIComponent(endpointsMatch[1]);
    if (req.method === 'GET') {
      const group = await findApiGroup(context, groupIdOrSlug, access);
      if (!group) {
        sendJson(res, 404, fail('API group not found'));
        return true;
      }
      sendOk(res, { endpoints: group.endpoints.map(apiEndpointForResponse) });
      return true;
    }
    if (req.method === 'POST') {
      await createApiEndpoint(context, req, res, groupIdOrSlug, access);
      return true;
    }
    sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  const grantsMatch = /^\/api\/api-groups\/([^/]+)\/grants$/.exec(url.pathname);
  if (grantsMatch?.[1]) {
    if (req.method === 'POST') {
      await createApiGroupGrant(context, req, res, decodeURIComponent(grantsMatch[1]), access);
      return true;
    }
    const group = await findApiGroup(context, decodeURIComponent(grantsMatch[1]), access);
    if (!group) {
      sendJson(res, 404, fail('API group not found'));
      return true;
    }
    sendOk(res, {
      grants: (group.grants ?? []).map(apiGroupGrantForResponse),
      clientGrants: (group.clientGrants ?? []).map(apiClientApiGroupGrantForResponse)
    });
    return true;
  }

  const itemMatch = /^\/api\/api-groups\/([^/]+)$/.exec(url.pathname);
  if (itemMatch?.[1]) {
    await handleApiGroupItem(context, req, res, decodeURIComponent(itemMatch[1]), access);
    return true;
  }

  sendJson(res, 404, fail('API group route not found'));
  return true;
}
