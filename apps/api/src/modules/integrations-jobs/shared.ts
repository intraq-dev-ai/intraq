export const fixedNow = '2026-05-02T00:00:00.000Z';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function decodePart(value: string): string {
  return decodeURIComponent(value);
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

export function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readOffset(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseCsv(content: string): { fields: Array<{ name: string; type: string; description: string }>; rows: Array<Record<string, string>> } {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return { fields: [], rows: [] };

  const headers = splitCsvLine(lines[0] ?? '').map(header => header.trim()).filter(Boolean);
  const rows = lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });

  return {
    fields: headers.map(name => ({ name, type: 'string', description: name })),
    rows
  };
}

export function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values.map(value => value.replace(/^"|"$/g, ''));
}

export function fileExtension(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  return match?.[0] ?? '';
}
