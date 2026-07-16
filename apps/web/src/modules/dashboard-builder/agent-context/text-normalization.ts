export function normalizeSearchText(value: string): string {
  return wordsFromText(value).join(' ');
}

export function wordsFromText(value: string): string[] {
  const words: string[] = [];
  let current = '';
  for (const char of value.toLowerCase()) {
    if (isAlphaNumeric(char)) {
      current += char;
    } else if (current) {
      words.push(current);
      current = '';
    }
  }
  if (current) words.push(current);
  return words;
}

export function hasAnyWord(value: string, terms: string[]): boolean {
  const words = new Set(wordsFromText(value));
  return terms.some(term => {
    const termWords = wordsFromText(term);
    return termWords.length > 0 && termWords.every(word => words.has(word));
  });
}

export function slugFromText(value: string, fallback: string): string {
  return wordsFromText(value).join('-') || fallback;
}

function isAlphaNumeric(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}
