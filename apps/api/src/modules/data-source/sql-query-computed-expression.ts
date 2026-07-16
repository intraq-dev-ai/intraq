import type { AggregateFunction, SelectExpression, SqlQueryCell } from './sql-query-types.js';

const SQL_KEYWORDS = new Set([
  'and',
  'as',
  'case',
  'current_date',
  'date_trunc',
  'else',
  'end',
  'false',
  'interval',
  'is',
  'not',
  'null',
  'nullif',
  'or',
  'then',
  'true',
  'when'
]);

export function parseComputedSelectExpression(
  sql: string,
  alias?: string
): Extract<SelectExpression, { kind: 'computed' }> | null {
  const expression = sql.trim();
  if (!expression || (!alias && !isComputedExpression(expression))) return null;
  return {
    fieldNames: referencedFields(expression),
    kind: 'computed',
    resultName: alias ?? defaultExpressionName(expression),
    sql: expression,
    valueType: expressionType(expression)
  };
}

export function parseComputedAggregateExpression(expression: string, alias?: string): SelectExpression | null {
  const match = /^(count|sum|avg|min|max)\s*\(([\s\S]+)\)$/i.exec(expression);
  if (!match?.[1] || !match[2]) return null;
  const functionName = match[1].toLowerCase() as AggregateFunction;
  const computed = parseComputedSelectExpression(match[2].trim(), alias);
  if (!computed) return null;
  return {
    expressionSql: computed.sql,
    fieldName: computed.resultName,
    fieldNames: computed.fieldNames,
    functionName,
    kind: 'aggregate',
    resultName: alias ?? defaultAggregateName(functionName, computed.resultName)
  };
}

export function evaluateComputedSqlExpression(sql: string, row: Record<string, unknown>): SqlQueryCell {
  const expression = stripOuterParentheses(sql.trim());
  const literal = parseLiteralExpression(expression);
  if (literal.matched) return literal.value;

  const searchedCase = parseSearchedCase(expression);
  if (searchedCase) {
    for (const branch of searchedCase.branches) {
      if (evaluateCondition(branch.condition, row)) return evaluateComputedSqlExpression(branch.value, row);
    }
    return searchedCase.elseValue ? evaluateComputedSqlExpression(searchedCase.elseValue, row) : null;
  }

  const nullif = parseFunctionCall(expression, 'nullif');
  if (nullif?.length === 2) {
    const left = evaluateComputedSqlExpression(nullif[0] ?? '', row);
    const right = evaluateComputedSqlExpression(nullif[1] ?? '', row);
    return compareValues(left, right) === 0 ? null : left;
  }

  const binary = splitBinaryExpression(expression);
  if (binary) {
    const left = evaluateComputedSqlExpression(binary.left, row);
    const right = evaluateComputedSqlExpression(binary.right, row);
    return evaluateBinary(left, right, binary.operator);
  }

  const field = normalizeIdentifier(expression);
  if (field) return toSqlQueryCell(row[field]);
  return null;
}

function isComputedExpression(expression: string): boolean {
  return parseLiteralExpression(expression).matched
    || /^case\s+/i.test(expression)
    || Boolean(parseFunctionCall(expression, 'nullif'))
    || Boolean(splitBinaryExpression(expression));
}

function referencedFields(expression: string): string[] {
  const withoutStrings = expression.replace(/'([^']|'')*'|"([^"]|"")*"/g, ' ');
  const identifiers = withoutStrings.match(/[a-z_][a-z0-9_]*/gi) ?? [];
  return Array.from(new Set(identifiers
    .filter(identifier => !SQL_KEYWORDS.has(identifier.toLowerCase()))
    .filter(identifier => !/^\d/.test(identifier))));
}

