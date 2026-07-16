export type SqlDialect =
  | 'athena'
  | 'bigquery'
  | 'clickhouse'
  | 'databricks'
  | 'generic'
  | 'mysql'
  | 'oracle'
  | 'postgres'
  | 'snowflake'
  | 'sqlite'
  | 'sqlserver';

export function dialectForSourceType(value: string | undefined): SqlDialect {
  const normalized = (value ?? '').trim().toLowerCase();
  if (['postgres', 'postgresql', 'redshift'].includes(normalized)) return 'postgres';
  if (['mysql', 'mariadb'].includes(normalized)) return 'mysql';
  if (['mssql', 'sqlserver', 'sql_server', 'sql server'].includes(normalized)) return 'sqlserver';
  if (normalized === 'clickhouse') return 'clickhouse';
  if (normalized === 'athena') return 'athena';
  if (normalized === 'databricks' || normalized === 'spark') return 'databricks';
  if (normalized === 'bigquery') return 'bigquery';
  if (normalized === 'snowflake') return 'snowflake';
  if (normalized === 'oracle') return 'oracle';
  if (normalized === 'sqlite') return 'sqlite';
  return 'generic';
}

export function quoteSqlIdentifierForType(value: string, sourceType: string | undefined): string {
  return quoteSqlIdentifierForDialect(value, dialectForSourceType(sourceType));
}

export function quoteSqlIdentifierForDialect(value: string, dialect: SqlDialect): string {
  if (dialect === 'mysql' || dialect === 'clickhouse' || dialect === 'bigquery' || dialect === 'databricks') {
    return `\`${value.split('`').join('``')}\``;
  }
  if (dialect === 'sqlserver') return `[${value.split(']').join(']]')}]`;
  return `"${value.split('"').join('""')}"`;
}

export function dateFilterClauseForPrompt(
  sourceType: string | undefined,
  prompt: string,
  timeField: string
): string | null {
  const normalized = prompt.toLowerCase();
  const dialect = dialectForSourceType(sourceType);
  const period = periodForPrompt(normalized);
  if (!period) return null;
  const expression = dateExpressionForPeriod(dialect, period);
  const resolvedExpression = expression.replace(/\s+AND\s+([<>=])/gi, ` AND ${timeField} $1`);
  return resolvedExpression ? `WHERE ${timeField} ${resolvedExpression}` : null;
}

export function relativeDateExpressionForDays(sourceType: string | undefined, days: number): string {
  const dialect = dialectForSourceType(sourceType);
  if (dialect === 'mysql') return `DATE_SUB(CURRENT_DATE, INTERVAL ${days} DAY)`;
  if (dialect === 'sqlserver') return `DATEADD(day, -${days}, CAST(GETDATE() AS date))`;
  if (dialect === 'clickhouse') return `subtractDays(today(), ${days})`;
  if (dialect === 'athena') return `current_date - interval '${days}' day`;
  if (dialect === 'databricks') return `date_sub(current_date(), ${days})`;
  if (dialect === 'bigquery') return `DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)`;
  if (dialect === 'snowflake') return `DATEADD(day, -${days}, CURRENT_DATE())`;
  return `CURRENT_DATE - INTERVAL '${days} days'`;
}

export function currentDateExclusiveUpperBoundExpression(sourceType: string | undefined): string {
  const dialect = dialectForSourceType(sourceType);
  if (dialect === 'mysql') return 'DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)';
  if (dialect === 'sqlserver') return 'DATEADD(day, 1, CAST(GETDATE() AS date))';
  if (dialect === 'clickhouse') return 'addDays(today(), 1)';
  if (dialect === 'athena') return "current_date + interval '1' day";
  if (dialect === 'databricks') return 'date_add(current_date(), 1)';
  if (dialect === 'bigquery') return 'DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)';
  if (dialect === 'snowflake') return 'DATEADD(day, 1, CURRENT_DATE())';
  return "CURRENT_DATE + INTERVAL '1 day'";
}

type DatePeriod =
  | 'last_30_days'
  | 'last_7_days'
  | 'last_month'
  | 'last_quarter'
  | 'last_week'
  | 'last_year'
  | 'this_month'
  | 'this_week'
  | 'this_year'
  | 'today'
  | 'yesterday';

function periodForPrompt(prompt: string): DatePeriod | null {
  if (/\byesterday\b/.test(prompt)) return 'yesterday';
  if (/\btoday\b/.test(prompt)) return 'today';
  if (/\blast\s+7\s+days?\b/.test(prompt) || /\bpast\s+7\s+days?\b/.test(prompt)) return 'last_7_days';
  if (/\blast\s+week\b/.test(prompt) || /\bprevious\s+week\b/.test(prompt)) return 'last_week';
  if (/\bthis\s+week\b/.test(prompt)) return 'this_week';
  if (/\blast\s+30\s+days?\b/.test(prompt)) return 'last_30_days';
  if (/\blast\s+month\b/.test(prompt) || /\bprevious\s+month\b/.test(prompt)) return 'last_month';
  if (/\bthis\s+month\b/.test(prompt)) return 'this_month';
  if (/\blast\s+90\s+days?\b/.test(prompt) || /\blast\s+quarter\b/.test(prompt)) return 'last_quarter';
  if (/\blast\s+year\b/.test(prompt) || /\bprevious\s+year\b/.test(prompt)) return 'last_year';
  if (/\bthis\s+year\b/.test(prompt)) return 'this_year';
  return null;
}

