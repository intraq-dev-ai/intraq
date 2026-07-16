import { randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return encodeHash(SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, hash);
}

export function hashSeedPassword(password: string, saltText: string): string {
  const salt = Buffer.from(saltText, 'utf8');
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return encodeHash(SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, hash);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseScryptHash(storedHash);
  if (!parsed) return verifyLegacyBcryptPassword(password, storedHash);
  const candidate = await scryptAsync(password, parsed.salt, parsed.hash.length, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p
  }) as Buffer;
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

async function verifyLegacyBcryptPassword(password: string, storedHash: string): Promise<boolean> {
  const normalizedHash = normalizeLegacyBcryptHash(storedHash);
  if (!normalizedHash) return false;
  try {
    return await bcrypt.compare(password, normalizedHash);
  } catch {
    return false;
  }
}

function normalizeLegacyBcryptHash(storedHash: string): string | null {
  const trimmed = storedHash.trim();
  if (/^\$2[ab]\$\d{2}\$/.test(trimmed)) return trimmed;
  if (/^\$2y\$\d{2}\$/.test(trimmed)) return `$2b$${trimmed.slice(4)}`;
  return null;
}

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; p: number; r: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function encodeHash(n: number, r: number, p: number, salt: Buffer, hash: Buffer): string {
  return ['scrypt', n, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

function parseScryptHash(value: string): { hash: Buffer; n: number; p: number; r: number; salt: Buffer } | null {
  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = value.split('$');
  if (algorithm !== 'scrypt' || !rawN || !rawR || !rawP || !rawSalt || !rawHash) return null;
  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  return {
    n,
    r,
    p,
    salt: Buffer.from(rawSalt, 'base64'),
    hash: Buffer.from(rawHash, 'base64')
  };
}
