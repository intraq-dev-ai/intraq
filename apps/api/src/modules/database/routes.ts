import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendOk } from '../../http.js';
import { BASE_PRODUCT_TABLES, databaseCoverage } from './schema.js';

export class DatabaseSchemaRoutes {
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/database/schema/tables') {
      sendOk(res, { tables: BASE_PRODUCT_TABLES, total: BASE_PRODUCT_TABLES.length });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/database/schema/coverage') {
      sendOk(res, databaseCoverage());
      return true;
    }
    return false;
  }
}

export function createDatabaseSchemaRoutes(): DatabaseSchemaRoutes {
  return new DatabaseSchemaRoutes();
}