function dateExpressionForPeriod(dialect: SqlDialect, period: DatePeriod): string {
  if (dialect === 'mysql') return mysqlDateExpression(period);
  if (dialect === 'sqlserver') return sqlServerDateExpression(period);
  if (dialect === 'clickhouse') return clickHouseDateExpression(period);
  if (dialect === 'athena') return athenaDateExpression(period);
  if (dialect === 'databricks') return databricksDateExpression(period);
  if (dialect === 'bigquery') return bigQueryDateExpression(period);
  if (dialect === 'snowflake') return snowflakeDateExpression(period);
  return postgresDateExpression(period);
}

function postgresDateExpression(period: DatePeriod): string {
  const today = 'CURRENT_DATE';
  if (period === 'today') return `= ${today}`;
  if (period === 'yesterday') return `= ${today} - INTERVAL '1 day'`;
  if (period === 'last_7_days' || period === 'last_week') return `>= ${today} - INTERVAL '7 days' AND < ${today} + INTERVAL '1 day'`;
  if (period === 'this_week') return `>= DATE_TRUNC('week', ${today})`;
  if (period === 'last_30_days') return `>= ${today} - INTERVAL '30 days' AND < ${today} + INTERVAL '1 day'`;
  if (period === 'this_month') return `>= DATE_TRUNC('month', ${today})`;
  if (period === 'last_month') return `>= DATE_TRUNC('month', ${today}) - INTERVAL '1 month' AND < DATE_TRUNC('month', ${today})`;
  if (period === 'last_quarter') return `>= ${today} - INTERVAL '90 days' AND < ${today} + INTERVAL '1 day'`;
  if (period === 'this_year') return `>= DATE_TRUNC('year', ${today})`;
  return `>= DATE_TRUNC('year', ${today}) - INTERVAL '1 year' AND < DATE_TRUNC('year', ${today})`;
}

function mysqlDateExpression(period: DatePeriod): string {
  if (period === 'today') return '= CURRENT_DATE';
  if (period === 'yesterday') return '= DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY)';
  if (period === 'last_7_days' || period === 'last_week') return '>= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY) AND < DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)';
  if (period === 'this_week') return '>= DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY)';
  if (period === 'last_30_days') return '>= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) AND < DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)';
  if (period === 'this_month') return ">= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')";
  if (period === 'last_month') return ">= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH), '%Y-%m-01') AND < DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')";
  if (period === 'last_quarter') return '>= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY) AND < DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)';
  if (period === 'this_year') return '>= MAKEDATE(YEAR(CURRENT_DATE), 1)';
  return '>= MAKEDATE(YEAR(CURRENT_DATE) - 1, 1) AND < MAKEDATE(YEAR(CURRENT_DATE), 1)';
}

function sqlServerDateExpression(period: DatePeriod): string {
  const today = 'CAST(GETDATE() AS date)';
  const monthStart = 'DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)';
  const yearStart = 'DATEFROMPARTS(YEAR(GETDATE()), 1, 1)';
  if (period === 'today') return `= ${today}`;
  if (period === 'yesterday') return `= DATEADD(day, -1, ${today})`;
  if (period === 'last_7_days' || period === 'last_week') return `>= DATEADD(day, -7, ${today}) AND < DATEADD(day, 1, ${today})`;
  if (period === 'this_week') return '>= DATEADD(week, DATEDIFF(week, 0, GETDATE()), 0)';
  if (period === 'last_30_days') return `>= DATEADD(day, -30, ${today}) AND < DATEADD(day, 1, ${today})`;
  if (period === 'this_month') return `>= ${monthStart}`;
  if (period === 'last_month') return `>= DATEADD(month, -1, ${monthStart}) AND < ${monthStart}`;
  if (period === 'last_quarter') return `>= DATEADD(day, -90, ${today}) AND < DATEADD(day, 1, ${today})`;
  if (period === 'this_year') return `>= ${yearStart}`;
  return `>= DATEADD(year, -1, ${yearStart}) AND < ${yearStart}`;
}

