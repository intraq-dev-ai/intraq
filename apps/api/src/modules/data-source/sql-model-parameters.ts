export interface SqlModelParameterDefinition {
  dataType?: string;
  dateRole?: string;
  defaultValue?: unknown;
  name: string;
  required?: boolean;
}

export type SqlModelParameterValues = Record<string, unknown>;

export interface SqlModelParameterResult {
  bindings?: unknown[];
  sql: string;
  unresolvedParameters: string[];
}

export function applySqlModelParameters(
  sql: string,
  definitions: SqlModelParameterDefinition[],
  values: SqlModelParameterValues = {},
  now = new Date()
): SqlModelParameterResult {
  return applySqlModelParameterTokens(sql, definitions, values, now, (value, definition) => sqlLiteral(value, definition));
}

export function applySqlModelParameterBindings(
  sql: string,
  definitions: SqlModelParameterDefinition[],
  values: SqlModelParameterValues = {},
  dialect: 'mysql' | 'postgres' | 'sqlserver' = 'mysql',
  now = new Date()
): SqlModelParameterResult {
  const bindings: unknown[] = [];
  const result = applySqlModelParameterTokens(sql, definitions, values, now, value => {
    if (Array.isArray(value)) {
      if (value.length === 0) return 'NULL';
      return value.map(item => {
        bindings.push(item);
        if (dialect === 'postgres') return `$${bindings.length}`;
        if (dialect === 'sqlserver') return `@p${bindings.length}`;
        return '?';
      }).join(', ');
    }
    bindings.push(value);
    if (dialect === 'postgres') return `$${bindings.length}`;
    if (dialect === 'sqlserver') return `@p${bindings.length}`;
    return '?';
  });
  return { ...result, bindings };
}

function applySqlModelParameterTokens(
  sql: string,
  definitions: SqlModelParameterDefinition[],
  values: SqlModelParameterValues,
  now: Date,
  formatValue: (value: unknown, definition: SqlModelParameterDefinition | undefined, name: string) => string
): SqlModelParameterResult {
  const resolvedValues = resolveParameterValues(definitions, values, now);
  let resolvedSql = sql.replace(/\[\[([\s\S]*?)\]\]/g, (_match, block: string) => {
    const references = parameterReferences(block);
    if (references.length === 0) return block;
    if (!references.every(name => hasParameterValue(resolvedValues[name]))) return '';
    return block;
  });
  resolvedSql = replaceParameterTokens(resolvedSql, resolvedValues, definitions, formatValue);
  const unresolvedParameters = parameterReferences(resolvedSql)
    .filter(name => !hasParameterValue(resolvedValues[name]));
  return {
    sql: resolvedSql.replace(/\n{3,}/g, '\n\n').trim(),
    unresolvedParameters: Array.from(new Set(unresolvedParameters))
  };
}

function resolveParameterValues(
  definitions: SqlModelParameterDefinition[],
  values: SqlModelParameterValues,
  now: Date
): SqlModelParameterValues {
  const resolved: SqlModelParameterValues = { ...values };
  for (const definition of definitions) {
    if (
      isSelfReferenceParameterValue(resolved[definition.name], definition.name)
      || isUnresolvedParameterPlaceholder(resolved[definition.name])
      || !parameterValueCompatibleWithDefinition(resolved[definition.name], definition)
    ) {
      delete resolved[definition.name];
    }
    if (hasParameterValue(resolved[definition.name])) continue;
    const defaultValue = resolveDefaultValue(
      hasParameterValue(definition.defaultValue) ? definition.defaultValue : inferredRequiredDateDefault(definition),
      now
    );
    if (hasParameterValue(defaultValue)) resolved[definition.name] = defaultValue;
  }
  return resolved;
}

