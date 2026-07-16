import type {
  AggregateFunction,
  FilterExpression,
  ParsedQuery,
  SelectExpression,
  SqlQueryCell,
  SqlQueryEngineResult
} from './sql-query-types.js';
import {
  parseComputedAggregateExpression,
  parseComputedSelectExpression
} from './sql-query-computed-expression.js';

const UNSAFE_SQL_PATTERN = /\b(alter|call|copy|create|delete|drop|execute|grant|insert|merge|revoke|truncate|update)\b/i;
const UNSAFE_SELECT_PATTERN = /\b(into\s+(outfile|dumpfile)|for\s+update|lock\s+in\s+share\s+mode)\b/i;

export function validateReadOnlySelect(query: string): string | null {
  const normalized = sanitizeReadOnlySelect(query);
  const commandScanText = maskSqlQuotedText(normalized);
  if (!/^(select|with)\b/i.test(normalized)) return 'Only SELECT queries are allowed';
  if (normalized.includes(';')) return 'Only one SELECT statement is allowed';
  if (UNSAFE_SQL_PATTERN.test(commandScanText)) return 'Only SELECT queries are allowed';
  if (UNSAFE_SELECT_PATTERN.test(commandScanText)) return 'Only read-only SELECT queries are allowed';
  return null;
}

export function sanitizeReadOnlySelect(query: string): string {
  return stripSqlComments(query).trim().replace(/;\s*$/, '');
}

export function parseSelectQuery(
  query: string,
  limits: { defaultLimit: number; maxLimit: number }
): SqlQueryEngineResult<ParsedQuery> {
  const normalized = stripSqlComments(query).trim().replace(/;\s*$/, '');
  const fromIndex = findTopLevelKeyword(normalized, 'from', 6);
  if (fromIndex < 0) return parseConstantSelect(normalized);

  const selectList = normalized.slice(6, fromIndex).trim();
  const fromTail = normalized.slice(fromIndex + 4).trim();
  if (!selectList || !fromTail) return { ok: false, statusCode: 400, error: 'Query must select columns from a table' };

  const parsedFrom = parseFromTail(fromTail, limits);
  if (!parsedFrom.ok) return parsedFrom;
  const expressions = parseSelectList(selectList);
  if (!expressions.ok) return expressions;

  return {
    ok: true,
    data: {
      tableName: parsedFrom.data.tableName,
      expressions: expressions.data,
      filters: parsedFrom.data.filters,
      groupBy: parsedFrom.data.groupBy,
      having: parsedFrom.data.having,
      orderBy: parsedFrom.data.orderBy,
      limit: parsedFrom.data.limit ?? limits.defaultLimit
    }
  };
}

function parseConstantSelect(query: string): SqlQueryEngineResult<ParsedQuery> {
  const match = /^select\s+([-+]?\d+(?:\.\d+)?)\s+(?:as\s+)?([a-z_][a-z0-9_]*)$/i.exec(query);
  if (!match?.[1] || !match[2]) {
    return { ok: false, statusCode: 400, error: 'Query must select columns from a table' };
  }
  return {
    ok: true,
    data: {
      tableName: null,
      expressions: [{ kind: 'field', fieldName: match[1], resultName: match[2] }],
      filters: [],
      groupBy: [],
      having: [],
      orderBy: [],
      limit: 1
    }
  };
}

function parseFromTail(
  value: string,
  limits: { defaultLimit: number; maxLimit: number }
): SqlQueryEngineResult<Omit<ParsedQuery, 'expressions'>> {
  const tableMatch = /^("[^"]+"|`[^`]+`|[a-z_][a-z0-9_]*)/i.exec(value);
  if (!tableMatch?.[1]) return { ok: false, statusCode: 400, error: 'Query must include a table name' };

  const clauses = parseClauses(stripOptionalTableAlias(value.slice(tableMatch[0].length).trim()));
  if (!clauses.ok) return clauses;
  const filters = clauses.data.where ? parseFilters(clauses.data.where) : { ok: true as const, data: [] };
  if (!filters.ok) return filters;
  const having = clauses.data.having ? parseFilters(clauses.data.having) : { ok: true as const, data: [] };
  if (!having.ok) return having;
  const limit = clauses.data.limit ? parseLimit(clauses.data.limit, limits.maxLimit) : { ok: true as const, data: null };
  if (!limit.ok) return limit;

  return {
    ok: true,
    data: {
      tableName: normalizeIdentifier(tableMatch[1]),
      filters: filters.data,
      groupBy: clauses.data.groupBy ? parseIdentifierList(clauses.data.groupBy) : [],
      having: having.data,
      orderBy: clauses.data.orderBy ? parseOrderBy(clauses.data.orderBy) : [],
      limit: limit.data ?? limits.defaultLimit
    }
  };
}