function clickHouseDateExpression(period: DatePeriod): string {
  if (period === 'today') return '= today()';
  if (period === 'yesterday') return '= subtractDays(today(), 1)';
  if (period === 'last_7_days' || period === 'last_week') return '>= subtractDays(today(), 7) AND < addDays(today(), 1)';
  if (period === 'this_week') return '>= toStartOfWeek(today())';
  if (period === 'last_30_days') return '>= subtractDays(today(), 30) AND < addDays(today(), 1)';
  if (period === 'this_month') return '>= toStartOfMonth(today())';
  if (period === 'last_month') return '>= subtractMonths(toStartOfMonth(today()), 1) AND < toStartOfMonth(today())';
  if (period === 'last_quarter') return '>= subtractDays(today(), 90) AND < addDays(today(), 1)';
  if (period === 'this_year') return '>= toStartOfYear(today())';
  return '>= subtractYears(toStartOfYear(today()), 1) AND < toStartOfYear(today())';
}

function athenaDateExpression(period: DatePeriod): string {
  if (period === 'today') return '= current_date';
  if (period === 'yesterday') return "= current_date - interval '1' day";
  if (period === 'last_7_days' || period === 'last_week') return ">= current_date - interval '7' day AND < current_date + interval '1' day";
  if (period === 'this_week') return ">= date_trunc('week', current_date)";
  if (period === 'last_30_days') return ">= current_date - interval '30' day AND < current_date + interval '1' day";
  if (period === 'this_month') return ">= date_trunc('month', current_date)";
  if (period === 'last_month') return ">= date_trunc('month', current_date) - interval '1' month AND < date_trunc('month', current_date)";
  if (period === 'last_quarter') return ">= current_date - interval '90' day AND < current_date + interval '1' day";
  if (period === 'this_year') return ">= date_trunc('year', current_date)";
  return ">= date_trunc('year', current_date) - interval '1' year AND < date_trunc('year', current_date)";
}

function databricksDateExpression(period: DatePeriod): string {
  const today = 'current_date()';
  if (period === 'today') return `= ${today}`;
  if (period === 'yesterday') return `= date_sub(${today}, 1)`;
  if (period === 'last_7_days' || period === 'last_week') return `>= date_sub(${today}, 7) AND < date_add(${today}, 1)`;
  if (period === 'this_week') return `>= date_trunc('week', ${today})`;
  if (period === 'last_30_days') return `>= date_sub(${today}, 30) AND < date_add(${today}, 1)`;
  if (period === 'this_month') return `>= date_trunc('month', ${today})`;
  if (period === 'last_month') return `>= add_months(date_trunc('month', ${today}), -1) AND < date_trunc('month', ${today})`;
  if (period === 'last_quarter') return `>= date_sub(${today}, 90) AND < date_add(${today}, 1)`;
  if (period === 'this_year') return `>= date_trunc('year', ${today})`;
  return `>= add_months(date_trunc('year', ${today}), -12) AND < date_trunc('year', ${today})`;
}

function bigQueryDateExpression(period: DatePeriod): string {
  if (period === 'today') return '= CURRENT_DATE()';
  if (period === 'yesterday') return '= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)';
  if (period === 'last_7_days' || period === 'last_week') return '>= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)';
  if (period === 'this_week') return '>= DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY))';
  if (period === 'last_30_days') return '>= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)';
  if (period === 'this_month') return '>= DATE_TRUNC(CURRENT_DATE(), MONTH)';
  if (period === 'last_month') return '>= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH) AND < DATE_TRUNC(CURRENT_DATE(), MONTH)';
  if (period === 'last_quarter') return '>= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) AND < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)';
  if (period === 'this_year') return '>= DATE_TRUNC(CURRENT_DATE(), YEAR)';
  return '>= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 1 YEAR) AND < DATE_TRUNC(CURRENT_DATE(), YEAR)';
}

function snowflakeDateExpression(period: DatePeriod): string {
  if (period === 'today') return '= CURRENT_DATE()';
  if (period === 'yesterday') return '= DATEADD(day, -1, CURRENT_DATE())';
  if (period === 'last_7_days' || period === 'last_week') return '>= DATEADD(day, -7, CURRENT_DATE()) AND < DATEADD(day, 1, CURRENT_DATE())';
  if (period === 'this_week') return ">= DATE_TRUNC('week', CURRENT_DATE())";
  if (period === 'last_30_days') return '>= DATEADD(day, -30, CURRENT_DATE()) AND < DATEADD(day, 1, CURRENT_DATE())';
  if (period === 'this_month') return ">= DATE_TRUNC('month', CURRENT_DATE())";
  if (period === 'last_month') return ">= DATEADD(month, -1, DATE_TRUNC('month', CURRENT_DATE())) AND < DATE_TRUNC('month', CURRENT_DATE())";
  if (period === 'last_quarter') return '>= DATEADD(day, -90, CURRENT_DATE()) AND < DATEADD(day, 1, CURRENT_DATE())';
  if (period === 'this_year') return ">= DATE_TRUNC('year', CURRENT_DATE())";
  return ">= DATEADD(year, -1, DATE_TRUNC('year', CURRENT_DATE())) AND < DATE_TRUNC('year', CURRENT_DATE())";
}
