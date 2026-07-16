type Token =
  | { type: 'identifier'; value: string }
  | { type: 'number'; value: number }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'paren'; value: '(' | ')' };

export function compareCalculatedValues(actual: unknown, operator: string, expected: unknown): boolean {
  const normalized = operator.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const left = comparableValue(actual);
  const right = comparableValue(expected);
  if (normalized === '==' || normalized === '=' || normalized === 'equals' || normalized === 'is') return left === right;
  if (normalized === '!=' || normalized === '<>' || normalized === 'notequals' || normalized === 'isnot') return left !== right;
  if (normalized === '>' || normalized === 'gt' || normalized === 'greaterthan') return numericCompare(actual, expected, (a, b) => a > b);
  if (normalized === '<' || normalized === 'lt' || normalized === 'lessthan') return numericCompare(actual, expected, (a, b) => a < b);
  if (normalized === '>=' || normalized === 'gte' || normalized === 'greaterthanorequal') return numericCompare(actual, expected, (a, b) => a >= b);
  if (normalized === '<=' || normalized === 'lte' || normalized === 'lessthanorequal') return numericCompare(actual, expected, (a, b) => a <= b);
  if (normalized === 'contains') return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
  if (normalized === 'notcontains') return !String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
  if (normalized === 'in') return listValues(expected).map(comparableValue).includes(left);
  if (normalized === 'notin') return !listValues(expected).map(comparableValue).includes(left);
  if (normalized === 'between') {
    const [start, end] = rangeValues(expected);
    return numericCompare(actual, start, (a, b) => a >= b) && numericCompare(actual, end, (a, b) => a <= b);
  }
  return left === right;
}

export function dateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function evaluateBooleanExpression(condition: string, row: Record<string, unknown>): boolean {
  const orConditions = splitBooleanExpression(condition, 'or');
  if (orConditions.length > 1) return orConditions.some(item => evaluateBooleanExpression(item, row));
  const andConditions = splitBooleanExpression(condition, 'and');
  if (andConditions.length > 1) return andConditions.every(item => evaluateBooleanExpression(item, row));
  const match = condition.match(/\$?\{?\[?([A-Za-z0-9_ .-]+)\]?\}?\s*(>=|<=|==|!=|<>|>|<|=|contains|not contains|not_contains|in|not in|not_in)\s*["']?([^"']+)["']?/i);
  if (!match) {
    const field = condition.replace(/^\$?\{?|\}?$/g, '').trim();
    return field.length > 0 && Boolean(row[field]);
  }
  return compareCalculatedValues(row[match[1]?.trim() ?? ''], match[2] ?? '==', parseLiteral(match[3]));
}

export function evaluateExpression(expression: string, row: Record<string, unknown>): number | null {
  const caseValue = evaluateCaseExpression(expression, row);
  if (caseValue !== undefined) return caseValue;
  const tokens = tokenize(expression);
  if (tokens.length === 0) return null;
  let index = 0;

  const parseExpression = (): number => {
    let value = parseTerm();
    while (isOperator(tokens[index], '+') || isOperator(tokens[index], '-')) {
      const operator = tokens[index]?.value;
      index += 1;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (isOperator(tokens[index], '*') || isOperator(tokens[index], '/')) {
      const operator = tokens[index]?.value;
      index += 1;
      const right = parseFactor();
      value = operator === '*' ? value * right : right === 0 ? Number.NaN : value / right;
    }
    return value;
  };

  const parseFactor = (): number => {
    const token = tokens[index];
    if (!token) return Number.NaN;
    if (token.type === 'operator' && token.value === '-') {
      index += 1;
      return -parseFactor();
    }
    if (token.type === 'number') {
      index += 1;
      return token.value;
    }
    if (token.type === 'identifier') {
      index += 1;
      return numericValue(row[token.value]);
    }
    if (token.type === 'paren' && token.value === '(') {
      index += 1;
      const value = parseExpression();
      if (tokens[index]?.type === 'paren' && tokens[index]?.value === ')') index += 1;
      return value;
    }
    return Number.NaN;
  };

  const value = parseExpression();
  return index === tokens.length && Number.isFinite(value) ? value : null;
}

function evaluateCaseExpression(expression: string, row: Record<string, unknown>): number | null | undefined {
  const trimmed = expression.trim();
  if (!/^case\b/i.test(trimmed)) return undefined;
  const body = stripCaseWrapper(trimmed);
  if (!body) return nullValue();
  let index = 0;
  while (index < body.length) {
    const whenIndex = findTopLevelKeyword(body, 'when', index);
    if (whenIndex < 0) break;
    const thenIndex = findTopLevelKeyword(body, 'then', whenIndex + 4);
    if (thenIndex < 0) return nullValue();
    const nextWhenIndex = findTopLevelKeyword(body, 'when', thenIndex + 4);
    const elseIndex = findTopLevelKeyword(body, 'else', thenIndex + 4);
    const resultEnd = positiveMin(nextWhenIndex, elseIndex, body.length);
    const condition = body.slice(whenIndex + 4, thenIndex).trim();
    const resultExpression = body.slice(thenIndex + 4, resultEnd).trim();
    if (evaluateBooleanExpression(condition, row)) return evaluateCaseResult(resultExpression, row);
    if (elseIndex >= 0 && (nextWhenIndex < 0 || elseIndex < nextWhenIndex)) {
      return evaluateCaseResult(body.slice(elseIndex + 4).trim(), row);
    }
    index = nextWhenIndex;
    if (index < 0) break;
  }
  const elseIndex = findTopLevelKeyword(body, 'else', 0);
  return elseIndex >= 0 ? evaluateCaseResult(body.slice(elseIndex + 4).trim(), row) : nullValue();
}

function evaluateCaseResult(expression: string, row: Record<string, unknown>): number {
  if (/^case\b/i.test(expression)) return evaluateCaseExpression(expression, row) ?? 0;
  return evaluateExpression(expression, row) ?? numericValue(parseLiteral(expression));
}

function stripCaseWrapper(expression: string): string {
  const withoutCase = expression.replace(/^case\b/i, '').trim();
  return withoutCase.replace(/\bend\s*$/i, '').trim();
}

function findTopLevelKeyword(input: string, keyword: string, startIndex: number): number {
  let nestedCaseDepth = 0;
  let quote: '"' | "'" | null = null;
  let bracketDepth = 0;
  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index];
    if (!char) continue;
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      continue;
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (bracketDepth > 0) continue;
    const word = readWordAt(input, index);
    if (!word) continue;
    if (word.toLowerCase() === 'case') {
      nestedCaseDepth += 1;
      index += word.length - 1;
      continue;
    }
    if (word.toLowerCase() === 'end') {
      nestedCaseDepth = Math.max(0, nestedCaseDepth - 1);
      index += word.length - 1;
      continue;
    }
    if (nestedCaseDepth === 0 && word.toLowerCase() === keyword) return index;
    index += word.length - 1;
  }
  return -1;
}

