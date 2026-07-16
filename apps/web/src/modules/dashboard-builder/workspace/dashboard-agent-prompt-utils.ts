import { wordsFromText } from '../agent-context/text-normalization';

export function modelNameFromSummary(summary: string | undefined): string {
  const text = summary ?? '';
  const start = text.indexOf('#');
  if (start < 0) return '';
  const stopChars = new Set([':', '\n', '.']);
  let end = start + 1;
  while (end < text.length && !stopChars.has(text[end] ?? '')) end += 1;
  return text.slice(start + 1, end).trim();
}

export function parseComponentsFromText(text: string): Array<{ type: string; description: string }> {
  const parts = splitComponentDescriptions(text);
  if (parts.length < 2) return [];

  return parts.map(part => {
    const words = new Set(wordsFromText(part));
    let type = 'chart';
    if (hasAnyToken(words, ['pie', 'donut', 'doughnut'])) type = 'pie';
    else if (hasAnyToken(words, ['column', 'clustered']) || (words.has('vertical') && words.has('bar'))) type = 'column';
    else if (hasAnyToken(words, ['bar', 'horizontal'])) type = 'bar';
    else if (hasAnyToken(words, ['line', 'trend'])) type = 'line';
    else if (words.has('area')) type = 'area';
    else if (hasAnyToken(words, ['table', 'list', 'grid'])) type = 'table';
    else if (hasAnyToken(words, ['matrix', 'pivot'])) type = 'matrix';
    else if (hasAnyToken(words, ['filter', 'selector', 'picker', 'dropdown'])) type = 'filter';
    else if (hasAnyToken(words, ['card', 'kpi', 'metric', 'summary', 'score'])) type = 'card';
    return { type, description: part };
  });
}

function splitComponentDescriptions(text: string): string[] {
  const rawParts: string[] = [];
  let current = '';
  for (const char of text) {
    if (char === ',' || char === ';' || char === '\n') {
      if (current.trim()) rawParts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) rawParts.push(current.trim());
  return rawParts.flatMap(splitOnAnd).filter(part => part.length > 4);
}

function splitOnAnd(text: string): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.toLowerCase().includes(' and ')) {
    const index = remaining.toLowerCase().indexOf(' and ');
    const before = remaining.slice(0, index).trim();
    if (before) parts.push(before);
    remaining = remaining.slice(index + 5);
  }
  if (remaining.trim()) parts.push(remaining.trim());
  return parts;
}

function hasAnyToken(words: Set<string>, tokens: string[]): boolean {
  return tokens.some(token => words.has(token));
}
