import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';

interface AdminRecord {
  id?: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
}

const notifications: AdminRecord[] = [];

export class AdminFoundationRoutes {
  constructor(private readonly _client: IntraQPrismaClient | null = null) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/admin/analytics/system') {
      sendOk(res, {
        activeDashboards: 0,
        activeUsers: 1,
        dataSources: 0,
        service: 'intraq'
      });
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/reports/usage') {
      sendOk(res, { rows: [{ metric: 'dashboard_views', value: 0 }], total: 1 });
      return true;
    }

    if (url.pathname === '/api/admin/notifications') {
      if (req.method === 'GET') {
        sendOk(res, notifications);
        return true;
      }
      if (req.method === 'POST') {
        const item = await createRecord(req);
        if (!item) {
          sendBadRequest(res, 'name is required');
          return true;
        }
        notifications.unshift(item);
        sendOk(res, item);
        return true;
      }
      sendJson(res, 405, fail('Method not allowed'));
      return true;
    }

    return false;
  }
}

export function createAdminFoundationRoutes(client: IntraQPrismaClient | null = null): AdminFoundationRoutes {
  return new AdminFoundationRoutes(client);
}

async function createRecord(req: IncomingMessage): Promise<AdminRecord | null> {
  const body = await readJsonBody(req);
  if (!isRecord(body) || typeof body.name !== 'string' || !body.name.trim()) return null;
  return {
    id: `notice-${Date.now()}`,
    name: body.name.trim(),
    status: typeof body.status === 'string' ? body.status : 'active',
    ...body
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
