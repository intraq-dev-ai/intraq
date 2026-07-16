import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import type { EnsureDataSourcesLoaded } from '../data-source/prisma-runtime-sync.js';
import { noopEnsureDataSourcesLoaded } from '../data-source/prisma-runtime-sync.js';
import { DashboardFoundationStore, type DashboardRuntimeStore } from '../dashboard/foundation-store.js';
import { BoundedMemoryEmbedTokenStore, type EmbedTokenStore } from './embed-token-store.js';
import { EmbedDataRoutes } from './embed-data-routes.js';
import { EmbedTokenRoutes } from './embed-token-routes.js';
import { EmbedTokenService } from './embed-token-service.js';

export class PublicAccessFoundationRoutes {
  private readonly embedDataRoutes: EmbedDataRoutes;
  private readonly embedTokenRoutes: EmbedTokenRoutes;
  private readonly embedTokenService: EmbedTokenService;

  constructor(
    dashboardStore: DashboardRuntimeStore = new DashboardFoundationStore(),
    tokenStore: EmbedTokenStore = new BoundedMemoryEmbedTokenStore(),
    prismaClient: IntraQPrismaClient | null = null,
    ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded
  ) {
    this.embedTokenService = new EmbedTokenService(dashboardStore, tokenStore);
    this.embedTokenRoutes = new EmbedTokenRoutes(
      tokenStore,
      this.embedTokenService
    );
    this.embedDataRoutes = new EmbedDataRoutes(this.embedTokenService, prismaClient, ensureDataSourcesLoaded);
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (await this.embedTokenRoutes.handle(req, res, url)) return true;
    if (await this.embedDataRoutes.handle(req, res, url)) return true;
    return false;
  }

  frameAncestorsForEmbedRoute(url: URL): string | null {
    return this.embedTokenService.frameAncestorsForEmbedRoute(url);
  }
}

export function createPublicAccessFoundationRoutes(
  store?: DashboardRuntimeStore,
  tokenStore?: EmbedTokenStore,
  prismaClient?: IntraQPrismaClient | null,
  ensureDataSourcesLoaded?: EnsureDataSourcesLoaded
): PublicAccessFoundationRoutes {
  return new PublicAccessFoundationRoutes(store, tokenStore, prismaClient ?? null, ensureDataSourcesLoaded);
}
