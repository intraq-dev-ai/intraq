import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import { fail } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import { smtpConfigs } from './foundation-route-state.js';
import { encodeSmtpSecret, type EmailDeliveryService } from './email-service.js';
import {
  idFrom,
  isInstanceOwnerRole,
  isNonEmptyString,
  isRecord,
  numberValue,
  optionalString
} from './foundation-route-utils.js';
import { handleMemoryCollection, setMemoryDefault } from './memory-collection-routes.js';

export class SmtpConfigRoutes {
  constructor(
    private readonly prismaClient: IntraQPrismaClient | null,
    private readonly emailService: EmailDeliveryService
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (await this.handleSmtpConfig(req, res, url)) return true;

    if (req.method === 'POST' && /^\/api\/smtp-config\/([^/]+)\/test$/.test(url.pathname)) {
      if (this.prismaClient) {
        await this.testSmtpConfiguration(req, res, idFrom(url.pathname, 3));
        return true;
      }
      const item = smtpConfigs.find(candidate => candidate.id === idFrom(url.pathname, 3));
      if (!item) {
        sendJson(res, 404, fail('SMTP configuration not found'));
        return true;
      }
      Object.assign(item, { testStatus: 'success', lastTested: new Date().toISOString(), testError: '' });
      sendOk(res, { success: true, message: 'SMTP configuration test succeeded', configuration: item });
      return true;
    }
    if (req.method === 'POST' && /^\/api\/smtp-config\/([^/]+)\/set-default$/.test(url.pathname)) {
      if (this.prismaClient) {
        await this.setDefaultSmtpConfiguration(req, res, idFrom(url.pathname, 3));
        return true;
      }
      setMemoryDefault(res, smtpConfigs, idFrom(url.pathname, 3), 'SMTP configuration not found');
      return true;
    }
    return false;
  }

  private async handleSmtpConfig(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!this.prismaClient) {
      return handleMemoryCollection(req, res, url, '/api/smtp-config', smtpConfigs, 'SMTP configuration');
    }

    if (url.pathname === '/api/smtp-config') {
      if (req.method === 'GET') {
        await this.listSmtpConfigurations(req, res);
      } else if (req.method === 'POST') {
        await this.createSmtpConfiguration(req, res);
      } else {
        sendJson(res, 405, fail('Method not allowed'));
      }
      return true;
    }