function parseClauses(rest: string): SqlQueryEngineResult<{ groupBy?: string; having?: string; limit?: string; orderBy?: string; where?: string }> {
  if (!rest) return { ok: true, data: {} };
  const positions = [
    { key: 'where' as const, index: findTopLevelKeyword(rest, 'where') },
    { key: 'groupBy' as const, index: findTopLevelKeyword(rest, 'group by') },
    { key: 'having' as const, index: findTopLevelKeyword(rest, 'having') },
    { key: 'orderBy' as const, index: findTopLevelKeyword(rest, 'order by') },
    { key: 'limit' as const, index: findTopLevelKeyword(rest, 'limit') }
  ].filter(item => item.index >= 0).sort((left, right) => left.index - right.index);

  if (positions.length === 0) return { ok: false, statusCode: 400, error: `Unsupported SQL clause: ${rest}` };
  const clauses: { groupBy?: string; having?: string; limit?: string; orderBy?: string; where?: string } = {};
  for (const [index, position] of positions.entries()) {
    const next = positions[index + 1]?.index ?? rest.length;
    const keywordLength = position.key === 'groupBy' || position.key === 'orderBy' ? 8 : position.key.length;
    const content = rest.slice(position.index + keywordLength, next).trim();
    if (!content) return { ok: false, statusCode: 400, error: `Missing ${position.key} clause value` };
    clauses[position.key] = content;
  }
  return { ok: true, data: clauses };
}

function stripOptionalTableAlias(value: string): string {
  if (!value) return value;
  if (['where', 'group by', 'having', 'order by', 'limit'].some(keyword => isTopLevelWordAt(value, 0, keyword))) return value;
  const aliasMatch = /^(?:as\s+)?([a-z_][a-z0-9_]*)\b/i.exec(value);
  if (!aliasMatch) return value;
  const alias = aliasMatch?.[1]?.toLowerCase();
  if (!alias || ['where', 'group', 'having', 'order', 'limit'].includes(alias)) return value;
  const matchedAlias = aliasMatch[0];
  return value.slice(matchedAlias.length).trim();
}

function parseSelectList(value: string): SqlQueryEngineResult<SelectExpression[] | '*'> {
  if (value.trim() === '*') return { ok: true, data: '*' };
  const expressions: SelectExpression[] = [];
  for (const part of splitTopLevel(value, ',')) {
    const parsed = parseSelectExpression(part);
    if (!parsed.ok) return parsed;
    expressions.push(parsed.data);
  }
  return { ok: true, data: expressions };
}

