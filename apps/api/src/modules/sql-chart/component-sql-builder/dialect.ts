import type { SupportedDialect, ComponentConfig } from './types.js';

export interface Dialect {
  escapeField: (field: string) => string;
  formatAlias: (alias: string) => string;
  castNumeric: (expr: string) => string;
  count: (expr: string) => string;
  countDistinct: (expr: string) => string;
  limitClause: (limit: number) => string;
  limitOrderFallback: (hasLimit: boolean) => string;
  xAxisGrouping: (field: string, grouping: string, config: ComponentConfig) => string;
  timeFilter: (dateField: string, valueField: string, yearOffset: number, yearType: string, fiscalStart: number, timezone?: string) => string;
  weekNumberExpr: (field: string, config: ComponentConfig) => string;
  dateTimeFormat: (sourceField: string, format: string) => string | null;
  dateGrouping: (sourceField: string, grouping: string) => string | null;
}

function simpleEscape(open: string, close: string) {
  return (field: string) => `${open}${field}${close}`;
}

function simpleAlias(open: string, close: string) {
  return (alias: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias) ? `${open}${alias}${close}` : `${open}${alias.replace(new RegExp(close, 'g'), close + close)}${close}`;
}

const sqlserverDialect: Dialect = {
  escapeField: simpleEscape('[', ']'),
  formatAlias: simpleAlias('[', ']'),
  castNumeric: expr => `CAST(${expr} AS DECIMAL(18,2))`,
  count: expr => `COUNT_BIG(${expr})`,
  countDistinct: expr => `COUNT_BIG(DISTINCT ${expr})`,
  limitClause: n => `OFFSET 0 ROWS FETCH NEXT ${n} ROWS ONLY`,
  limitOrderFallback: hasLimit => hasLimit ? 'ORDER BY (SELECT NULL)' : '',
  xAxisGrouping(field, grouping) {
    const f = `[${field}]`;
    switch (grouping) {
      case 'year': return `YEAR(${f})`;
      case 'quarter': return `CONCAT(YEAR(${f}), '-Q', DATEPART(QUARTER, ${f}))`;
      case 'month': case 'yearMonth': return `FORMAT(${f}, 'yyyy-MM-01')`;
      case 'week': return `DATEPART(WEEK, ${f})`;
      case 'day': return `CAST(${f} AS DATE)`;
      case 'hour': return `FORMAT(${f}, 'yyyy-MM-dd HH:00:00')`;
      case 'minute': return `FORMAT(${f}, 'yyyy-MM-dd HH:mm:00')`;
      default: return f;
    }
  },
  timeFilter(dateField, valueField, yearOffset, yearType, fiscalStart, _tz) {
    const y = new Date().getFullYear() - yearOffset;
    const [start, end] = yearType === 'fiscal'
      ? [`${y}-${String(fiscalStart).padStart(2, '0')}-01`, `${y + 1}-${String(fiscalStart).padStart(2, '0')}-01`]
      : [`${y}-01-01`, `${y + 1}-01-01`];
    return `COALESCE(SUM(CASE WHEN [${dateField}] >= '${start}' AND [${dateField}] < '${end}' THEN CAST([${valueField}] AS DECIMAL(18,2)) ELSE NULL END), 0)`;
  },
  weekNumberExpr: (field, cfg) => cfg.weekNumbering === 'iso' ? `DATEPART(ISO_WEEK, [${field}])` : `DATEPART(WEEK, [${field}])`,
  dateTimeFormat(src, fmt) {
    const f = `[${src}]`;
    const map: Record<string, string> = {
      'HH:00': `FORMAT(${f}, 'HH:00')`, 'HH:MM': `FORMAT(${f}, 'HH:mm')`,
      'YYYY-MM-DD': `FORMAT(${f}, 'yyyy-MM-dd')`, 'YYYY-MM': `FORMAT(${f}, 'yyyy-MM')`,
      'YYYY': `FORMAT(${f}, 'yyyy')`, 'MM': `FORMAT(${f}, 'MM')`, 'DD': `FORMAT(${f}, 'dd')`,
      'MMMM': `DATENAME(MONTH, ${f})`, 'Q': `CONCAT('Q', DATEPART(QUARTER, ${f}))`,
      'YYYY-Q': `CONCAT(FORMAT(${f}, 'yyyy'), '-Q', DATEPART(QUARTER, ${f}))`,
    };
    return map[fmt] ?? null;
  },
  dateGrouping(src, grouping) {
    const f = `[${src}]`;
    switch (grouping) {
      case 'timeOfDay': return `CASE WHEN DATEPART(HOUR,${f}) BETWEEN 6 AND 11 THEN 'Morning' WHEN DATEPART(HOUR,${f}) BETWEEN 12 AND 16 THEN 'Afternoon' WHEN DATEPART(HOUR,${f}) BETWEEN 17 AND 20 THEN 'Evening' ELSE 'Night' END`;
      case 'mealPeriod': return `CASE WHEN DATEPART(HOUR,${f}) BETWEEN 6 AND 10 THEN 'Breakfast' WHEN DATEPART(HOUR,${f}) BETWEEN 11 AND 14 THEN 'Lunch' WHEN DATEPART(HOUR,${f}) BETWEEN 15 AND 17 THEN 'Snacks' WHEN DATEPART(HOUR,${f}) BETWEEN 18 AND 21 THEN 'Dinner' ELSE 'Late Night' END`;
      case 'dayOfWeek': return `DATENAME(WEEKDAY, ${f})`;
      case 'dayOfWeekNumber': return `CAST(DATEPART(WEEKDAY, ${f}) AS NVARCHAR)`;
      case 'weekdayWeekend': return `CASE WHEN DATEPART(WEEKDAY,${f}) BETWEEN 2 AND 6 THEN 'Weekday' ELSE 'Weekend' END`;
      case 'month': return `DATENAME(MONTH, ${f})`;
      default: return null;
    }
  }
};

