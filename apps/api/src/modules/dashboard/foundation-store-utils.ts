import { uuidv7 } from '@intraq/contracts';

export function uniqueId(records: Map<string, unknown>): string {
  let id = uuidv7();
  while (records.has(id)) id = uuidv7();
  return id;
}

export function requestedOrUniqueId(value: unknown, records: Map<string, unknown>): string {
  const requested = optionalString(value);
  return requested && !records.has(requested) ? requested : uniqueId(records);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function cloneOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : clone(value);
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? clone(value) : {};
}

export function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord).map(clone) : [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
