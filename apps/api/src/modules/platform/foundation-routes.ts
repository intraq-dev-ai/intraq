import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, uuidv7 } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendForbidden, sendJson, sendOk } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import { createReleaseInfoReader, type PlatformReleaseInfoReader } from './release-info.js';
import { PlatformRuntimeDiagnostics } from './runtime-diagnostics.js';
import {
  brandingWithDeployment,
  isNonEmptyString,
  isRecord,
  type BrandingConfig
} from './branding-config.js';
import {
  fixedNow,
  readExportFormats,
  readFrequency,
  readIncludeIntraqInsights,
  readRecipients,
  readSubscriptionStatus,
  type EmailSubscription
} from './email-subscriptions.js';

export type { BrandingConfig } from './branding-config.js';

export class PlatformFoundationRoutes {
  constructor(
    private readonly prismaClient: IntraQPrismaClient | null = null,
    private readonly releaseInfoReader: PlatformReleaseInfoReader = createReleaseInfoReader(),
    private readonly runtimeDiagnostics: PlatformRuntimeDiagnostics = new PlatformRuntimeDiagnostics()
  ) {}

  private branding: BrandingConfig = {
    appName: 'intraQ',
    brandHeader: 'intraQ',
    brandSubHeader: '',
    faviconInitials: '',
    faviconUrl: '/favicon.ico',
    primaryColor: '#3152ad',
    accentColor: '#6c8eee',
    gradientStart: '#6c8eee',
    gradientEnd: '#3152ad',
    supportEmail: 'support@intraq.local',
    updatedAt: fixedNow
  };
  private subscriptions: EmailSubscription[] = [{
    id: 'email-subscription-foundation',
    dashboardId: 'dashboard-operations',
    dashboard: {
      id: 'dashboard-operations',
      name: 'Operations Overview',
      description: 'Daily operations report'
    },
    name: 'Daily Operations Report',
    description: 'Daily dashboard email for operators',
    recipients: ['operator@intraq.local', 'owner@intraq.local'],
    schedule: { frequency: 'daily', time: '9:00 AM' },
    status: 'active',
    deliveries: [{ id: 'delivery-foundation', status: 'sent', sentAt: fixedNow, recipients: ['operator@intraq.local'] }],
    frequency: 'daily',
    subject: 'Daily operations dashboard',
    enabled: true,
    exportFormats: ['pdf'],
    includeIntraqInsights: true,
    createdAt: fixedNow,
    updatedAt: fixedNow
  }];

  async readBrandingForRequest(_req: IncomingMessage): Promise<BrandingConfig> {
    return this.readBrandingConfig();
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (await this.handleBranding(req, res, url)) return true;
    if (await this.handleEmailSubscriptions(req, res, url)) return true;

    if (req.method === 'GET' && url.pathname === '/api/ready') {
      sendOk(res, { status: 'ready', service: 'intraq-api' });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/test/health') {
      sendOk(res, { status: 'ok', test: true });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/test/users') {
      sendOk(res, [{ id: 'user-foundation-admin', email: 'admin@intraq.local' }]);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/platform/release-info') {
      sendOk(res, await this.releaseInfoReader());
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/platform/runtime-diagnostics') {
      if (!this.runtimeDiagnostics.isEnabled()) return false;
      if (!this.runtimeDiagnostics.canRead(getRequestSecurityContext(req))) {
        sendForbidden(res, 'Management access is required.');
        return true;
      }
      sendOk(res, this.runtimeDiagnostics.snapshot());
      return true;
    }

    return false;
  }