const mysqlDialect: Dialect = {
  escapeField: simpleEscape('`', '`'),
  formatAlias: simpleAlias('`', '`'),
  castNumeric: expr => `CAST(${expr} AS DECIMAL)`,
  count: expr => `COUNT(${expr})`,
  countDistinct: expr => `COUNT(DISTINCT ${expr})`,
  limitClause: n => `LIMIT ${n}`,
  limitOrderFallback: () => '',
  xAxisGrouping(field, grouping) {
    const f = `\`${field}\``;
    switch (grouping) {
      case 'year': return `YEAR(${f})`;
      case 'quarter': return `CONCAT(YEAR(${f}), '-Q', QUARTER(${f}))`;
      case 'month': case 'yearMonth': return `DATE_FORMAT(${f}, '%Y-%m-01')`;
      case 'week': return `YEARWEEK(${f})`;
      case 'day': return `DATE(${f})`;
      case 'hour': return `DATE_FORMAT(${f}, '%Y-%m-%d %H:00:00')`;
      case 'minute': return `DATE_FORMAT(${f}, '%Y-%m-%d %H:%i:00')`;
      default: return f;
    }
  },
  timeFilter(dateField, valueField, yearOffset, yearType, fiscalStart) {
    const y = new Date().getFullYear() - yearOffset;
    const [start, end] = yearType === 'fiscal'
      ? [`${y}-${String(fiscalStart).padStart(2, '0')}-01`, `${y + 1}-${String(fiscalStart).padStart(2, '0')}-01`]
      : [`${y}-01-01`, `${y + 1}-01-01`];
    return `COALESCE(SUM(CASE WHEN \`${dateField}\` >= '${start}' AND \`${dateField}\` < '${end}' THEN CAST(\`${valueField}\` AS DECIMAL) ELSE NULL END), 0)`;
  },
  weekNumberExpr: (field, cfg) => `CAST(WEEK(\`${field}\`, ${cfg.weekNumbering === 'iso' ? 3 : 0}) AS UNSIGNED)`,
  dateTimeFormat(src, fmt) {
    const f = `\`${src}\``;
    const map: Record<string, string> = {
      'YYYY-MM-DD': `DATE_FORMAT(${f}, '%Y-%m-%d')`, 'YYYY-MM': `DATE_FORMAT(${f}, '%Y-%m')`,
      'YYYY': `YEAR(${f})`, 'MM': `DATE_FORMAT(${f}, '%m')`, 'DD': `DATE_FORMAT(${f}, '%d')`,
      'MMMM': `MONTHNAME(${f})`, 'HH:00': `DATE_FORMAT(${f}, '%H:00')`,
      'YYYY-Q': `CONCAT(YEAR(${f}), '-Q', QUARTER(${f}))`,
    };
    return map[fmt] ?? null;
  },
  dateGrouping(src, grouping) {
    const f = `\`${src}\``;
    switch (grouping) {
      case 'timeOfDay': return `CASE WHEN HOUR(${f}) BETWEEN 6 AND 11 THEN 'Morning' WHEN HOUR(${f}) BETWEEN 12 AND 16 THEN 'Afternoon' WHEN HOUR(${f}) BETWEEN 17 AND 20 THEN 'Evening' ELSE 'Night' END`;
      case 'mealPeriod': return `CASE WHEN HOUR(${f}) BETWEEN 6 AND 10 THEN 'Breakfast' WHEN HOUR(${f}) BETWEEN 11 AND 14 THEN 'Lunch' WHEN HOUR(${f}) BETWEEN 15 AND 17 THEN 'Snacks' WHEN HOUR(${f}) BETWEEN 18 AND 21 THEN 'Dinner' ELSE 'Late Night' END`;
      case 'dayOfWeek': return `DAYNAME(${f})`;
      case 'dayOfWeekNumber': return `DAYOFWEEK(${f})`;
      case 'weekdayWeekend': return `CASE WHEN DAYOFWEEK(${f}) BETWEEN 2 AND 6 THEN 'Weekday' ELSE 'Weekend' END`;
      case 'month': return `MONTHNAME(${f})`;
      default: return null;
    }
  }
};