function parameterValueCompatibleWithDefinition(
  value: unknown,
  definition: SqlModelParameterDefinition
): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.every(item => parameterValueCompatibleWithDefinition(item, definition));
  const dataType = (definition.dataType ?? '').trim().toLowerCase();
  if (isNumericType(dataType)) return numericParameterValue(value);
  if (isDateType(dataType)) return dateParameterValue(value);
  if (dataType.includes('bool')) return booleanParameterValue(value);
  return true;
}

function numericParameterValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function isDateType(value: string): boolean {
  return value.includes('date') || value.includes('time');
}

function dateParameterValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function booleanParameterValue(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === 0 || value === 1;
  if (typeof value !== 'string') return false;
  return ['0', '1', 'false', 'no', 'true', 'yes'].includes(value.trim().toLowerCase());
}

function inferredRequiredDateDefault(definition: SqlModelParameterDefinition): string | undefined {
  if (definition.required !== true) return undefined;
  const dataType = (definition.dataType ?? '').toLowerCase();
  if (!dataType.includes('date')) return undefined;
  const dateRole = (definition.dateRole ?? '').toLowerCase();
  if (dateRole === 'start') return 'START_OF_MONTH';
  if (dateRole === 'end' || dateRole === 'as_of') return 'TODAY';
  return undefined;
}

function resolveDefaultValue(value: unknown, now: Date): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return '';
  const plusDays = normalized.match(/^TODAY_PLUS_(\d+)$/);
  if (plusDays) return isoDate(addDays(now, Number(plusDays[1])));
  const minusDays = normalized.match(/^TODAY_MINUS_(\d+)$/);
  if (minusDays) return isoDate(addDays(now, -Number(minusDays[1])));
  if (normalized === 'TODAY') return isoDate(now);
  if (normalized === 'YESTERDAY') return isoDate(addDays(now, -1));
  if (normalized === 'TOMORROW') return isoDate(addDays(now, 1));
  if (normalized === 'START_OF_WEEK') return isoDate(startOfWeek(now));
  if (normalized === 'END_OF_WEEK') return isoDate(endOfWeek(now));
  if (normalized === 'START_OF_LAST_WEEK') return isoDate(addDays(startOfWeek(now), -7));
  if (normalized === 'END_OF_LAST_WEEK') return isoDate(addDays(endOfWeek(now), -7));
  if (normalized === 'START_OF_MONTH') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  if (normalized === 'END_OF_MONTH') return isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (normalized === 'START_OF_LAST_MONTH') return isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  if (normalized === 'END_OF_LAST_MONTH') return isoDate(new Date(now.getFullYear(), now.getMonth(), 0));
  if (normalized === 'START_OF_YEAR') return `${now.getFullYear()}-01-01`;
  if (normalized === 'END_OF_YEAR') return `${now.getFullYear()}-12-31`;
  return value;
}

function replaceParameterTokens(
  sql: string,
  values: SqlModelParameterValues,
  definitions: SqlModelParameterDefinition[],
  formatValue: (value: unknown, definition: SqlModelParameterDefinition | undefined, name: string) => string
): string {
  const definitionByName = new Map(definitions.map(definition => [definition.name, definition]));
  const rewriteArrayPredicate = (
    input: string,
    operators: string[],
    rewrite: (valueSql: string) => string
  ) => input.replace(
    new RegExp(`(^|[^<>!])(?:${operators.map(operator => operator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*(\\{\\{\\s*([a-z][a-z0-9_]*)\\s*\\}\\}|:([a-z][a-z0-9_]*))`, 'gi'),
    (match, prefix: string, _token: string, curlyName: string, colonName: string) => {
      const name = curlyName || colonName;
      const value = values[name];
      if (!Array.isArray(value) || value.length <= 1 || !value.every(item => hasParameterValue(item))) return match;
      const valueSql = formatValue(value, definitionByName.get(name), name);
      return `${prefix}${rewrite(valueSql)}`;
    }
  );
  return rewriteArrayPredicate(
    rewriteArrayPredicate(sql, ['<>', '!='], valueSql => `NOT IN (${valueSql})`),
    ['='],
    valueSql => `IN (${valueSql})`
  )
    .replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (match, name: string) =>
      hasParameterValue(values[name]) ? formatValue(values[name], definitionByName.get(name), name) : match)
    .replace(/:([a-z][a-z0-9_]*)/gi, (match, name: string) =>
      hasParameterValue(values[name]) ? formatValue(values[name], definitionByName.get(name), name) : match);
}

