import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, ok, type ApiFailure, type ApiSuccess } from '@intraq/contracts';

export function sendJson<TData>(
  res: ServerResponse,
  statusCode: number,
  payload: ApiSuccess<TData> | ApiFailure
): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendOk<TData>(res: ServerResponse, data: TData): void {
  sendJson(res, 200, ok(data));
}

export function sendCreated<TData>(res: ServerResponse, data: TData): void {
  sendJson(res, 201, ok(data));
}

export function sendBadRequest(res: ServerResponse, message: string): void {
  sendJson(res, 400, fail(message));
}

export function sendUnauthorized(res: ServerResponse, message = 'Authentication is required.'): void {
  sendJson(res, 401, fail(message));
}

export function sendForbidden(res: ServerResponse, message = 'Access is forbidden.'): void {
  sendJson(res, 403, fail(message));
}

export function sendNotFound(res: ServerResponse): void {
  sendJson(res, 404, fail('Route not found.'));
}

export function sendInternalServerError(res: ServerResponse): void {
  sendJson(res, 500, fail('Internal server error.'));
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return null;
  }
}
