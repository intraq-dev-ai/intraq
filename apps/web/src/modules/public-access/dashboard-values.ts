export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

export function formatMetricValue(value: unknown, config: Record<string, unknown>): string {
  const numeric = readNumeric(value);
  const prefix = readString(config.prefix) ?? '';
  const suffix = readString(config.suffix) ?? '';
  if (numeric === null) return `${prefix}${formatCellValue(value)}${suffix}`;
  const precision = readPositiveInteger(config.precision) ?? 1;
  const formatType = readString(config.formatType)?.toLowerCase();
  if (formatType === 'currency') {
    return new Intl.NumberFormat('en-AU', {
      currency: readString(config.currency) ?? 'AUD',
      maximumFractionDigits: 0,
      style: 'currency'
    }).format(numeric);
  }
  if (formatType === 'percentage') {
    const normalized = Math.abs(numeric) > 1 ? numeric / 100 : numeric;
    return new Intl.NumberFormat('en-AU', {
      maximumFractionDigits: precision,
      style: 'percent'
    }).format(normalized);
  }
  return `${prefix}${new Intl.NumberFormat('en-AU', { maximumFractionDigits: precision, notation: 'compact' }).format(numeric)}${suffix}`;
}

export function labelFor(value: string): string {
  return value.split('_').filter(Boolean).map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

export function readNumeric(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function readPositiveInteger(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPresent<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
