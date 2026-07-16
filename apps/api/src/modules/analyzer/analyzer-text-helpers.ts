import { analyzerTokensFromText } from './analyzer-plan-field-matching.js';

export function startsWithPhrase(value: string, phrase: string): boolean {
  return value === phrase || value.startsWith(`${phrase} `);
}

export function tokenSet(values: string[]): Set<string> {
  return new Set(values.flatMap(analyzerTokensFromText));
}

export function toDisplayLabel(value: string): string {
  return splitIdentifier(value)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function splitIdentifier(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let previousKind: 'lower' | 'upper' | 'digit' | 'separator' = 'separator';
  for (const character of value) {
    const kind = characterKind(character);
    if (kind === 'separator') {
      if (current) parts.push(current);
      current = '';
      previousKind = kind;
      continue;
    }
    if (current && kind === 'upper' && (previousKind === 'lower' || previousKind === 'digit')) {
      parts.push(current);
      current = character;
    } else {
      current += character;
    }
    previousKind = kind;
  }
  if (current) parts.push(current);
  return parts;
}

function characterKind(character: string): 'lower' | 'upper' | 'digit' | 'separator' {
  if (character >= 'a' && character <= 'z') return 'lower';
  if (character >= 'A' && character <= 'Z') return 'upper';
  if (character >= '0' && character <= '9') return 'digit';
  return 'separator';
}
