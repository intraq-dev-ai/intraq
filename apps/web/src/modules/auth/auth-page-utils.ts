export function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function safeRedirectPath(value: unknown, fallback: string): string {
  const redirect = firstString(value);
  return redirect?.startsWith('/') ? redirect : fallback;
}

export function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) return firstString(value[0]);
  return undefined;
}
