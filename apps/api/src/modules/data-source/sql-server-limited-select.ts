interface SqlToken {
  depth: number;
  end: number;
  kind: 'number' | 'opaque' | 'symbol' | 'variable' | 'word';
  start: number;
  value: string;
}

interface SqlTokenization {
  balanced: boolean;
  tokens: SqlToken[];
}

/**
 * Wraps a read-only SQL Server SELECT with an outer limit. Leading CTEs stay
 * outside the derived table because SQL Server does not allow WITH inside one.
 * An outer ORDER BY is retained only when a bounded TOP form makes it legal and
 * semantically necessary in that derived table.
 */
export function buildSqlServerLimitedSelect(query: string, limit: number): string {
  const tokenization = tokenizeSql(query);
  const topLevel = tokenization.tokens.filter(token => token.depth === 0);
  const firstWord = topLevel.find(token => token.kind === 'word');
  const mainSelect = topLevel.find(token => token.kind === 'word' && token.value === 'select');
  const hasLeadingCte = tokenization.balanced
    && firstWord?.value === 'with'
    && mainSelect !== undefined
    && mainSelect !== firstWord;
  const mainStart = hasLeadingCte ? mainSelect.start : 0;
  const orderByStart = mainSelect
    ? topLevelOrderByStart(topLevel, mainSelect.start)
    : -1;
  const preserveOrder = tokenization.balanced
    && mainSelect !== undefined
    && hasSafeTop(query, tokenization.tokens, mainSelect);
  const mainEnd = !preserveOrder && orderByStart >= mainStart ? orderByStart : query.length;
  const derivedQuery = query.slice(mainStart, mainEnd).trim();
  const limited = `SELECT TOP ${limit} * FROM (${derivedQuery}) AS intraq_live_query`;
  if (!hasLeadingCte) return limited;
  return `${query.slice(0, mainStart).trimEnd()}\n${limited}`;
}

function hasSafeTop(query: string, tokens: SqlToken[], select: SqlToken): boolean {
  let index = tokens.indexOf(select) + 1;
  if (index <= 0) return false;
  if (wordIs(tokens[index], 'distinct') || wordIs(tokens[index], 'all')) index += 1;
  if (!wordIs(tokens[index], 'top')) return false;
  const top = tokens[index]!;
  const argument = tokens[index + 1];
  if (!argument) return false;
  if (argument.depth === 0 && argument.kind === 'number' && /^\d+$/.test(argument.value)) {
    return hasTokenSeparator(query, top.end, argument.start)
      && hasArgumentBoundary(query, argument, tokens[index + 2]);
  }
  if (argument.depth !== 0 || argument.kind !== 'symbol' || argument.value !== '(') return false;
  const value = tokens[index + 2];
  const close = tokens[index + 3];
  if (
    !value
    || value.depth !== 1
    || !close
    || close.depth !== 0
    || close.kind !== 'symbol'
    || close.value !== ')'
  ) return false;
  const safeValue = value.kind === 'number' && /^\d+$/.test(value.value)
    || value.kind === 'variable' && /^@p[1-9]\d*$/i.test(value.value);
  if (!safeValue) return false;
  return hasArgumentBoundary(query, close, tokens[index + 4]);
}

function topLevelOrderByStart(tokens: SqlToken[], mainSelectStart: number): number {
  let last = -1;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token
      && next
      && token.start > mainSelectStart
      && wordIs(token, 'order')
      && wordIs(next, 'by')
    ) last = token.start;
  }
  return last;
}

function wordIs(token: SqlToken | undefined, value: string): boolean {
  return token?.kind === 'word' && token.value === value;
}

function hasTokenSeparator(query: string, leftEnd: number, rightStart: number): boolean {
  return /\s|\/\*|--/.test(query.slice(leftEnd, rightStart));
}

function hasArgumentBoundary(query: string, argument: SqlToken, next: SqlToken | undefined): boolean {
  if (!next) return true;
  return hasTokenSeparator(query, argument.end, next.start);
}

function tokenizeSql(query: string): SqlTokenization {
  const tokens: SqlToken[] = [];
  let balanced = true;
  let depth = 0;
  let index = 0;
  while (index < query.length) {
    const char = query[index]!;
    const next = query[index + 1];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '-' && next === '-') {
      index = lineCommentEnd(query, index + 2);
      continue;
    }
    if (char === '/' && next === '*') {
      const end = blockCommentEnd(query, index + 2);
      if (end < 0) {
        balanced = false;
        break;
      }
      index = end;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const end = quotedEnd(query, index, char);
      if (end < 0) {
        balanced = false;
        break;
      }
      tokens.push(token('opaque', query.slice(index, end), index, end, depth));
      index = end;
      continue;
    }
    if (char === '[') {
      const end = bracketedEnd(query, index);
      if (end < 0) {
        balanced = false;
        break;
      }
      tokens.push(token('opaque', query.slice(index, end), index, end, depth));
      index = end;
      continue;
    }
    if (char === '(') {
      tokens.push(token('symbol', char, index, index + 1, depth));
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ')') {
      if (depth === 0) balanced = false;
      else depth -= 1;
      tokens.push(token('symbol', char, index, index + 1, depth));
      index += 1;
      continue;
    }
    const variable = /^@[a-z_][a-z0-9_]*/i.exec(query.slice(index))?.[0];
    if (variable) {
      tokens.push(token('variable', variable.toLowerCase(), index, index + variable.length, depth));
      index += variable.length;
      continue;
    }
    const word = /^[a-z_][a-z0-9_$#]*/i.exec(query.slice(index))?.[0];
    if (word) {
      tokens.push(token('word', word.toLowerCase(), index, index + word.length, depth));
      index += word.length;
      continue;
    }
    const number = /^\d+/.exec(query.slice(index))?.[0];
    if (number) {
      tokens.push(token('number', number, index, index + number.length, depth));
      index += number.length;
      continue;
    }
    tokens.push(token('symbol', char, index, index + 1, depth));
    index += 1;
  }
  return { balanced: balanced && depth === 0, tokens };
}

function token(
  kind: SqlToken['kind'],
  value: string,
  start: number,
  end: number,
  depth: number
): SqlToken {
  return { depth, end, kind, start, value };
}

function lineCommentEnd(query: string, start: number): number {
  const newline = query.indexOf('\n', start);
  return newline < 0 ? query.length : newline + 1;
}

function blockCommentEnd(query: string, start: number): number {
  let depth = 1;
  for (let index = start; index < query.length - 1; index += 1) {
    const pair = query.slice(index, index + 2);
    if (pair === '/*') {
      depth += 1;
      index += 1;
    } else if (pair === '*/') {
      depth -= 1;
      index += 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function quotedEnd(query: string, start: number, quote: string): number {
  for (let index = start + 1; index < query.length; index += 1) {
    if (query[index] !== quote) continue;
    if (query[index + 1] === quote) {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return -1;
}

function bracketedEnd(query: string, start: number): number {
  for (let index = start + 1; index < query.length; index += 1) {
    if (query[index] !== ']') continue;
    if (query[index + 1] === ']') {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return -1;
}
