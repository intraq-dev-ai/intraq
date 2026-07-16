import type { ComponentConfig, FilterCondition, ComponentSqlResult } from './types.js';
import type { Dialect } from './dialect.js';
import { getAggregationSql } from './dialect.js';
import { buildWhereClause, buildOrderByClause } from './where-builder.js';
import {
  buildCalcFieldMap,
  buildCalcFieldExpression,
  isAggregateExpression
} from './calc-fields.js';

export function buildCardSql(
  tableName: string,
  config: ComponentConfig,
  filters: FilterCondition[],
  d: Dialect,
  dbType: string,
  limit?: number,
  skipLimit = false
): ComponentSqlResult {
  const calcMap = buildCalcFieldMap(config.calculatedFields);
  const groupByFields: string[] = [];
  const aggregateFields: string[] = [];
  const aggregateAliases = new Set<string>();
  let requiresGroupBy = false;

  const addGroup = (field: string) => {
    if (field && !groupByFields.includes(d.escapeField(field))) groupByFields.push(d.escapeField(field));
  };
  const addAgg = (field: string | null, summarize = 'sum', alias?: string, expression?: string) => {
    const resolvedAlias = alias ?? field ?? 'value';
    if (aggregateAliases.has(resolvedAlias)) return;
    const sql = getAggregationSql(field, summarize, alias, expression, d);
    if (!sql) { if (field) addGroup(field); return; }
    aggregateFields.push(sql);
    aggregateAliases.add(resolvedAlias);
    requiresGroupBy = true;
  };
  const addExpressionAgg = (expression: string, alias: string) => {
    if (aggregateAliases.has(alias)) return;
    aggregateFields.push(`${expression} as ${d.formatAlias(alias)}`);
    aggregateAliases.add(alias);
    requiresGroupBy = true;
  };
  const addMetricAgg = (field: string | undefined, summarize = 'sum') => {
    if (!field) return;
    const calcField = calcMap.get(field);
    if (calcField) {
      const expr = buildCalcFieldExpression(calcField, d, dbType);
      if (expr && isAggregateExpression(expr)) {
        addExpressionAgg(expr, field);
      } else if (expr) {
        addAgg(null, summarize, field, expr);
      } else {
        addAgg(field, summarize, field);
      }
    } else {
      addAgg(field, summarize, field);
    }
  };

  // Multi-card grouping
  if (config.xField) addGroup(config.xField);

  // Main value field
  if (config.field) {
    addMetricAgg(config.field, config.aggregationType ?? 'sum');
  }

  // Trend / comparison field
  if (config.trendField) {
    addMetricAgg(config.trendField, config.trendAggregation ?? config.aggregationType ?? 'sum');
  }

  if (config.comparisonField) {
    addMetricAgg(config.comparisonField, config.comparisonAggregation ?? config.trendAggregation ?? config.aggregationType ?? 'sum');
  }

  if (config.supportingField) {
    addMetricAgg(config.supportingField, config.supportingAggregation ?? 'avg');
  }

  const where = buildWhereClause(filters, d);
  const groupBy = requiresGroupBy && groupByFields.length > 0 ? `GROUP BY ${groupByFields.join(', ')}` : '';
  const orderBy = config.xField ? buildOrderByClause(config.xField, config.xAxisSortOrder, d) : '';

  const effectiveLimit = limit ?? config.limit ?? config.topN;
  const limitFallback = !orderBy && effectiveLimit && !skipLimit ? d.limitOrderFallback(true) : '';
  const limitClause = !skipLimit && effectiveLimit ? d.limitClause(effectiveLimit) : '';

  const sql = [
    `SELECT ${[...groupByFields, ...aggregateFields].join(', ') || '*'}`,
    `FROM ${tableName}`,
    where, groupBy, orderBy || limitFallback,
    skipLimit ? '' : limitClause
  ].filter(Boolean).join('\n');

  return { sql, requiresGroupBy };
}
