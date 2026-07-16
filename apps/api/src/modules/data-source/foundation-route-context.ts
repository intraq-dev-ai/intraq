import type { IntraQPrismaClient } from '@intraq/db';
import type { EnsureDataSourcesLoaded } from './prisma-runtime-sync.js';

export interface DataSourceFoundationRouteContext {
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded;
  prismaClient: IntraQPrismaClient | null;
}