    const match = /^\/api\/smtp-config\/([^/]+)$/.exec(url.pathname);
    if (!match?.[1]) return false;
    const id = decodeURIComponent(match[1]);
    if (req.method === 'GET') await this.getSmtpConfiguration(req, res, id);
    else if (req.method === 'PUT') await this.updateSmtpConfiguration(req, res, id);
    else if (req.method === 'DELETE') await this.deleteSmtpConfiguration(res, id);
    else sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  private async listSmtpConfigurations(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const context = getRequestSecurityContext(req);
    const configs = await this.prismaClient!.smtpConfiguration.findMany({
      where: smtpVisibilityWhere(context),
      include: { tenant: true },
      orderBy: [
        { isGlobal: 'desc' },
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    sendOk(res, configs.length > 0 ? configs.map(config => safeSmtpConfig(config, context)) : smtpConfigs.map(config => ({ ...config, password: '***hidden***' })));
  }

  private async getSmtpConfiguration(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const context = getRequestSecurityContext(req);
    const config = await this.prismaClient!.smtpConfiguration.findFirst({
      where: { id, ...smtpVisibilityWhere(context) },
      include: { tenant: true }
    });
    if (!config) {
      sendJson(res, 404, fail('SMTP configuration not found'));
      return;
    }
    sendOk(res, safeSmtpConfig(config, context));
  }

  private async createSmtpConfiguration(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.name)) {
      sendBadRequest(res, 'name is required');
      return;
    }
    const context = getRequestSecurityContext(req);
    const isInstanceOwner = isInstanceOwnerRole(context?.role);
    const createAsGlobal = isInstanceOwner && body.createAsGlobal === true;
    const tenantId = createAsGlobal ? null : optionalString(body.targetTenantId) ?? context?.tenantId ?? null;
    const isDefault = body.isDefault === true;
    const isGlobal = createAsGlobal || (tenantId === null && isInstanceOwner);
    if (isDefault) await this.unsetSmtpDefaults(tenantId, isGlobal);
    const config = await this.prismaClient!.smtpConfiguration.create({
      data: {
        host: optionalString(body.host) ?? 'smtp.example.local',
        port: numberValue(body.port) ?? 587,
        secure: body.secure === true,
        username: optionalString(body.username) ?? '',
        password: encodeSmtpSecret(optionalString(body.password) ?? ''),
        fromName: optionalString(body.fromName) ?? body.name.trim(),
        fromEmail: optionalString(body.fromEmail) ?? optionalString(body.username) ?? 'noreply@intraq.local',
        replyToEmail: optionalString(body.replyToEmail),
        bccEmail: optionalString(body.bccEmail),
        isActive: body.isActive !== false,
        isDefault,
        tenantId,
        isGlobal,
        scope: isGlobal ? 'GLOBAL' : 'TENANT'
      },
      include: { tenant: true }
    });
    sendOk(res, { ...safeSmtpConfig(config, context), name: body.name.trim() });
  }

  private async updateSmtpConfiguration(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'SMTP configuration body must be an object');
      return;
    }
    const existing = await this.prismaClient!.smtpConfiguration.findUnique({ where: { id } });
    if (!existing) {
      sendJson(res, 404, fail('SMTP configuration not found'));
      return;
    }
    const isDefault = body.isDefault === true;
    if (isDefault && !existing.isDefault) await this.unsetSmtpDefaults(existing.tenantId, existing.isGlobal);
    const config = await this.prismaClient!.smtpConfiguration.update({
      where: { id },
      data: {
        ...(optionalString(body.host) ? { host: optionalString(body.host)! } : {}),
        ...(numberValue(body.port) ? { port: numberValue(body.port)! } : {}),
        ...('secure' in body ? { secure: body.secure === true } : {}),
        ...(optionalString(body.username) ? { username: optionalString(body.username)! } : {}),
        ...(optionalString(body.password) ? { password: encodeSmtpSecret(optionalString(body.password)!) } : {}),
        ...(optionalString(body.fromName) || optionalString(body.name) ? { fromName: (optionalString(body.fromName) ?? optionalString(body.name))! } : {}),
        ...(optionalString(body.fromEmail) ? { fromEmail: optionalString(body.fromEmail)! } : {}),
        ...('replyToEmail' in body ? { replyToEmail: optionalString(body.replyToEmail) } : {}),
        ...('bccEmail' in body ? { bccEmail: optionalString(body.bccEmail) } : {}),
        ...('isActive' in body ? { isActive: body.isActive !== false } : {}),
        ...('isDefault' in body ? { isDefault } : {})
      },
      include: { tenant: true }
    });
    sendOk(res, safeSmtpConfig(config, getRequestSecurityContext(req)));
  }

  private async deleteSmtpConfiguration(res: ServerResponse, id: string): Promise<void> {
    try {
      await this.prismaClient!.smtpConfiguration.delete({ where: { id } });
      sendOk(res, { message: 'SMTP configuration deleted successfully' });
    } catch {
      sendJson(res, 404, fail('SMTP configuration not found'));
    }
  }

  private async testSmtpConfiguration(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const body = await readJsonBody(req);
    const config = await this.prismaClient!.smtpConfiguration.findUnique({ where: { id } });
    if (!config) {
      sendJson(res, 404, fail('SMTP configuration not found'));
      return;
    }
    const testEmail = isRecord(body)
      ? optionalString(body.testEmail) ?? optionalString(body.email) ?? config.replyToEmail ?? config.fromEmail ?? config.username
      : config.replyToEmail ?? config.fromEmail ?? config.username;
    if (!testEmail) {
      sendBadRequest(res, 'testEmail is required');
      return;
    }
    try {
      await this.emailService.send({
        configId: id,
        tenantId: config.tenantId,
        to: testEmail,
        subject: 'IntraQ SMTP test',
        text: 'This is a test email from your IntraQ SMTP configuration.',
        html: '<p>This is a test email from your IntraQ SMTP configuration.</p>'
      });
      const updated = await this.prismaClient!.smtpConfiguration.update({
        where: { id },
        data: { testStatus: 'success', testError: '', lastTested: new Date() },
        include: { tenant: true }
      });
      sendOk(res, {
        success: true,
        message: `SMTP configuration test email sent to ${testEmail}`,
        configuration: safeSmtpConfig(updated, getRequestSecurityContext(req))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prismaClient!.smtpConfiguration.update({
        where: { id },
        data: { testStatus: 'failed', testError: message, lastTested: new Date() }
      });
      sendJson(res, 502, fail(`SMTP configuration test failed: ${message}`));
    }
  }

  private async setDefaultSmtpConfiguration(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const config = await this.prismaClient!.smtpConfiguration.findUnique({ where: { id } });
    if (!config) {
      sendJson(res, 404, fail('SMTP configuration not found'));
      return;
    }
    await this.unsetSmtpDefaults(config.tenantId, config.isGlobal);
    const updated = await this.prismaClient!.smtpConfiguration.update({
      where: { id },
      data: { isDefault: true },
      include: { tenant: true }
    });
    sendOk(res, safeSmtpConfig(updated, getRequestSecurityContext(req)));
  }

  private async unsetSmtpDefaults(tenantId: string | null, isGlobal: boolean): Promise<void> {
    await this.prismaClient!.smtpConfiguration.updateMany({
      where: isGlobal ? { isGlobal: true } : { tenantId },
      data: { isDefault: false }
    });
  }
}

function smtpVisibilityWhere(context: ReturnType<typeof getRequestSecurityContext> | undefined): Record<string, unknown> {
  if (isInstanceOwnerRole(context?.role)) return {};
  return {
    OR: [
      { isGlobal: true },
      ...(context?.tenantId ? [{ tenantId: context.tenantId }] : []),
      { tenantId: null }
    ]
  };
}

function safeSmtpConfig(config: Record<string, unknown>, context: ReturnType<typeof getRequestSecurityContext> | undefined): Record<string, unknown> {
  const isHiddenGlobal = config.isGlobal === true && !isInstanceOwnerRole(context?.role);
  const host = isHiddenGlobal ? '***hidden***' : config.host;
  const username = isHiddenGlobal ? '***hidden***' : config.username;
  const port = isHiddenGlobal ? '***' : config.port;
  return {
    ...config,
    name: typeof config.name === 'string' ? config.name : String(config.fromName ?? `${String(host ?? 'SMTP')}:${String(port ?? '')}`),
    host,
    port,
    username,
    password: '***hidden***',
    isCredentialsHidden: isHiddenGlobal
  };
}
