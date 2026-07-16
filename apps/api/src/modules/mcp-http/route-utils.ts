import type { IncomingHttpHeaders, ServerResponse } from 'node:http';
import type { JsonRpcId } from './route-types.js';

export function isMcpPath(pathname: string): boolean {
  return pathname === '/mcp' || pathname === '/api/mcp';
}

export function rpcSuccess(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id, result };
}

export function rpcError(id: JsonRpcId, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export function readRpcId(value: unknown): JsonRpcId {
  return typeof value === 'string' || typeof value === 'number' || value === null ? value : null;
}

export function readHeader(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function writeJson(res: ServerResponse, statusCode: number, payload: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(payload);
  writeCors(res, statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    ...headers
  });
  res.end(body);
}

export function writeCors(res: ServerResponse, statusCode: number, headers: Record<string, string> = {}): void {
  res.writeHead(statusCode, {
    'access-control-allow-headers': 'authorization, content-type, mcp-session-id',
    'access-control-allow-methods': 'DELETE, OPTIONS, POST',
    'access-control-allow-origin': '*',
    ...headers
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