function splitBooleanExpression(expression: string, operator: 'and' | 'or'): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote: '"' | "'" | null = null;
  let bracketDepth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (!char) continue;
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      continue;
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (bracketDepth > 0) continue;
    const word = readWordAt(expression, index);
    if (!word || word.toLowerCase() !== operator) continue;
    parts.push(expression.slice(start, index).trim());
    start = index + word.length;
    index += word.length - 1;
  }
  if (parts.length === 0) return [expression.trim()];
  parts.push(expression.slice(start).trim());
  return parts.filter(Boolean);
}

function readWordAt(input: string, index: number): string | null {
  if (!/[A-Za-z_]/.test(input[index] ?? '')) return null;
  if (index > 0 && /[A-Za-z0-9_]/.test(input[index - 1] ?? '')) return null;
  let end = index + 1;
  while (/[A-Za-z0-9_]/.test(input[end] ?? '')) end += 1;
  return input.slice(index, end);
}

function positiveMin(...values: number[]): number {
  return Math.min(...values.filter(value => value >= 0));
}

function nullValue(): null {
  return null;
}

export function interpolateTemplate(template: string, row: Record<string, unknown>): string {
  return template
    .replace(/\[([^\]]+)\]/g, (_, field: string) => String(row[field.trim()] ?? ''))
    .replace(/\$\{([^}]+)\}/g, (_, field: string) => String(row[field.trim()] ?? ''));
}

export function numericValue(value: unknown): number {
  const numeric = Number(typeof value === 'string' ? value.replace(/[,$%]/g, '').trim() : value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function comparableValue(value: unknown): number | string {
  const numeric = Number(typeof value === 'string' ? value.replace(/[,$%]/g, '').trim() : value);
  return Number.isFinite(numeric) ? numeric : String(value ?? '').toLowerCase();
}

function isOperator(token: Token | undefined, value: '+' | '-' | '*' | '/'): token is Extract<Token, { type: 'operator' }> {
  return token?.type === 'operator' && token.value === value;
}

function listValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}

function numericCompare(left: unknown, right: unknown, compare: (left: number, right: number) => boolean): boolean {
  const leftNumeric = numericValue(left);
  const rightNumeric = numericValue(right);
  return Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric) && compare(leftNumeric, rightNumeric);
}

function parseLiteral(value: string | undefined): unknown {
  const raw = value?.trim() ?? '';
  if (/^true$/i.test(raw)) return true;
  if (/^false$/i.test(raw)) return false;
  const numeric = Number(raw);
  return raw !== '' && Number.isFinite(numeric) ? numeric : raw;
}

function rangeValues(value: unknown): [unknown, unknown] {
  if (Array.isArray(value)) return [value[0], value[1]];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record.start ?? record.from ?? record.min, record.end ?? record.to ?? record.max];
  }
  return [undefined, undefined];
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (!char || /\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '[') {
      const end = expression.indexOf(']', index + 1);
      if (end < 0) return [];
      const value = expression.slice(index + 1, end).trim();
      if (value) tokens.push({ type: 'identifier', value });
      index = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (/[A-Za-z0-9_]/.test(expression[end] ?? '')) end += 1;
      tokens.push({ type: 'identifier', value: expression.slice(index, end) });
      index = end;
      continue;
    }
    if (/\d|\./.test(char)) {
      let end = index + 1;
      while (/[\d.]/.test(expression[end] ?? '')) end += 1;
      const value = Number(expression.slice(index, end));
      if (!Number.isFinite(value)) return [];
      tokens.push({ type: 'number', value });
      index = end;
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }
    return [];
  }
  return tokens;
}
