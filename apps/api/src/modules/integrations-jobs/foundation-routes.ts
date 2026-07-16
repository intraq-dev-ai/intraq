import type { IncomingMessage, ServerResponse } from 'node:http';
import { CacheManagementCompatRoutes } from './cache-routes.js';
import { DatabricksJobsCompatRoutes } from './databricks-routes.js';
import { FlatfileCompatRoutes } from './flatfile-routes.js';
import { PdfGenerationCompatRoutes } from './pdf-routes.js';
import { S3StorageCompatRoutes } from './storage-routes.js';
import { IntegrationsJobsStore } from './store.js';

export class IntegrationsJobsFoundationRoutes {
  private readonly store = new IntegrationsJobsStore();
  private readonly databricksRoutes = new DatabricksJobsCompatRoutes(this.store);
  private readonly storageRoutes = new S3StorageCompatRoutes(this.store);
  private readonly flatfileRoutes = new FlatfileCompatRoutes(this.store);
  private readonly cacheRoutes = new CacheManagementCompatRoutes(this.store);
  private readonly pdfRoutes = new PdfGenerationCompatRoutes(this.store);

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (await this.databricksRoutes.handle(req, res, url)) return true;
    if (await this.storageRoutes.handle(req, res, url)) return true;
    if (await this.flatfileRoutes.handle(req, res, url)) return true;
    if (await this.cacheRoutes.handle(req, res, url)) return true;
    if (await this.pdfRoutes.handle(req, res, url)) return true;
    return false;
  }
}

export function createIntegrationsJobsFoundationRoutes(): IntegrationsJobsFoundationRoutes {
  return new IntegrationsJobsFoundationRoutes();
}
