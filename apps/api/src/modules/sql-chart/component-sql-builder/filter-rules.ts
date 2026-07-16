interface FilterConditionRule {
  id?: string;
  type: 'condition';
  field: string;
  operator: string;
  value: string;
  valueType?: 'static' | 'dynamic';
  dynamicDateValue?: string;
  dynamicDateOffset?: number;
}

interface FilterGroupRule {
  id?: string;
  type: 'group';
  logic: 'and' | 'or' | 'not';
  children: FilterRule[];
}

type FilterRule = FilterConditionRule | FilterGroupRule;

function quoteIdentifier(field: string, dbType: string): string {
  if (dbType === 'sqlserver' || dbType === 'mssql') return `[${field}]`;
  if (dbType === 'mysql' || dbType === 'mariadb') return `\`${field}\``;
  return `"${field}"`;
}

function escapeValue(value: string, dbType: string): string {
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return String(num);
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function dynamicDateExpression(dateValue: string, offset: number, dbType: string): string {
  const today = new Date();
  today.setDate(today.getDate() + (offset ?? 0));
  return `'${today.toISOString().split('T')[0]}'`;
}

function conditionToSql(rule: FilterConditionRule, dbType: string): string {
  const field = quoteIdentifier(rule.field, dbType);
  const sqlValue = rule.valueType === 'dynamic' && rule.dynamicDateValue
    ? dynamicDateExpression(rule.dynamicDateValue, rule.dynamicDateOffset ?? 0, dbType)
    : escapeValue(rule.value, dbType);

  const op = (() => {
    switch (rule.operator) {
      case '=': case '==': return 'equals';
      case '!=': case '<>': return 'not_equals';
      case '>': return 'greater_than';
      case '<': return 'less_than';
      case '>=': return 'greater_than_or_equal';
      case '<=': return 'less_than_or_equal';
      default: return rule.operator;
    }
  })();

  switch (op) {
    case 'equals': return `${field} = ${sqlValue}`;
    case 'not_equals': return `${field} != ${sqlValue}`;
    case 'greater_than': return `${field} > ${sqlValue}`;
    case 'less_than': return `${field} < ${sqlValue}`;
    case 'greater_than_or_equal': return `${field} >= ${sqlValue}`;
    case 'less_than_or_equal': return `${field} <= ${sqlValue}`;
    case 'contains': return `${field} LIKE '%${String(rule.value).replace(/'/g, "''")}%'`;
    case 'not_contains': return `${field} NOT LIKE '%${String(rule.value).replace(/'/g, "''")}%'`;
    case 'starts_with': return `${field} LIKE '${String(rule.value).replace(/'/g, "''")}%'`;
    case 'ends_with': return `${field} LIKE '%${String(rule.value).replace(/'/g, "''")}'`;
    case 'is_null': return `${field} IS NULL`;
    case 'is_not_null': return `${field} IS NOT NULL`;
    default: return `${field} = ${sqlValue}`;
  }
}

function ruleToSql(rule: FilterRule, dbType: string): string {
  if (rule.type === 'condition') return conditionToSql(rule, dbType);
  const parts = rule.children.map(child => ruleToSql(child, dbType)).filter(Boolean);
  if (parts.length === 0) return '1=1';
  if (rule.logic === 'not') return `NOT (${parts.join(' AND ')})`;
  return `(${parts.join(rule.logic === 'or' ? ' OR ' : ' AND ')})`;
}

export function filterRulesToCaseWhen(
  rules: unknown,
  sourceFieldOrTrueValue: string,
  defaultValue: string,
  dbType = 'postgres',
  isSourceField = true
): string {
  if (!rules || typeof rules !== 'object' || !('type' in (rules as object))) {
    throw new Error('Invalid filter rules structure');
  }
  const condition = ruleToSql(rules as FilterRule, dbType);
  const whenTrue = isSourceField
    ? quoteIdentifier(sourceFieldOrTrueValue, dbType)
    : escapeValue(sourceFieldOrTrueValue, dbType);
  const whenFalse = escapeValue(defaultValue, dbType);
  return `CASE WHEN ${condition} THEN ${whenTrue} ELSE ${whenFalse} END`;
}
