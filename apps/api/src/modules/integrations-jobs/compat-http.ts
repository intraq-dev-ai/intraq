import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { isRecord } from './shared.js';

export function sendCompatJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendCompatBadRequest(res: ServerResponse, message: string): void {
  sendCompatJson(res, 400, fail(message));
}

export function sendCompatNotFound(res: ServerResponse, message: string): void {
  sendCompatJson(res, 404, fail(message));
}

export async function readCompatBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};

  const rawBody = Buffer.concat(chunks).toString('utf8');
  const contentType = String(req.headers?.['content-type'] ?? '');
  if (contentType.includes('multipart/form-data')) {
    return parseMultipartBody(rawBody, contentType);
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

export async function readCompatRecord(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const body = await readCompatBody(req);
  return isRecord(body) ? body : null;
}

function parseMultipartBody(rawBody: string, contentType: string): Record<string, unknown> {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  if (!boundary) return {};

  const result: Record<string, unknown> = {};
  for (const part of rawBody.split(`--${boundary}`)) {
    const separatorIndex = part.indexOf('\r\n\r\n');
    if (separatorIndex < 0) continue;

    const header = part.slice(0, separatorIndex);
    const content = part.slice(separatorIndex + 4).replace(/\r\n--$/, '').replace(/\r\n$/, '');
    const name = /name="([^"]+)"/.exec(header)?.[1];
    if (!name) continue;

    const fileName = /filename="([^"]*)"/.exec(header)?.[1];
    if (fileName) {
      result.fileName = fileName;
      result.fileContent = content;
      result.fileSize = Buffer.byteLength(content);
      result.contentType = /Content-Type:\s*([^\r\n]+)/i.exec(header)?.[1] ?? 'application/octet-stream';
    } else {
      result[name] = content;
    }
  }
  return result;
}
