import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import type { IntraQPrismaClient } from '@intraq/db';

export interface EmailMessage {
  bcc?: string | string[];
  html?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  to: string | string[];
}

export interface EmailDeliveryResult {
  skipped?: boolean;
  messageId?: string;
}

export interface EmailDeliveryService {
  send(input: EmailMessage & { configId?: string | null; tenantId?: string | null }): Promise<EmailDeliveryResult>;
}

export interface SmtpRuntimeConfig {
  bccEmail?: string | null;
  fromEmail: string;
  fromName: string;
  host: string;
  password: string;
  port: number;
  replyToEmail?: string | null;
  secure: boolean;
  username: string;
}

export class SmtpEmailDeliveryService implements EmailDeliveryService {
  constructor(
    private readonly client: IntraQPrismaClient | null,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async send(input: EmailMessage & { configId?: string | null; tenantId?: string | null }): Promise<EmailDeliveryResult> {
    const config = await this.resolveConfig(input.tenantId ?? null, input.configId ?? null);
    if (!config) {
      if (allowDryRun(this.env)) return { skipped: true };
      throw new Error('SMTP is not configured.');
    }

    await sendSmtp(config, input);
    return { messageId: `smtp-${Date.now()}` };
  }

  async resolveConfig(tenantId: string | null, configId: string | null = null): Promise<SmtpRuntimeConfig | null> {
    const databaseConfig = await this.resolveDatabaseConfig(tenantId, configId);
    if (databaseConfig) return databaseConfig;
    return envSmtpConfig(this.env);
  }

  private async resolveDatabaseConfig(tenantId: string | null, configId: string | null = null): Promise<SmtpRuntimeConfig | null> {
    if (!this.client) return null;
    if (configId) {
      const config = await this.client.smtpConfiguration.findUnique({ where: { id: configId } });
      return config ? this.smtpRuntimeConfig(config) : null;
    }
    const scopedConfigs = await this.client.smtpConfiguration.findMany({
      where: {
        isActive: true,
        OR: [
          ...(tenantId ? [{ tenantId }] : []),
          { isGlobal: true },
          { tenantId: null }
        ]
      },
      orderBy: [
        { isDefault: 'desc' },
        { isGlobal: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 1
    });
    const configs = scopedConfigs.length > 0
      ? scopedConfigs
      : await this.client.smtpConfiguration.findMany({
          where: { isActive: true },
          orderBy: [
            { isDefault: 'desc' },
            { isGlobal: 'desc' },
            { createdAt: 'desc' }
          ],
          take: 1
        });
    const config = configs[0];
    if (!config) return null;
    return this.smtpRuntimeConfig(config);
  }

  private smtpRuntimeConfig(config: {
    bccEmail: string | null;
    fromEmail: string;
    fromName: string;
    host: string;
    password: string;
    port: number;
    replyToEmail: string | null;
    secure: boolean;
    username: string;
  }): SmtpRuntimeConfig {
    return {
      bccEmail: config.bccEmail,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      host: config.host,
      password: decodeSmtpSecret(config.password, this.env),
      port: config.port,
      replyToEmail: config.replyToEmail,
      secure: config.secure,
      username: config.username
    };
  }
}

export function createEmailDeliveryService(
  client: IntraQPrismaClient | null,
  env: NodeJS.ProcessEnv = process.env
): SmtpEmailDeliveryService {
  return new SmtpEmailDeliveryService(client, env);
}

export function encodeSmtpSecret(value: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!value) return '';
  const key = smtpSecretKey(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['enc', 'smtp', 'v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decodeSmtpSecret(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('enc:smtp:v1:')) {
    const [, namespace, version, ivText, tagText, encryptedText] = trimmed.split(':');
    if (namespace !== 'smtp' || version !== 'v1' || !ivText || !tagText || !encryptedText) {
      throw new Error('SMTP password secret is malformed.');
    }
    const decipher = createDecipheriv('aes-256-gcm', smtpSecretKey(env), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  }
  const legacy = decodeLegacySmtpSecret(trimmed, env);
  if (!legacy && isLegacySmtpSecret(trimmed)) {
    throw new Error('Failed to decrypt SMTP password.');
  }
  return legacy ?? trimmed;
}

function envSmtpConfig(env: NodeJS.ProcessEnv): SmtpRuntimeConfig | null {
  const host = env.SMTP_HOST?.trim();
  const username = env.SMTP_USER?.trim();
  const password = env.SMTP_PASS ?? env.SMTP_PASSWORD ?? '';
  const fromEmail = env.SMTP_FROM_EMAIL?.trim() || username;
  if (!host || !username || !password || !fromEmail) return null;
  return {
    bccEmail: env.SMTP_BCC?.trim() || null,
    fromEmail,
    fromName: env.SMTP_FROM_NAME?.trim() || 'Support',
    host,
    password,
    port: Number.parseInt(env.SMTP_PORT ?? '', 10) || 587,
    replyToEmail: env.SMTP_REPLY_TO?.trim() || null,
    secure: truthy(env.SMTP_SECURE) || env.SMTP_PORT === '465',
    username
  };
}

async function sendSmtp(config: SmtpRuntimeConfig, message: EmailMessage): Promise<void> {
  const recipients = uniqueRecipients([
    ...asAddressList(message.to),
    ...asAddressList(message.bcc ?? config.bccEmail ?? [])
  ]);
  if (recipients.length === 0) throw new Error('Email recipient is required.');
  if (!config.host || !config.fromEmail || !config.username || !config.password) {
    if (allowDryRun(process.env)) return;
    throw new Error('SMTP configuration is incomplete.');
  }

  const session = await SmtpSession.connect(config);
  try {
    await session.ehlo();
    if (!config.secure && session.supportsStartTls) {
      await session.startTls(config.host);
      await session.ehlo();
    }
    await session.authPlain(config.username, config.password);
    await session.command(`MAIL FROM:<${config.fromEmail}>`, 250);
    for (const recipient of recipients) await session.command(`RCPT TO:<${recipient}>`, [250, 251]);
    await session.command('DATA', 354);
    await session.writeData(renderEmail(config, message));
    await session.command('QUIT', 221).catch(() => undefined);
  } finally {
    session.close();
  }
}

class SmtpSession {
  private buffer = '';
  private socket: net.Socket | tls.TLSSocket;
  supportsStartTls = false;

  private constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.socket.setEncoding('utf8');
    this.socket.on('data', chunk => {
      this.buffer += String(chunk);
    });
  }

  static async connect(config: SmtpRuntimeConfig): Promise<SmtpSession> {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    const session = new SmtpSession(socket);
    await session.waitForCode(220);
    return session;
  }

  async ehlo(): Promise<void> {
    const response = await this.command(`EHLO ${hostname()}`, 250);
    this.supportsStartTls = /\bSTARTTLS\b/i.test(response);
  }

  async startTls(servername: string): Promise<void> {
    await this.command('STARTTLS', 220);
    this.socket = tls.connect({ socket: this.socket, servername });
    this.socket.setEncoding('utf8');
    this.buffer = '';
    this.socket.on('data', chunk => {
      this.buffer += String(chunk);
    });
  }

  async authPlain(username: string, password: string): Promise<void> {
    const token = Buffer.from(`\0${username}\0${password}`).toString('base64');
    await this.command(`AUTH PLAIN ${token}`, 235);
  }

  async command(command: string, expected: number | number[]): Promise<string> {
    this.socket.write(`${command}\r\n`);
    return this.waitForCode(expected);
  }

  async writeData(content: string): Promise<void> {
    this.socket.write(`${content.replace(/\r?\n/g, '\r\n')}\r\n.\r\n`);
    await this.waitForCode(250);
  }

  close(): void {
    this.socket.destroy();
  }

  private waitForCode(expected: number | number[]): Promise<string> {
    const codes = Array.isArray(expected) ? expected : [expected];
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const poll = (): void => {
        const response = completedSmtpResponse(this.buffer);
        if (response) {
          this.buffer = this.buffer.slice(response.length);
          const code = Number.parseInt(response.slice(0, 3), 10);
          if (codes.includes(code)) resolve(response);
          else reject(new Error(`SMTP server returned ${code}: ${response.trim()}`));
          return;
        }
        if (Date.now() - startedAt > 30_000) {
          reject(new Error('SMTP server did not respond in time.'));
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });
  }
}

function completedSmtpResponse(value: string): string | null {
  const lines = value.split(/\r?\n/);
  if (lines.length < 2) return null;
  let consumed = '';
  for (const line of lines) {
    if (!line) continue;
    consumed += `${line}\r\n`;
    if (/^\d{3} /.test(line)) return consumed;
  }
  return null;
}

function renderEmail(config: SmtpRuntimeConfig, message: EmailMessage): string {
  const to = asAddressList(message.to).join(', ');
  const bcc = asAddressList(message.bcc ?? config.bccEmail ?? []).join(', ');
  const replyTo = message.replyTo ?? config.replyToEmail ?? '';
  const text = message.text ?? stripHtml(message.html ?? '');
  const html = message.html ?? escapeHtml(text).replace(/\n/g, '<br>');
  const boundary = `intraq-${randomBytes(12).toString('hex')}`;
  return [
    `From: ${formatSender(config.fromName, config.fromEmail)}`,
    `To: ${to}`,
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${message.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    `--${boundary}--`
  ].join('\r\n');
}

function smtpSecretKey(env: NodeJS.ProcessEnv): Buffer {
  const secret = env.SMTP_ENCRYPTION_KEY?.trim()
    || env.DATA_SOURCE_CONFIG_ENCRYPTION_KEY?.trim()
    || env.INTRAQ_SECRET_KEY?.trim()
    || env.ENCRYPTION_KEY?.trim()
    || env.AUTH_TOKEN_SECRET?.trim()
    || env.JWT_SECRET?.trim()
    || 'intraq-smtp-development-secret';
  return createHash('sha256').update(secret).digest();
}

function decodeLegacySmtpSecret(value: string, env: NodeJS.ProcessEnv): string | null {
  const [ivText, encryptedText, ...extra] = value.split(':');
  if (extra.length > 0 || !isLegacySmtpSecret(value)) return null;
  for (const secret of legacySmtpSecrets(env)) {
    try {
      const legacyIv = ivText ?? '';
      const legacyEncrypted = encryptedText ?? '';
      const key = scryptSync(secret, 'salt', 32);
      const decipher = createDecipheriv('aes-256-cbc', key, Buffer.from(legacyIv, 'hex'));
      return Buffer.concat([
        decipher.update(Buffer.from(legacyEncrypted, 'hex')),
        decipher.final()
      ]).toString('utf8');
    } catch {
      continue;
    }
  }
  return null;
}

function isLegacySmtpSecret(value: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}

function legacySmtpSecrets(env: NodeJS.ProcessEnv): string[] {
  return [
    env.SMTP_ENCRYPTION_KEY,
    env.ENCRYPTION_KEY,
    env.DATA_SOURCE_CONFIG_ENCRYPTION_KEY,
    env.INTRAQ_SECRET_KEY,
    env.AUTH_TOKEN_SECRET,
    env.JWT_SECRET,
    'fallback-32-char-key-for-encryption'
  ].map(value => value?.trim()).filter((value): value is string => Boolean(value));
}

function asAddressList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(item => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}

function uniqueRecipients(values: string[]): string[] {
  return [...new Set(values.map(item => item.trim()).filter(Boolean))];
}

function formatSender(name: string, email: string): string {
  return name ? `"${name.replace(/"/g, '\\"')}" <${email}>` : email;
}

function hostname(): string {
  return 'intraq.local';
}

function allowDryRun(env: NodeJS.ProcessEnv): boolean {
  if (truthy(env.SMTP_DRY_RUN) || truthy(env.SMTP_ALLOW_DRY_RUN)) return true;
  return env.NODE_ENV !== 'production';
}

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] ?? char));
}
