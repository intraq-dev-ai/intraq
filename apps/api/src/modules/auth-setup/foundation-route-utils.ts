import type { ServerResponse } from 'node:http';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function setupValidationMessage(body: unknown): string {
  if (!isRecord(body)) return 'Setup body must be an object';
  const requiredFields = [
    'companyName',
    'adminFirstName',
    'adminLastName',
    'adminEmail',
    'adminPassword'
  ];
  const missingField = requiredFields.find(field => !isNonEmptyString(body[field]));
  if (missingField) return `${missingField} is required`;
  if (String(body.adminPassword).length < 8) return 'adminPassword must be at least 8 characters';
  return '';
}

export function sendRawJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}
