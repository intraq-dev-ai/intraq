import type { BuilderFieldReference } from '@intraq/contracts';
import type { BuilderDataField, BuilderDataTable } from '../types';

export function dashboardAgentFieldReferences(
  prompt: string,
  table: BuilderDataTable | null
): BuilderFieldReference[] {
  if (!table?.fields.length) return [];
  const fieldsByName = new Map(table.fields.map(field => [field.name, field]));
  const references: BuilderFieldReference[] = [];
  const seen = new Set<string>();
  for (const token of mentionTokens(prompt)) {
    const field = fieldsByName.get(token.slice(1));
    if (!field || seen.has(field.name)) continue;
    seen.add(field.name);
    references.push({
      exact: true,
      field: field.name,
      label: field.label ?? field.description ?? field.name,
      role: fieldRole(field),
      token
    });
  }
  return references;
}

function mentionTokens(value: string): string[] {
  const tokens: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    if (value[cursor] !== '@') {
      cursor += 1;
      continue;
    }
    const start = cursor;
    cursor += 1;
    let token = '';
    while (cursor < value.length && isFieldTokenCharacter(value[cursor])) {
      token += value[cursor];
      cursor += 1;
    }
    if (token) tokens.push(`${value[start]}${token}`);
  }
  return tokens;
}

function isFieldTokenCharacter(char: string): boolean {
  const code = char.charCodeAt(0);
  return char === '_'
    || char === '.'
    || char === '-'
    || (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122);
}

function fieldRole(field: BuilderDataField): string {
  return field.columnType ?? field.role ?? field.semanticRole ?? field.type;
}
