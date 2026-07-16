const PLURAL_TOKEN_EXCEPTIONS = new Set([
  'business',
  'cogs',
  'gross',
  'sales',
  'status',
  'tips'
]);

export function analyzerTokenSet(value: string): Set<string> {
  return new Set(analyzerTokens(value));
}

export function analyzerTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const original of value) {
    const uppercaseBoundary = original >= 'A' && original <= 'Z' && current.length > 0;
    if (uppercaseBoundary) {
      pushTokenWithVariants(tokens, current);
      current = '';
    }
    const character = original.toLowerCase();
    if (isTokenCharacter(character)) {
      current += character;
    } else if (current) {
      pushTokenWithVariants(tokens, current);
      current = '';
    }
  }
  if (current) pushTokenWithVariants(tokens, current);
  return uniqueTokens(tokens);
}

function pushTokenWithVariants(tokens: string[], token: string): void {
  tokens.push(token);
  const singular = singularTokenVariant(token);
  if (singular) tokens.push(singular);
}

function singularTokenVariant(token: string): string | null {
  if (token.length <= 3 || PLURAL_TOKEN_EXCEPTIONS.has(token)) return null;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ves') && token.length > 4) return `${token.slice(0, -3)}f`;
  if (
    token.endsWith('ches')
    || token.endsWith('shes')
    || token.endsWith('xes')
    || token.endsWith('zes')
    || token.endsWith('ses')
  ) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return null;
}

function isTokenCharacter(character: string): boolean {
  return character >= 'a' && character <= 'z' || character >= '0' && character <= '9';
}

function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(token);
  }
  return result;
}
