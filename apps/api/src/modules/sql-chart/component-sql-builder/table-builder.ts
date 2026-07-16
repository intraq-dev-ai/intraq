import type { ComponentConfig, FilterCondition, ComponentSqlResult } from './types.js';
import type { Dialect } from './dialect.js';
import { getAggregationSql } from './dialect.js';
import { buildWhereClause, separateHavingFilters } from './where-builder.js';
import {
  buildCalcFieldMap,
  buildCalcFieldExpression,
  calcFieldBackgroundName,
  collectCalcFieldDependencies,
  isAggregateExpression
} from './calc-fields.js';

export function buildTableSql(
  tableName: string,
  config: ComponentConfig,
  filters: FilterCondition[],
  d: Dialect,
  dbType: string,
  limit?: number,
  skipLimit = false
): ComponentSqlResult {
  const calcMap = buildCalcFieldMap(config.calculatedFields);
  const selectFields: string[] = [];
  const groupByFields: string[] = [];
  const aggregateFields: string[] = [];
  const aggregateExprMap = new Map<string, string>();
  const aggregatedFieldNames = new Set<string>();
  let requiresGroupBy = false;
  let rowGroupingOrder = '';

  const addGroup = (field: string) => {
    if (aggregatedFieldNames.has(field)) return;
    if (field && !groupByFields.includes(d.escapeField(field))) groupByFields.push(d.escapeField(field));
  };
  const addSelect = (field: string) => {
    const esc = d.escapeField(field);
    if (!selectFields.includes(esc) && !aggregatedFieldNames.has(field)) selectFields.push(esc);
  };
  const addAgg = (field: string | null, summarize = 'sum', alias?: string, expression?: string) => {
    const sql = getAggregationSql(field, summarize, alias, expression, d);
    if (!sql) { if (field) addGroup(field); return; }
    aggregateFields.push(sql);
    const ak = (alias ?? field ?? '').toLowerCase();
    const expr = sql.replace(/\s+as\s+.+$/i, '').trim();
    aggregateExprMap.set(ak, expr);
    if (field) aggregateExprMap.set(field.toLowerCase(), expr);
    requiresGroupBy = true;
    if (field && (!alias || alias === field)) {
      aggregatedFieldNames.add(field);
      const i = selectFields.indexOf(d.escapeField(field));
      if (i >= 0) selectFields.splice(i, 1);
      const g = groupByFields.indexOf(d.escapeField(field));
      if (g >= 0) groupByFields.splice(g, 1);
    }
  };

  // Delta compare fields (cellType: 'delta')
  const deltaFields = new Map<string, string>();
  if (Array.isArray(config.columns)) {
    for (const col of config.columns) {
      if (col.cellType === 'delta' && col.deltaCompareField) {
        deltaFields.set(col.deltaCompareField, 'target_value');
      }
    }
  }

  // Process columns
  if (Array.isArray(config.columns)) {
    for (const col of config.columns) {
      const field = readColumnField(col);
      if (!field) continue;
      const calcField = calcMap.get(field);
      if (calcField && col.summarize && col.summarize !== 'none') {
        const expr = buildCalcFieldExpression(calcField, d, dbType);
        if (expr && isAggregateExpression(expr)) {
          const alias = calcFieldBackgroundName(calcField);
          aggregateFields.push(`${expr} as ${d.formatAlias(alias)}`);
          aggregateExprMap.set(alias.toLowerCase(), expr);
          aggregateExprMap.set(field.toLowerCase(), expr);
          requiresGroupBy = true;
        } else if (expr) {
          addAgg(null, col.summarize, calcFieldBackgroundName(calcField), expr);
        } else {
          for (const dep of collectCalcFieldDependencies(calcField)) {
            if (!calcMap.has(dep)) addAgg(dep, col.summarize);
          }
        }
      } else if (calcField) {
        const expr = buildCalcFieldExpression(calcField, d, dbType);
        if (expr && isAggregateExpression(expr)) {
          const alias = calcFieldBackgroundName(calcField);
          aggregateFields.push(`${expr} as ${d.formatAlias(alias)}`);
          aggregateExprMap.set(alias.toLowerCase(), expr);
          aggregateExprMap.set(field.toLowerCase(), expr);
          requiresGroupBy = true;
        } else if (expr) {
          selectFields.push(`${expr} as ${d.formatAlias(calcFieldBackgroundName(calcField))}`);
          if (!groupByFields.includes(expr)) groupByFields.push(expr);
        } else {
          for (const dep of collectCalcFieldDependencies(calcField)) {
            if (!calcMap.has(dep)) { addSelect(dep); addGroup(dep); }
          }
        }
      } else if (col.summarize && col.summarize !== 'none') {
        const sourceField = col.sourceField ?? field;
        addAgg(sourceField, col.summarize, col.alias ?? (sourceField !== field ? field : undefined));
      } else {
        addSelect(field);
        addGroup(field);
      }
    }
  }

  if (Array.isArray(config.fields)) {
    for (const field of config.fields) {
      if (typeof field !== 'string' || !field.trim()) continue;
      addSelect(field.trim());
      addGroup(field.trim());
    }
  }

  // Delta compare aggregations
  for (const [compareField, alias] of deltaFields) {
    addAgg(compareField, 'sum', alias);
  }

  // Row grouping ORDER BY
  const groupingFields = (() => {
    const raw = config.rowGrouping?.fields ?? config.rowGrouping?.groupBy ?? [];
    return raw.map(f => typeof f === 'string' ? f : (f.field ?? f.name ?? '')).filter(Boolean);
  })();
  if (groupingFields.length > 0) {
    for (const field of groupingFields) {
      addSelect(field);
      addGroup(field);
    }
    rowGroupingOrder = `ORDER BY ${groupingFields.map(f => `${d.escapeField(f)} ASC`).join(', ')}`;
  }

  const projection = requiresGroupBy
    ? [...selectFields, ...aggregateFields]
    : selectFields.length > 0 ? selectFields : ['*'];

  const { rowFilters, havingClauses } = separateHavingFilters(filters, new Set(aggregatedFieldNames), aggregateExprMap, d);
  const where = buildWhereClause(rowFilters, d);
  const groupBy = requiresGroupBy && groupByFields.length > 0 ? `GROUP BY ${groupByFields.join(', ')}` : '';
  const having = havingClauses.length > 0 ? `HAVING ${havingClauses.join(' AND ')}` : '';
  const effectiveLimit = limit ?? config.limit ?? config.topN;
  const explicitOrder = buildExplicitOrderBy(config, d);
  const limitFallback = !rowGroupingOrder && effectiveLimit && !skipLimit ? d.limitOrderFallback(true) : '';
  const limitClause = !skipLimit && effectiveLimit ? d.limitClause(effectiveLimit) : '';

  // Check for per-group ranking
  const ranking = config.ranking;
  const hasRanking = ranking?.rankWithinDimensions?.length && ranking.rankMetricField;

  let sql = [
    `SELECT ${projection.join(', ')}`,
    `FROM ${tableName}`,
    where, groupBy, having,
    rowGroupingOrder || explicitOrder || limitFallback,
    skipLimit || hasRanking ? '' : limitClause
  ].filter(Boolean).join('\n');

  if (hasRanking && ranking) {
    const partFields = (ranking.rankWithinDimensions ?? []).map(f => d.escapeField(f)).join(', ');
    const dir = ranking.rankType === 'bottom' ? 'ASC' : 'DESC';
    const metric = d.escapeField(ranking.rankMetricField!);
    const rankLimit = ranking.rankLimit ?? 1;
    const rankPos = ranking.rankPosition;
    sql = `WITH base_query AS (\n${sql}\n),\nranked AS (\n  SELECT *, ROW_NUMBER() OVER (PARTITION BY ${partFields} ORDER BY ${metric} ${dir}) AS __rank\n  FROM base_query\n)\nSELECT * FROM ranked WHERE __rank ${rankPos ? `= ${rankPos}` : `<= ${rankLimit}`}`;
  }

  return { sql, requiresGroupBy };
}

function buildExplicitOrderBy(config: ComponentConfig, d: Dialect): string {
  const field = readNonEmptyString(config.sortBy) ?? readNonEmptyString(config.rowSorting?.sortBy);
  if (!field) return '';
  const direction = normalizeSortDirection(config.sortDirection ?? config.sortOrder ?? config.rowSorting?.sortOrder);
  return `ORDER BY ${d.escapeField(field)} ${direction.toUpperCase()}`;
}

function normalizeSortDirection(value: unknown): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readColumnField(column: { field?: string; key?: string; name?: string }): string | undefined {
  return readNonEmptyString(column.field) ?? readNonEmptyString(column.key) ?? readNonEmptyString(column.name);
}
