import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import { fail, uuidv7 } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import { outboundEmails } from './foundation-route-state.js';
import type { EmailDeliveryService } from './email-service.js';
import { isNonEmptyString, isRecord, readRecipients } from './foundation-route-utils.js';

export class OutboundEmailRoutes {
  constructor(
    private readonly prismaClient: IntraQPrismaClient | null,
    private readonly emailService: EmailDeliveryService
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== '/api/outbound-emails') return false;
    if (req.method === 'GET') {
      sendOk(res, { emails: outboundEmails, total: outboundEmails.length });
      return true;
    }
    if (req.method === 'POST') {
      await this.sendOutboundEmail(req, res);
      return true;
    }
    return false;
  }

  private async sendOutboundEmail(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const recipients = readRecipients(isRecord(body) ? body.to : undefined);
    if (!isRecord(body) || recipients.length === 0 || !isNonEmptyString(body.subject)) {
      sendBadRequest(res, 'to and subject are required');
      return;
    }
    const context = getRequestSecurityContext(req);
    const item = {
      id: uuidv7(),
      name: body.subject.trim(),
      subject: body.subject.trim(),
      status: 'sent',
      to: recipients,
      textContent: isNonEmptyString(body.message) ? body.message.trim() : isNonEmptyString(body.textContent) ? body.textContent.trim() : '',
      htmlContent: isNonEmptyString(body.html) ? body.html.trim() : isNonEmptyString(body.htmlContent) ? body.htmlContent.trim() : '',
      attachmentMeta: Array.isArray(body.attachmentMeta) ? body.attachmentMeta : [],
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    try {
      await this.emailService.send({
        ...(context?.tenantId ? { tenantId: context.tenantId } : {}),
        to: recipients,
        subject: item.subject,
        text: item.textContent,
        html: item.htmlContent
      });
      if (this.prismaClient && context?.userId) {
        await this.prismaClient.outboundEmail.create({
          data: {
            tenantId: context.tenantId ?? null,
            userId: context.userId,
            to: recipients,
            subject: item.subject,
            textContent: item.textContent,
            htmlContent: item.htmlContent,
            fromName: 'IntraQ',
            fromEmail: 'noreply@intraq.local',
            status: 'sent',
            sentAt: new Date()
          }
        });
      }
      outboundEmails.unshift(item);
      sendOk(res, item);
    } catch (error) {
      sendJson(res, 502, fail(error instanceof Error ? error.message : 'Email delivery failed'));
    }
  }
}