function expressionType(expression: string): 'boolean' | 'number' | 'string' {
  const literal = parseLiteralExpression(expression);
  if (literal.matched) {
    if (typeof literal.value === 'boolean') return 'boolean';
    if (typeof literal.value === 'number') return 'number';
    return 'string';
  }
  if (splitBinaryExpression(expression) || parseFunctionCall(expression, 'nullif')) return 'number';
  if (/^case\s+/i.test(expression)) {
    const searchedCase = parseSearchedCase(expression);
    const branchTypes = searchedCase?.branches.map(branch => expressionType(branch.value)) ?? [];
    const types = searchedCase?.elseValue ? [...branchTypes, expressionType(searchedCase.elseValue)] : branchTypes;
    return types.length > 0 && types.every(type => type === types[0]) ? types[0] ?? 'string' : 'string';
  }
  return 'string';
}

function parseSearchedCase(expression: string): { branches: Array<{ condition: string; value: string }>; elseValue?: string } | null {
  const trimmed = stripOuterParentheses(expression.trim());
  if (!/^case\b/i.test(trimmed) || !/\bend$/i.test(trimmed)) return null;
  const body = trimmed.slice(4).trim().replace(/\bend$/i, '').trim();
  const branches: Array<{ condition: string; value: string }> = [];
  let cursor = 0;
  while (cursor < body.length) {
    const whenIndex = findCaseKeyword(body, 'when', cursor);
    const elseIndex = findCaseKeyword(body, 'else', cursor);
    if (elseIndex >= 0 && (whenIndex < 0 || elseIndex < whenIndex)) {
      return { branches, elseValue: body.slice(elseIndex + 4).trim() };
    }
    if (whenIndex < 0) break;
    const thenIndex = findCaseKeyword(body, 'then', whenIndex + 4);
    if (thenIndex < 0) return null;
    const nextWhen = findCaseKeyword(body, 'when', thenIndex + 4);
    const nextElse = findCaseKeyword(body, 'else', thenIndex + 4);
    const nextIndex = [nextWhen, nextElse].filter(index => index >= 0).sort((left, right) => left - right)[0] ?? body.length;
    branches.push({
      condition: body.slice(whenIndex + 4, thenIndex).trim(),
      value: body.slice(thenIndex + 4, nextIndex).trim()
    });
    cursor = nextIndex;
  }
  return branches.length > 0 ? { branches } : null;
}

function evaluateCondition(sql: string, row: Record<string, unknown>): boolean {
  const orParts = splitLogicalCondition(sql, 'or');
  if (orParts.length > 1) return orParts.some(part => evaluateCondition(part, row));
  const andParts = splitLogicalCondition(sql, 'and');
  if (andParts.length > 1) return andParts.every(part => evaluateCondition(part, row));

  const compare = /^(.+?)\s*(<=|>=|<>|!=|=|<|>)\s*(.+)$/i.exec(sql.trim());
  if (compare?.[1] && compare[2] && compare[3]) {
    const left = evaluateComputedSqlExpression(compare[1], row);
    const right = evaluateComputedSqlExpression(compare[3], row);
    const result = compareValues(left, right);
    if (compare[2] === '=') return result === 0;
    if (compare[2] === '!=' || compare[2] === '<>') return result !== 0;
    if (compare[2] === '<') return result < 0;
    if (compare[2] === '<=') return result <= 0;
    if (compare[2] === '>') return result > 0;
    return result >= 0;
  }
  const value = evaluateComputedSqlExpression(sql, row);
  return Boolean(value);
}

