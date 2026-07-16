const MUTATING_SQL_KEYWORDS = [
  'alter',
  'call',
  'copy',
  'create',
  'delete',
  'drop',
  'execute',
  'exec',
  'grant',
  'insert',
  'merge',
  'replace',
  'revoke',
  'truncate',
  'update',
  'vacuum'
];

export function validateApiWorkflowReadOnlySql(
  sql: string,
  options: { allowFragment?: boolean } = {}
): string | null {
  const stripped = maskSqlCommentsAndLiterals(sql).trim();
  if (!stripped) return 'API workflow SQL cannot be empty.';
  if (hasMultipleSqlStatements(stripped)) return 'API workflow SQL must contain one read-only statement.';
  if (!options.allowFragment) {
    const firstWord = stripped.match(/[a-zA-Z_][a-zA-Z0-9_]*/)?.[0]?.toLowerCase();
    if (firstWord !== 'select' && firstWord !== 'with') return 'API workflow SQL must start with SELECT or WITH.';
  }
  const keyword = MUTATING_SQL_KEYWORDS.find(item => new RegExp(`\\b${item}\\b`, 'i').test(stripped));
  return keyword ? `API workflow SQL must be read-only; ${keyword.toUpperCase()} is not allowed.` : null;
}

function hasMultipleSqlStatements(sql: string): boolean {
  const firstSemicolon = sql.indexOf(';');
  if (firstSemicolon < 0) return false;
  return sql.slice(firstSemicolon + 1).trim().length > 0;
}

function maskSqlCommentsAndLiterals(sql: string): string {
  let output = '';
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (char === '-' && next === '-') {
      output += '  ';
      index += 2;
      while (index < sql.length && sql[index] !== '\n') {
        output += ' ';
        index += 1;
      }
      if (index < sql.length) output += sql[index];
      continue;
    }
    if (char === '/' && next === '*') {
      output += '  ';
      index += 2;
      while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) {
        output += sql[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      if (index < sql.length) {
        output += '  ';
        index += 1;
      }
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      const quote = char;
      output += ' ';
      index += 1;
      while (index < sql.length) {
        const current = sql[index];
        output += current === '\n' ? '\n' : ' ';
        if (current === quote) {
          if (sql[index + 1] === quote) {
            index += 2;
            output += ' ';
            continue;
          }
          break;
        }
        if (current === '\\') {
          index += 1;
          output += ' ';
        }
        index += 1;
      }
      continue;
    }
    output += char;
  }
  return output;
}
