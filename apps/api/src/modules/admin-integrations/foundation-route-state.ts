import type { Item } from './foundation-route-utils.js';

export const smtpConfigs: Item[] = [
  {
    id: 'smtp-foundation',
    name: 'Foundation SMTP',
    host: 'smtp.example.local',
    port: 587,
    username: 'noreply@intraq.local',
    fromName: 'intraQ',
    fromEmail: 'noreply@intraq.local',
    replyToEmail: 'support@intraq.local',
    secure: false,
    isActive: true,
    isDefault: true,
    isGlobal: false
  }
];

export const outboundEmails: Item[] = [
  {
    id: 'email-foundation',
    name: 'Welcome Email',
    subject: 'Welcome Email',
    status: 'sent',
    to: ['demo@intraq.local'],
    textContent: 'Welcome to intraQ.',
    htmlContent: '<p>Welcome to intraQ.</p>',
    attachmentMeta: [],
    sentAt: '2026-05-02T00:00:00.000Z',
    createdAt: '2026-05-02T00:00:00.000Z'
  }
];