function splitLogicalCondition(value: string, word: 'and' | 'or'): string[] {
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
    if (depth === 0 && isWordAt(value, index, word)) {
      parts.push(value.slice(start, index).trim());
      start = index + word.length;
      index += word.length - 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function findCaseKeyword(value: string, word: 'else' | 'then' | 'when', startAt: number): number {
  let depth = 0;
  let nestedCaseDepth = 0;
  let quote: string | null = null;
  for (let index = startAt; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth !== 0) continue;
    if (isWordAt(value, index, 'case')) {
      nestedCaseDepth += 1;
      index += 3;
      continue;
    }
    if (nestedCaseDepth > 0 && isWordAt(value, index, 'end')) {
      nestedCaseDepth -= 1;
      index += 2;
      continue;
    }
    if (nestedCaseDepth === 0 && isWordAt(value, index, word)) return index;
  }
  return -1;
}

function splitBinaryExpression(expression: string): { left: string; operator: '+' | '-' | '*' | '/'; right: string } | null {
  for (const operators of [['+', '-'], ['*', '/']] as const) {
    const found = findRightmostTopLevelOperator(expression, operators);
    if (!found) continue;
    return {
      left: expression.slice(0, found.index).trim(),
      operator: found.operator,
      right: expression.slice(found.index + 1).trim()
    };
  }
  return null;
}

function findRightmostTopLevelOperator(
  expression: string,
  operators: ReadonlyArray<'+' | '-' | '*' | '/'>
): { index: number; operator: '+' | '-' | '*' | '/' } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let index = expression.length - 1; index >= 0; index -= 1) {
    const char = expression[index] ?? '';
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === ')') depth += 1;
    if (char === '(') depth = Math.max(0, depth - 1);
    if (depth !== 0 || !operators.includes(char as '+' | '-' | '*' | '/')) continue;
    if (char === '-' && (index === 0 || /[+\-*/(]/.test(expression[index - 1] ?? ''))) continue;
    return { index, operator: char as '+' | '-' | '*' | '/' };
  }
  return null;
}

function evaluateBinary(left: SqlQueryCell, right: SqlQueryCell, operator: '+' | '-' | '*' | '/'): SqlQueryCell {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return null;
  if (operator === '+') return leftNumber + rightNumber;
  if (operator === '-') return leftNumber - rightNumber;
  if (operator === '*') return leftNumber * rightNumber;
  if (rightNumber === 0) return null;
  return leftNumber / rightNumber;
}

function parseFunctionCall(expression: string, name: string): string[] | null {
  const prefix = `${name}(`;
  if (!expression.toLowerCase().startsWith(prefix) || !expression.endsWith(')')) return null;
  return splitTopLevel(expression.slice(prefix.length, -1), ',');
}

function parseLiteralExpression(expression: string): { matched: true; value: SqlQueryCell } | { matched: false } {
  if (/^null$/i.test(expression)) return { matched: true, value: null };
  if (/^true$/i.test(expression)) return { matched: true, value: true };
  if (/^false$/i.test(expression)) return { matched: true, value: false };
  if ((expression.startsWith("'") && expression.endsWith("'")) || (expression.startsWith('"') && expression.endsWith('"'))) {
    return { matched: true, value: expression.slice(1, -1).replace(/''/g, "'") };
  }
  const numeric = Number(expression);
  return Number.isFinite(numeric) ? { matched: true, value: numeric } : { matched: false };
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

function isWordAt(value: string, index: number, word: string): boolean {
  const before = index === 0 ? ' ' : value[index - 1] ?? ' ';
  const after = value[index + word.length] ?? ' ';
  return value.slice(index, index + word.length).toLowerCase() === word
    && !/[a-z0-9_]/i.test(before)
    && !/[a-z0-9_]/i.test(after);
}

function stripOuterParentheses(value: string): string {
  if (!value.startsWith('(') || !value.endsWith(')')) return value;
  const inner = value.slice(1, -1).trim();
  return splitTopLevel(inner, ',').length === 1 ? inner : value;
}

function defaultExpressionName(expression: string): string {
  const literal = parseLiteralExpression(expression);
  if (literal.matched) return String(literal.value ?? 'value').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'value';
  return expression.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'expression';
}

function defaultAggregateName(functionName: AggregateFunction, fieldName: string): string {
  return `${fieldName}_${functionName === 'sum' ? 'total' : functionName}`;
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (/^"[^"]+"$/.test(trimmed) || /^`[^`]+`$/.test(trimmed)) return trimmed.slice(1, -1);
  return /^[a-z_][a-z0-9_]*$/i.test(trimmed) ? trimmed : '';
}

function compareValues(left: SqlQueryCell, right: SqlQueryCell): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function toSqlQueryCell(value: unknown): SqlQueryCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}
