import type { BuilderDataField } from '../../types';

export function tableLabel(table: { name: string; dictionary?: { businessName?: string } }): string {
  return table.dictionary?.businessName ?? table.name;
}

export function inputValue(event: Event): string {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return target.value;
  }
  return '';
}

export function fieldLabel(field: BuilderDataField): string {
  return field.label ?? field.description ?? field.name;
}

export function namedFieldLabel(
  fieldName: string,
  fields: BuilderDataField[],
  configuredLabels: Record<string, string> = {}
): string {
  const configured = configuredLabels[fieldName];
  if (typeof configured === 'string' && configured.trim().length > 0) return configured.trim();
  const match = fields.find(field => field.name === fieldName);
  return match ? fieldLabel(match) : fieldName;
}

export function parseList(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'field' in item) {
            const field = (item as { field?: unknown }).field;
            return typeof field === 'string' ? field : '';
          }
          return '';
        }).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return trimmed.split(',').map(item => item.trim()).filter(Boolean);
}

export function parseColorRecord(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(Object.entries(parsed)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      }
    } catch {
      return out;
    }
  }
  for (const pair of text.split(',')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

export function jsonArrayCount(text: string): number {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