function parseSelectExpression(value: string): SqlQueryEngineResult<SelectExpression> {
  const { expression, alias } = splitAlias(value.trim());
  const aggregateMatch = /^(count|sum|avg|min|max)\s*\(\s*(\*|"[^"]+"|`[^`]+`|(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)\s*\)$/i.exec(expression);
  if (aggregateMatch?.[1] && aggregateMatch[2]) {
    const functionName = aggregateMatch[1].toLowerCase() as AggregateFunction;
    const fieldName = aggregateMatch[2] === '*' ? '*' : normalizeIdentifier(stripQualifier(aggregateMatch[2]));
    return {
      ok: true,
      data: { kind: 'aggregate', functionName, fieldName, resultName: alias ?? defaultAggregateName(functionName, fieldName) }
    };
  }
  const aggregateExpression = parseComputedAggregateExpression(expression, alias);
  if (aggregateExpression) return { ok: true, data: aggregateExpression };
  const identifier = parseIdentifierExpression(expression);
  if (!identifier) {
    const computed = parseComputedSelectExpression(expression, alias);
    if (computed) return { ok: true, data: computed };
    return { ok: false, statusCode: 400, error: `Unsupported selected column: ${value.trim()}` };
  }
  return { ok: true, data: { kind: 'field', fieldName: identifier, resultName: alias ?? identifier } };
}

function parseFilters(value: string): SqlQueryEngineResult<FilterExpression[]> {
  const filters: FilterExpression[] = [];
  for (const part of splitLogicalAnd(value)) {
    const filter = parseFilter(part);
    if (!filter.ok) return filter;
    filters.push(filter.data);
  }
  return { ok: true, data: filters };
}

function parseFilter(value: string): SqlQueryEngineResult<FilterExpression> {
  const isNull = /^(.+?)\s+is\s+(not\s+)?null$/i.exec(value);
  if (isNull?.[1]) {
    const fieldName = parseIdentifierExpression(isNull[1].trim());
    if (!fieldName) return { ok: false, statusCode: 400, error: `Unsupported filter: ${value}` };
    return { ok: true, data: { fieldName, operator: isNull[2] ? 'is-not-null' : 'is-null' } };
  }
  const between = /^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i.exec(value);
  if (between?.[1] && between[2] && between[3]) {
    const fieldName = parseIdentifierExpression(between[1].trim());
    if (!fieldName) return { ok: false, statusCode: 400, error: `Unsupported filter: ${value}` };
    return { ok: true, data: { fieldName, operator: 'between', values: [parseLiteral(between[2]), parseLiteral(between[3])] } };
  }
  const inMatch = /^(.+?)\s+in\s*\((.+)\)$/i.exec(value);
  if (inMatch?.[1] && inMatch[2]) {
    const fieldName = parseIdentifierExpression(inMatch[1].trim());
    if (!fieldName) return { ok: false, statusCode: 400, error: `Unsupported filter: ${value}` };
    return { ok: true, data: { fieldName, operator: 'in', values: splitTopLevel(inMatch[2], ',').map(parseLiteral) } };
  }
  const compare = /^(.+?)\s*(<=|>=|<>|!=|=|<|>|like|ilike)\s*(.+)$/i.exec(value);
  if (compare?.[1] && compare[2] && compare[3]) {
    const fieldName = parseIdentifierExpression(compare[1].trim());
    if (!fieldName) return { ok: false, statusCode: 400, error: `Unsupported filter: ${value}` };
    const operator = compare[2].toLowerCase();
    return {
      ok: true,
      data: {
        fieldName,
        operator: operator === '<>' ? '!=' : operator === 'ilike' ? 'like' : operator as FilterExpression['operator'],
        value: parseLiteral(compare[3])
      }
    };
  }
  return { ok: false, statusCode: 400, error: `Unsupported filter: ${value}` };
}

function parseOrderBy(value: string): Array<{ name: string; direction: 'asc' | 'desc' }> {
  return splitTopLevel(value, ',').flatMap(part => {
    const match = /^(.+?)(?:\s+(asc|desc))?$/i.exec(part.trim());
    const name = match?.[1] ? parseIdentifierExpression(match[1].trim()) : null;
    if (!name) return [];
    return [{ name, direction: match?.[2]?.toLowerCase() === 'desc' ? 'desc' : 'asc' }];
  });
}

function parseIdentifierList(value: string): string[] {
  return splitTopLevel(value, ',').flatMap(part => parseIdentifierExpression(part.trim()) ?? []);
}

function parseLimit(value: string, maxLimit: number): SqlQueryEngineResult<number> {
  const match = /^(\d+)$/.exec(value.trim());
  if (!match?.[1]) return { ok: false, statusCode: 400, error: 'LIMIT must be a positive integer' };
  const parsed = Number(match[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return { ok: false, statusCode: 400, error: 'LIMIT must be a positive integer' };
  return { ok: true, data: Math.min(parsed, maxLimit) };
}

function splitAlias(value: string): { alias?: string; expression: string } {
  const asIndex = findTopLevelKeyword(value, 'as');
  if (asIndex >= 0) {
    const alias = parseBareAlias(value.slice(asIndex + 2).trim());
    if (alias) return { expression: value.slice(0, asIndex).trim(), alias };
  }
  const parts = value.match(/^(.+?)\s+("[^"]+"|`[^`]+`|[a-z_][a-z0-9_]*)$/i);
  const alias = parts?.[2] ? parseBareAlias(parts[2]) : null;
  return parts?.[1] && alias ? { expression: parts[1].trim(), alias } : { expression: value };
}

function splitLogicalAnd(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let skipNextAnd = false;
  for (let index = 0; index < value.length; index += 1) {
    if (isTopLevelWordAt(value, index, 'between')) skipNextAnd = true;
    if (!isTopLevelWordAt(value, index, 'and')) continue;
    if (skipNextAnd) {
      skipNextAnd = false;
      index += 2;
      continue;
    }
    parts.push(value.slice(start, index).trim());
    start = index + 3;
    index += 2;
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseIdentifierExpression(value: string): string | null {
  const normalized = normalizeIdentifier(stripQualifier(value));
  return normalized || null;
}

function parseBareAlias(value: string): string | null {
  if (/^"[^"]+"$/.test(value) || /^`[^`]+`$/.test(value)) return value.slice(1, -1);
  return /^[a-z_][a-z0-9_]*$/i.test(value) ? value : null;
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (/^"[^"]+"$/.test(trimmed) || /^`[^`]+`$/.test(trimmed)) return trimmed.slice(1, -1);
  return /^[a-z_][a-z0-9_]*$/i.test(trimmed) ? trimmed : '';
}

function stripQualifier(value: string): string {
  const parts = splitTopLevel(value, '.');
  return parts[parts.length - 1]?.trim() ?? value.trim();
}

function defaultAggregateName(functionName: AggregateFunction, fieldName: string): string {
  return fieldName === '*' ? functionName : `${fieldName}_${functionName}`;
}

function parseLiteral(value: string): SqlQueryCell {
  const trimmed = value.trim();
  if (/^null$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && value.slice(index, index + separator.length) === separator) {
      parts.push(value.slice(start, index).trim());
      start = index + separator.length;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function findTopLevelKeyword(value: string, keyword: string, startAt = 0): number {
  const normalizedKeyword = keyword.toLowerCase();
  let depth = 0;
  let quote: string | null = null;
  for (let index = startAt; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && isTopLevelWordAt(value, index, normalizedKeyword)) return index;
  }
  return -1;
}

function isTopLevelWordAt(value: string, index: number, word: string): boolean {
  const before = index === 0 ? ' ' : value[index - 1] ?? ' ';
  const after = value[index + word.length] ?? ' ';
  return value.slice(index, index + word.length).toLowerCase() === word
    && !/[a-z0-9_]/i.test(before)
    && !/[a-z0-9_]/i.test(after);
}

function stripSqlComments(query: string): string {
  let output = '';
  let index = 0;
  let quote: string | null = null;
  while (index < query.length) {
    const char = query[index] ?? '';
    const next = query[index + 1] ?? '';

    if (quote) {
      output += char;
      if (char === quote && query[index - 1] !== '\\') quote = null;
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      output += char;
      index += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      index += 2;
      while (index < query.length && query[index] !== '\n') index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < query.length - 1 && !(query[index] === '*' && query[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }

    if (char === '#') {
      index += 1;
      while (index < query.length && query[index] !== '\n') index += 1;
      continue;
    }

    output += char;
    index += 1;
  }
  return output;
}

function maskSqlQuotedText(value: string): string {
  let output = '';
  let index = 0;
  let quote: string | null = null;
  while (index < value.length) {
    const char = value[index] ?? '';

    if (quote) {
      output += ' ';
      if (char === quote) {
        if (quote === "'" && value[index + 1] === "'") {
          output += ' ';
          index += 2;
          continue;
        }
        if (value[index - 1] !== '\\') quote = null;
      }
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      output += ' ';
      index += 1;
      continue;
    }

    output += char;
    index += 1;
  }
  return output;
}