  private async handleBranding(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== '/api/branding/config') return false;
    if (req.method === 'GET') {
      sendOk(res, await this.readBrandingConfig());
      return true;
    }
    sendJson(res, 405, fail('Method not allowed'));
    return true;
  }

  private async handleEmailSubscriptions(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/email-subscriptions/tenant/subscriptions') {
      sendOk(res, this.subscriptions);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/email-subscriptions/scheduler/status') {
      sendOk(res, { running: true, nextRunAt: '2026-05-03T09:00:00.000Z', pendingDeliveries: this.subscriptions.length });
      return true;
    }

    const dashboardMatch = /^\/api\/email-subscriptions\/dashboard\/([^/]+)\/subscriptions$/.exec(url.pathname);
    if (dashboardMatch?.[1]) {
      const dashboardId = decodeURIComponent(dashboardMatch[1]);
      if (req.method === 'GET') {
        sendOk(res, this.subscriptions.filter(subscription => subscription.dashboardId === dashboardId));
        return true;
      }
      if (req.method === 'POST') {
        await this.createSubscription(req, res, dashboardId);
        return true;
      }
    }

    const deliveryMatch = /^\/api\/email-subscriptions\/subscriptions\/([^/]+)\/deliveries$/.exec(url.pathname);
    if (req.method === 'GET' && deliveryMatch?.[1]) {
      const subscriptionId = decodeURIComponent(deliveryMatch[1]);
      if (!this.findSubscription(subscriptionId)) {
        sendJson(res, 404, fail('Email subscription not found'));
        return true;
      }
      sendOk(res, [{ id: `delivery-${subscriptionId}`, subscriptionId, status: 'sent', deliveredAt: fixedNow }]);
      return true;
    }

    const testMatch = /^\/api\/email-subscriptions\/subscriptions\/([^/]+)\/test$/.exec(url.pathname);
    if (req.method === 'POST' && testMatch?.[1]) {
      const subscriptionId = decodeURIComponent(testMatch[1]);
      if (!this.findSubscription(subscriptionId)) {
        sendJson(res, 404, fail('Email subscription not found'));
        return true;
      }
      sendOk(res, { message: 'Test email queued', subscriptionId });
      return true;
    }

    const itemMatch = /^\/api\/email-subscriptions\/subscriptions\/([^/]+)$/.exec(url.pathname);
    if (itemMatch?.[1]) {
      await this.handleSubscriptionById(req, res, decodeURIComponent(itemMatch[1]));
      return true;
    }
    return false;
  }

  private async createSubscription(req: IncomingMessage, res: ServerResponse, dashboardId: string): Promise<void> {
    const body = await readJsonBody(req);
    const recipients = readRecipients(body);
    if (!recipients.length) {
      sendBadRequest(res, 'At least one recipient is required.');
      return;
    }
    const subscription: EmailSubscription = {
      id: uuidv7(),
      dashboardId,
      name: isRecord(body) && isNonEmptyString(body.name) ? body.name.trim() : 'Dashboard Subscription',
      recipients,
      frequency: readFrequency(isRecord(body) ? body.frequency : undefined),
      subject: isRecord(body) && isNonEmptyString(body.subject) ? body.subject.trim() : 'Dashboard report',
      enabled: isRecord(body) && 'enabled' in body ? Boolean(body.enabled) : true,
      status: readSubscriptionStatus(body),
      exportFormats: readExportFormats(body),
      includeIntraqInsights: readIncludeIntraqInsights(body),
      createdAt: fixedNow,
      updatedAt: fixedNow
    };
    this.subscriptions = [subscription, ...this.subscriptions];
    sendOk(res, subscription);
  }

  private async handleSubscriptionById(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const subscription = this.findSubscription(id);
    if (!subscription) {
      sendJson(res, 404, fail('Email subscription not found'));
      return;
    }
    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      if (!isRecord(body)) {
        sendBadRequest(res, 'Subscription body must be a JSON object.');
        return;
      }
      Object.assign(subscription, {
        name: isNonEmptyString(body.name) ? body.name.trim() : subscription.name,
        recipients: 'recipients' in body ? readRecipients(body) : subscription.recipients,
        frequency: 'frequency' in body ? readFrequency(body.frequency) : subscription.frequency,
        subject: isNonEmptyString(body.subject) ? body.subject.trim() : subscription.subject,
        enabled: 'enabled' in body ? Boolean(body.enabled) : subscription.enabled,
        status: 'status' in body ? readSubscriptionStatus(body) : subscription.status,
        exportFormats: 'exportFormats' in body ? readExportFormats(body) : subscription.exportFormats,
        includeIntraqInsights: 'includeIntraqInsights' in body ? readIncludeIntraqInsights(body) : subscription.includeIntraqInsights,
        updatedAt: fixedNow
      });
      sendOk(res, subscription);
      return;
    }
    if (req.method === 'DELETE') {
      this.subscriptions = this.subscriptions.filter(item => item.id !== id);
      sendOk(res, { deleted: true, id });
      return;
    }
    sendJson(res, 405, fail('Method not allowed'));
  }

  private findSubscription(id: string): EmailSubscription | undefined {
    return this.subscriptions.find(subscription => subscription.id === id);
  }

  private async readBrandingConfig(): Promise<BrandingConfig> {
    return brandingWithDeployment(this.branding, 'self-hosted');
  }
}

export function createPlatformFoundationRoutes(
  prismaClient: IntraQPrismaClient | null = null,
  options: { enableRuntimeDiagnostics?: boolean } = {}
): PlatformFoundationRoutes {
  return new PlatformFoundationRoutes(
    prismaClient,
    createReleaseInfoReader(),
    new PlatformRuntimeDiagnostics(options.enableRuntimeDiagnostics === true)
  );
}
