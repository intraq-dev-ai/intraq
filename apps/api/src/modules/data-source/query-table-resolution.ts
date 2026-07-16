import type { DataSourceRecord } from './foundation-store.js';

type TableRecord = DataSourceRecord['tables'][number];

export function findReferencedTable(source: DataSourceRecord, query: string): TableRecord | undefined {
  const exactReferences = referencedTableNames(query);
  const exact = source.tables.find(table =>
    exactReferences.has(normalizeIdentifier(table.name)) || exactReferences.has(normalizeIdentifier(table.id))
  );
  if (exact) return exact;

  const normalized = query.toLowerCase();
  return source.tables.find(table =>
    normalized.includes(table.name.toLowerCase()) || normalized.includes(table.id.toLowerCase())
  );
}

export function referencedTableNames(query: string): Set<string> {
  const names = new Set<string>();
  const tableReference = /\b(?:from|join)\s+((?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[a-z_][\w$]*)(?:\s*\.\s*(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[a-z_][\w$]*))*)/gi;
  for (const match of query.matchAll(tableReference)) {
    const name = lastIdentifierPart(match[1] ?? '');
    if (name) names.add(normalizeIdentifier(name));
  }
  return names;
}

function lastIdentifierPart(value: string): string {
  const parts = value.split(/\s*\.\s*/).filter(Boolean);
  return parts.at(-1) ?? '';
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1).replaceAll(']]', ']').toLowerCase();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
    return trimmed.slice(1, -1).toLowerCase();
  }
  return trimmed.toLowerCase();
}
