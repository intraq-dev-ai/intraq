import type { ComponentConfig, FilterCondition, ComponentSqlResult } from './types.js';
import type { Dialect } from './dialect.js';
import { getAggregationSql } from './dialect.js';
import { buildWhereClause } from './where-builder.js';
import {
  buildCalcFieldMap,
  buildCalcFieldExpression,
  calcFieldBackgroundName,
  isAggregateExpression
} from './calc-fields.js';

export function buildMatrixSql(
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

  const addDimension = (fieldDef: { field: string; summarize?: string }) => {
    const calcField = calcMap.get(fieldDef.field);
    if (calcField) {
      const expr = buildCalcFieldExpression(calcField, d, dbType);
      if (expr) {
        const alias = d.formatAlias(calcFieldBackgroundName(calcField));
        selectFields.push(`${expr} as ${alias}`);
        groupByFields.push(expr);
      }
    } else {
      const esc = d.escapeField(fieldDef.field);
      selectFields.push(esc);
      groupByFields.push(esc);
    }
  };

  const addMeasure = (fieldDef: { field: string; summarize?: string }) => {
    const calcField = calcMap.get(fieldDef.field);
    const agg = fieldDef.summarize ?? 'sum';
    if (calcField) {
      const expr = buildCalcFieldExpression(calcField, d, dbType);
      if (expr) {
        if (isAggregateExpression(expr)) {
          aggregateFields.push(`${expr} as ${d.formatAlias(calcFieldBackgroundName(calcField))}`);
        } else {
          const sql = getAggregationSql(null, agg, calcFieldBackgroundName(calcField), expr, d);
          if (sql) aggregateFields.push(sql);
        }
        return;
      }
    }
    const sql = getAggregationSql(fieldDef.field, agg, undefined, undefined, d);
    if (sql) aggregateFields.push(sql);
  };

  for (const f of config.rowFields ?? []) addDimension(f);
  for (const f of config.columnFields ?? []) addDimension(f);
  for (const f of config.valueFields ?? []) addMeasure(f);

  const projection = [...selectFields, ...aggregateFields];
  const where = buildWhereClause(filters, d);
  const groupBy = groupByFields.length > 0 ? `GROUP BY ${groupByFields.join(', ')}` : '';

  const effectiveLimit = limit ?? config.limit;
  const limitFallback = effectiveLimit && !skipLimit ? d.limitOrderFallback(true) : '';
  const limitClause = !skipLimit && effectiveLimit ? d.limitClause(effectiveLimit) : '';

  const sql = [
    `SELECT ${projection.join(', ') || '*'}`,
    `FROM ${tableName}`,
    where, groupBy, limitFallback,
    skipLimit ? '' : limitClause
  ].filter(Boolean).join('\n');

  return { sql, requiresGroupBy: groupByFields.length > 0 };
}