const postgresDialect: Dialect = {
  escapeField: simpleEscape('"', '"'),
  formatAlias: simpleAlias('"', '"'),
  castNumeric: expr => `(${expr})::numeric`,
  count: expr => `COUNT(${expr})`,
  countDistinct: expr => `COUNT(DISTINCT ${expr})`,
  limitClause: n => `LIMIT ${n}`,
  limitOrderFallback: () => '',
  xAxisGrouping(field, grouping) {
    const f = `"${field}"`;
    switch (grouping) {
      case 'year': return `EXTRACT(YEAR FROM ${f})`;
      case 'quarter': return `CONCAT(EXTRACT(YEAR FROM ${f}), '-Q', EXTRACT(QUARTER FROM ${f}))`;
      case 'month': case 'yearMonth': return `DATE_TRUNC('month', ${f})`;
      case 'week': return `DATE_TRUNC('week', ${f})`;
      case 'day': return `DATE_TRUNC('day', ${f})`;
      case 'hour': return `DATE_TRUNC('hour', ${f})`;
      case 'minute': return `DATE_TRUNC('minute', ${f})`;
      default: return f;
    }
  },
  timeFilter(dateField, valueField, yearOffset, yearType, fiscalStart, tz = 'UTC') {
    const y = new Date().getFullYear() - yearOffset;
    const [start, end] = yearType === 'fiscal'
      ? [`${y}-${String(fiscalStart).padStart(2, '0')}-01`, `${y + 1}-${String(fiscalStart).padStart(2, '0')}-01`]
      : [`${y}-01-01`, `${y + 1}-01-01`];
    const df = `"${dateField}" AT TIME ZONE '${tz}'`;
    return `COALESCE(SUM(CASE WHEN ${df} >= '${start}' AND ${df} < '${end}' THEN CAST("${valueField}" AS DECIMAL) ELSE NULL END), 0)`;
  },
  weekNumberExpr: (field, cfg) => cfg.weekNumbering === 'iso' ? `EXTRACT(ISODOW FROM "${field}")` : `EXTRACT(WEEK FROM "${field}")`,
  dateTimeFormat(src, fmt) {
    const f = `"${src}"`;
    const map: Record<string, string> = {
      'YYYY-MM-DD': `TO_CHAR(${f}, 'YYYY-MM-DD')`, 'YYYY-MM': `TO_CHAR(${f}, 'YYYY-MM')`,
      'YYYY': `EXTRACT(YEAR FROM ${f})`, 'MMMM': `TO_CHAR(${f}, 'Month')`,
      'MM': `TO_CHAR(${f}, 'MM')`, 'DD': `TO_CHAR(${f}, 'DD')`,
      'HH:00': `TO_CHAR(${f}, 'HH24:00')`, 'YYYY-Q': `CONCAT(EXTRACT(YEAR FROM ${f}), '-Q', EXTRACT(QUARTER FROM ${f}))`,
    };
    return map[fmt] ?? null;
  },
  dateGrouping(src, grouping) {
    const f = `"${src}"`;
    switch (grouping) {
      case 'timeOfDay': return `CASE WHEN EXTRACT(HOUR FROM ${f}) BETWEEN 6 AND 11 THEN 'Morning' WHEN EXTRACT(HOUR FROM ${f}) BETWEEN 12 AND 16 THEN 'Afternoon' WHEN EXTRACT(HOUR FROM ${f}) BETWEEN 17 AND 20 THEN 'Evening' ELSE 'Night' END`;
      case 'dayOfWeek': return `TO_CHAR(${f}, 'Day')`;
      case 'weekdayWeekend': return `CASE WHEN EXTRACT(ISODOW FROM ${f}) <= 5 THEN 'Weekday' ELSE 'Weekend' END`;
      case 'month': return `TO_CHAR(${f}, 'Month')`;
      default: return null;
    }
  }
};

