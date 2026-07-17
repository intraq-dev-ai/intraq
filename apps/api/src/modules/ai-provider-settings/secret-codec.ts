import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SECRET_PREFIX = 'enc:v1:';

export function encodeSecret(secret: string, env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = secret.trim();
  const key = encryptionKey(env);
  if (!key || trimmed.length === 0) return trimmed;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SECRET_PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
}

export function decodeSecret(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith(SECRET_PREFIX)) return trimmed;

  const key = encryptionKey(env);
  if (!key) throw new Error('AI provider encryption key is required to read encrypted API keys.');

  const [, version, ivText, tagText, encryptedText] = trimmed.split(':');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw new Error('AI provider secret is malformed.');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function encryptionKey(env: NodeJS.ProcessEnv): Buffer | null {
  const secret = env.AI_CONFIGURATION_ENCRYPTION_KEY?.trim()
    || env.AUTH_TOKEN_SECRET?.trim()
    || env.SESSION_SECRET?.trim()
    || env.ENCRYPTION_KEY?.trim()
    || '';
  return secret ? createHash('sha256').update(secret).digest() : null;
}
