export function formatConfigList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.some(item => typeof item === 'object' && item !== null)
      ? JSON.stringify(value, null, 2)
      : value.join(', ');
  }
  return readString(value) ?? '';
}

export function formatConfigRecord(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value, null, 2);
  return '';
}

export function formatConfigJson(value: unknown): string {
  return value === undefined || value === null || value === '' ? '' : JSON.stringify(value, null, 2);
}

export function setStringConfig(config: Record<string, unknown>, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) {
    config[key] = trimmed;
  } else {
    delete config[key];
  }
}

export function stripVendorRendererConfig(config: Record<string, unknown>): void {
  delete config.plugins;
  delete config.scales;
  delete config.visualization;
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'field' in item) return readString((item as { field?: unknown }).field) ?? '';
      return '';
    }).filter((item): item is string => item.trim().length > 0);
  }
  const single = readString(value);
  return single ? [single] : [];
}

export function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function parseConfigList(
  source: string,
  label: string,
  setError: (message: string) => void
): unknown[] | null {
  const trimmed = source.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith('[')) return trimmed.split(',').map(field => field.trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to one user-facing error below.
  }
  setError(`${label} must be a JSON array or a comma-separated field list.`);
  return null;
}

export function parseConfigRecord(
  source: string,
  label: string,
  setError: (message: string) => void
): Record<string, string> | null {
  const trimmed = source.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed);
        if (entries.every((entry): entry is [string, string] => typeof entry[1] === 'string')) {
          return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1].trim().length > 0));
        }
      }
    } catch {
      // Fall through to one user-facing error below.
    }
    setError(`${label} must be a JSON object with string values.`);
    return null;
  }
  const entries = trimmed.split(',').map(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return null;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    return key && value ? [key, value] : null;
  });
  if (entries.every((entry): entry is [string, string] => Array.isArray(entry))) {
    return Object.fromEntries(entries);
  }
  setError(`${label} must be a JSON object or comma-separated key=value list.`);
  return null;
}

export function parseOptionalJson(
  source: string,
  label: string,
  setError: (message: string) => void
): unknown | null | undefined {
  const trimmed = source.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    setError(`${label} must be valid JSON.`);
    return null;
  }
}

export function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return '';
  return String(value);
}

export function parseFilterValue(value: string, operator: string): unknown {
  if (operator === 'is_null' || operator === 'is_not_null') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (operator === 'in' || operator === 'not_in') return trimmed.split(',').map(item => item.trim()).filter(Boolean);
  if (operator === 'between') {
    const parts = trimmed.split(/\s+(?:to|-)\s+|,/i).map(item => item.trim()).filter(Boolean);
    return parts.length >= 2 ? [parts[0], parts[1]] : trimmed;
  }
  return trimmed;
}