const databricksDialect: Dialect = {
  escapeField: simpleEscape('`', '`'),
  formatAlias: simpleAlias('`', '`'),
  castNumeric: expr => `CAST(${expr} AS DECIMAL(18,2))`,
  count: expr => `COUNT(${expr})`,
  countDistinct: expr => `COUNT(DISTINCT ${expr})`,
  limitClause: n => `LIMIT ${n}`,
  limitOrderFallback: () => '',
  xAxisGrouping(field, grouping) {
    const f = `\`${field}\``;
    switch (grouping) {
      case 'year': return `YEAR(${f})`;
      case 'quarter': return `CONCAT(YEAR(${f}), '-Q', QUARTER(${f}))`;
      case 'month': case 'yearMonth': return `DATE_TRUNC('month', ${f})`;
      case 'week': return `DATE_TRUNC('week', ${f})`;
      case 'day': return `DATE_TRUNC('day', ${f})`;
      case 'hour': return `DATE_TRUNC('hour', ${f})`;
      case 'minute': return `DATE_TRUNC('minute', ${f})`;
      default: return f;
    }
  },
  timeFilter(dateField, valueField, yearOffset, yearType, fiscalStart) {
    const y = new Date().getFullYear() - yearOffset;
    const [start, end] = yearType === 'fiscal'
      ? [`${y}-${String(fiscalStart).padStart(2, '0')}-01`, `${y + 1}-${String(fiscalStart).padStart(2, '0')}-01`]
      : [`${y}-01-01`, `${y + 1}-01-01`];
    return `COALESCE(SUM(CASE WHEN \`${dateField}\` >= '${start}' AND \`${dateField}\` < '${end}' THEN CAST(\`${valueField}\` AS DECIMAL(18,2)) ELSE NULL END), 0)`;
  },
  weekNumberExpr: field => `WEEKOFYEAR(\`${field}\`)`,
  dateTimeFormat(src, fmt) {
    const f = `\`${src}\``;
    const map: Record<string, string> = {
      'YYYY-MM-DD': `DATE_FORMAT(${f}, 'yyyy-MM-dd')`,
      'YYYY-MM': `DATE_FORMAT(${f}, 'yyyy-MM')`,
      'YYYY': `YEAR(${f})`,
      'MM': `DATE_FORMAT(${f}, 'MM')`,
      'DD': `DATE_FORMAT(${f}, 'dd')`,
      'MMMM': `DATE_FORMAT(${f}, 'MMMM')`,
      'HH:00': `DATE_FORMAT(${f}, 'HH:00')`,
      'YYYY-Q': `CONCAT(YEAR(${f}), '-Q', QUARTER(${f}))`,
    };
    return map[fmt] ?? null;
  },
  dateGrouping(src, grouping) {
    const f = `\`${src}\``;
    switch (grouping) {
      case 'timeOfDay': return `CASE WHEN HOUR(${f}) BETWEEN 6 AND 11 THEN 'Morning' WHEN HOUR(${f}) BETWEEN 12 AND 16 THEN 'Afternoon' WHEN HOUR(${f}) BETWEEN 17 AND 20 THEN 'Evening' ELSE 'Night' END`;
      case 'mealPeriod': return `CASE WHEN HOUR(${f}) BETWEEN 6 AND 10 THEN 'Breakfast' WHEN HOUR(${f}) BETWEEN 11 AND 14 THEN 'Lunch' WHEN HOUR(${f}) BETWEEN 15 AND 17 THEN 'Snacks' WHEN HOUR(${f}) BETWEEN 18 AND 21 THEN 'Dinner' ELSE 'Late Night' END`;
      case 'dayOfWeek': return `DATE_FORMAT(${f}, 'EEEE')`;
      case 'dayOfWeekNumber': return `DAYOFWEEK(${f})`;
      case 'weekdayWeekend': return `CASE WHEN DAYOFWEEK(${f}) BETWEEN 2 AND 6 THEN 'Weekday' ELSE 'Weekend' END`;
      case 'month': return `DATE_FORMAT(${f}, 'MMMM')`;
      default: return null;
    }
  }
};

export function getDialect(dbType: string): Dialect {
  const t = dbType.toLowerCase();
  if (t === 'sqlserver' || t === 'mssql') return sqlserverDialect;
  if (t === 'mysql' || t === 'mariadb') return mysqlDialect;
  if (t === 'databricks' || t === 'spark') return databricksDialect;
  return postgresDialect;
}

export function toSnakeCase(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function getAggregationSql(
  field: string | null,
  summarize: string,
  alias: string | undefined,
  expression: string | undefined,
  d: Dialect
): string | null {
  const src = expression ?? (field ? d.escapeField(field) : null);
  if (!src) return null;
  const a = d.formatAlias(alias ?? field ?? 'value');
  switch (summarize.toLowerCase()) {
    case 'sum': return `SUM(${src}) as ${a}`;
    case 'avg': case 'average': return `AVG(${src}) as ${a}`;
    case 'count': return `${d.count(src)} as ${a}`;
    case 'count_distinct': case 'countdistinct': return `${d.countDistinct(src)} as ${a}`;
    case 'min': return `MIN(${src}) as ${a}`;
    case 'max': return `MAX(${src}) as ${a}`;
    case 'none': case '': return null;
    default: return null;
  }
}
