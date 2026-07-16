export function termScore(prompt: string, value: unknown): number {
  const term = readString(value);
  if (!term) return 0;
  const normalizedPrompt = normalizeText(prompt);
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return 0;
  if (normalizedPrompt.includes(normalizedTerm)) return normalizedTerm.includes(' ') ? 4 : 2;
  const promptTokens = new Set(splitWords(normalizedPrompt).filter(token => token.length > 2));
  const termTokens = splitWords(normalizedTerm).filter(token => token.length > 2);
  const matches = termTokens.filter(token => promptTokens.has(token)).length;
  return matches === 0 ? 0 : matches;
}

export function listScore(prompt: string, value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((score, item) => score + termScore(prompt, item), 0);
  }
  return termScore(prompt, value);
}

export function normalizeText(value: string): string {
  return splitWords(value.toLowerCase().replaceAll('_', ' ')).join(' ');
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export function readBoolean(value: unknown): boolean {
  return value === true;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function slugify(value: string): string {
  return normalizeText(value).replaceAll(' ', '-') || 'data-model';
}

export function toLabel(value: string): string {
  return value
    .split('_')
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function splitWords(value: string): string[] {
  const words: string[] = [];
  let current = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLower = code >= 97 && code <= 122;
    const isUpper = code >= 65 && code <= 90;
    if (isDigit || isLower || isUpper) {
      current += char.toLowerCase();
    } else if (current) {
      words.push(current);
      current = '';
    }
  }
  if (current) words.push(current);
  return words;
}
