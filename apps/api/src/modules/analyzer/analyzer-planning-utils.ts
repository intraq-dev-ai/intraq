const STOP_WORDS = new Set([
  'the', 'and', 'for', 'from', 'this', 'that', 'with', 'when', 'what', 'which',
  'where', 'were', 'using', 'users', 'about', 'does', 'doing', 'brings',
  'show', 'give', 'tell', 'need', 'want'
]);

const MODEL_IDENTITY_STOP_WORDS = new Set([
  'business', 'data', 'daily', 'model', 'performance', 'source', 'table'
]);

export function weightedTermsFor(weight: number, values: unknown[]): Array<{ value: string; weight: number }> {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => ({ value, weight }));
}

export function routingRecordsFor(dictionary: Record<string, unknown>): Record<string, unknown>[] {
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  return [ai.routing, dictionary.routing].filter(isRecord);
}

export function weightedTermScore(question: string, term: string, weight: number): number {
  const normalizedQuestion = normalizeForSearch(question);
  if (searchTermsFor(term).some(searchTerm => normalizedQuestion.includes(searchTerm))) {
    return weight * (term.trim().includes(' ') ? 3 : 2);
  }

  const questionTokens = new Set(significantTokens(question));
  const tokens = significantTokens(term);
  if (tokens.length === 0) return 0;

  const matched = tokens.filter(token => questionTokens.has(token)).length;
  if (matched === 0) return 0;
  if (tokens.length === 1) return weight;
  if (matched === tokens.length) return weight * 2;
  if (tokens.length <= 4) return weight;
  return matched >= Math.ceil(tokens.length * 0.6) ? weight : 0;
}

export function hasAnyTerm(question: string, terms: string[]): boolean {
  const normalizedQuestion = normalizeForSearch(question);
  return terms.some(term => searchTermsFor(term).some(searchTerm => normalizedQuestion.includes(searchTerm)));
}

export function modelIdentityScore(question: string, values: unknown[]): number {
  const questionTokens = new Set(identityTokensFor(question));
  const identityTokens = new Set(values
    .filter((value): value is string => typeof value === 'string')
    .flatMap(identityTokensFor)
  );
  return Array.from(identityTokens).filter(token => questionTokens.has(token)).length * 12;
}

export function normalizeForSearch(value: string): string {
  const normalized: string[] = [];
  let previousWasSpace = true;
  for (const character of value.toLowerCase()) {
    const next = character === '_' ? ' ' : isSearchCharacter(character) ? character : ' ';
    if (next === ' ') {
      if (!previousWasSpace) normalized.push(next);
      previousWasSpace = true;
    } else {
      normalized.push(next);
      previousWasSpace = false;
    }
  }
  return normalized.join('').trim();
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function readBoolean(value: unknown): boolean {
  return value === true;
}

export function hasReadableMetadata(metadata: Record<string, unknown> | undefined): boolean {
  return Boolean(metadata && [
    metadata.label,
    metadata.businessName,
    metadata.businessDefinition,
    metadata.description,
    metadata.dictionaryDescription,
    metadata.semanticType,
    metadata.metricType,
    metadata.role,
    metadata.columnType,
    metadata.semanticRole,
    ...readStringArray(metadata.aliases),
    ...readStringArray(metadata.synonyms),
    ...readStringArray(metadata.sampleQuestions)
  ].some(value => typeof value === 'string' && value.trim().length > 0));
}

export function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function toLabel(value: string): string {
  return value.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function searchTermsFor(term: string): string[] {
  const normalized = normalizeForSearch(term);
  if (!normalized) return [];
  const terms = new Set([normalized]);
  if (normalized.endsWith('ies')) terms.add(`${normalized.slice(0, -3)}y`);
  if (normalized.endsWith('s')) terms.add(normalized.slice(0, -1));
  return Array.from(terms);
}

function significantTokens(value: string): string[] {
  return searchTokens(value).filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

function identityTokensFor(value: string): string[] {
  return significantTokens(value).filter(token => !MODEL_IDENTITY_STOP_WORDS.has(token));
}

export function searchTokens(value: string): string[] {
  const normalized = normalizeForSearch(value);
  const tokens: string[] = [];
  let current = '';
  for (const character of normalized) {
    if (character === ' ') {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function isSearchCharacter(character: string): boolean {
  return character >= 'a' && character <= 'z' || character >= '0' && character <= '9';
}
