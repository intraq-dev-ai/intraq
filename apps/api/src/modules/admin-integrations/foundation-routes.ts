import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import {
  createEmailDeliveryService,
  type EmailDeliveryService
} from './email-service.js';
import { OutboundEmailRoutes } from './outbound-email-routes.js';
import { SmtpConfigRoutes } from './smtp-config-routes.js';

export class AdminIntegrationsFoundationRoutes {
  private readonly outboundEmailRoutes: OutboundEmailRoutes;
  private readonly smtpConfigRoutes: SmtpConfigRoutes;

  constructor(
    private readonly prismaClient: IntraQPrismaClient | null = null,
    emailService?: EmailDeliveryService | null
  ) {
    const resolvedEmailService = emailService ?? createEmailDeliveryService(prismaClient);
    this.outboundEmailRoutes = new OutboundEmailRoutes(prismaClient, resolvedEmailService);
    this.smtpConfigRoutes = new SmtpConfigRoutes(prismaClient, resolvedEmailService);
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (await this.smtpConfigRoutes.handle(req, res, url)) return true;
    if (await this.outboundEmailRoutes.handle(req, res, url)) return true;
    return false;
  }
}

export function createAdminIntegrationsFoundationRoutes(
  prismaClient: IntraQPrismaClient | null = null,
  emailService?: EmailDeliveryService | null
): AdminIntegrationsFoundationRoutes {
  return new AdminIntegrationsFoundationRoutes(prismaClient, emailService);
}