function sqlLiteral(value: unknown, definition: SqlModelParameterDefinition | undefined): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'NULL';
    return value.map(item => sqlLiteral(item, definition)).join(', ');
  }
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const dataType = definition?.dataType?.toLowerCase() ?? '';
  const text = String(value).trim();
  if (dataType.includes('bool')) return /^(true|1|yes)$/i.test(text) ? 'TRUE' : 'FALSE';
  if (isNumericType(dataType) && Number.isFinite(Number(text))) return text;
  if (!dataType && Number.isFinite(Number(text)) && text !== '') return text;
  return `'${text.replace(/'/g, "''")}'`;
}

function isNumericType(value: string): boolean {
  return ['bigint', 'decimal', 'double', 'float', 'int', 'number', 'numeric', 'real'].some(type => value.includes(type));
}

function parameterReferences(sql: string): string[] {
  const references: string[] = [];
  let quote: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      if (char === quote) {
        if (sql[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{' && sql[index + 1] === '{') {
      const end = sql.indexOf('}}', index + 2);
      if (end < 0) continue;
      const name = sql.slice(index + 2, end).trim();
      if (isParameterName(name)) references.push(name);
      index = end + 1;
      continue;
    }
    if (char === ':' && isParameterStart(sql[index + 1] ?? '')) {
      let end = index + 2;
      while (isParameterCharacter(sql[end] ?? '')) end += 1;
      references.push(sql.slice(index + 1, end));
      index = end - 1;
    }
  }

  return Array.from(new Set(references));
}

function isParameterName(value: string): boolean {
  return /^[a-z][a-z0-9_]*$/i.test(value);
}

function isParameterStart(value: string): boolean {
  return /^[a-z]$/i.test(value);
}

function isParameterCharacter(value: string): boolean {
  return /^[a-z0-9_]$/i.test(value);
}

function hasParameterValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0 && value.every(item => hasParameterValue(item));
  if (typeof value === 'string') {
    const text = value.trim();
    return text !== '' && !isUnresolvedParameterPlaceholder(text);
  }
  return String(value).trim() !== '';
}

function isSelfReferenceParameterValue(value: unknown, name: string): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  const normalizedName = normalizedParameterName(name);
  if (!normalizedName) return false;
  if (text.startsWith('{{') && text.endsWith('}}')) {
    return normalizedParameterName(text.slice(2, -2).trim()) === normalizedName;
  }
  if ((text.startsWith('$') || text.startsWith(':')) && text.length > 1) {
    return normalizedParameterName(text.slice(1).trim()) === normalizedName;
  }
  return false;
}

function isUnresolvedParameterPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  if (text.startsWith('{{') && text.endsWith('}}') && text.length > 4) return true;
  if ((text.startsWith('$') || text.startsWith(':')) && isParameterName(text.slice(1).trim())) return true;
  if (text.startsWith('__') && text.endsWith('__') && text.length > 4) return true;
  if (text.startsWith('<') && text.endsWith('>') && text.length > 2) return true;
  return false;
}

function normalizedParameterName(value: string): string {
  let normalized = '';
  for (const character of value) {
    const lower = character.toLowerCase();
    const isLetter = lower >= 'a' && lower <= 'z';
    const isDigit = lower >= '0' && lower <= '9';
    if (isLetter || isDigit) normalized += lower;
  }
  return normalized;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function startOfWeek(value: Date): Date {
  return addDays(value, -value.getDay());
}

function endOfWeek(value: Date): Date {
  return addDays(value, 6 - value.getDay());
}

function isoDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
