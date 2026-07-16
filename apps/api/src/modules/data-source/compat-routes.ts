import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import type { DataSourceAccessPolicy } from './source-access.js';

export class DataSourceCompatibilityRoutes {
  constructor(_prismaClient: IntraQPrismaClient | null = null) {}

  async handle(
    _req: IncomingMessage,
    _res: ServerResponse,
    _url: URL,
    _access?: DataSourceAccessPolicy
  ): Promise<boolean> {
    return false;
  }
}
