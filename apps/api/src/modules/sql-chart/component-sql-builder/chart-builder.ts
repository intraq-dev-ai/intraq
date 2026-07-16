import type { ComponentConfig, FilterCondition, ComponentSqlResult } from './types.js';
import type { Dialect } from './dialect.js';
import { getAggregationSql } from './dialect.js';
import { buildWhereClause, buildOrderByClause, separateHavingFilters } from './where-builder.js';
import {
  buildCalcFieldMap,
  buildCalcFieldExpression,
  calcFieldBackgroundName,
  collectCalcFieldDependencies,
  isAggregateExpression
} from './calc-fields.js';
import { buildGeneratedXAxisBucket, withGeneratedXAxisBucket } from '../x-axis-generated-bucket.js';

export function buildChartSql(
  tableName: string,
  config: ComponentConfig,
  filters: FilterCondition[],
  d: Dialect,
  dbType: string,
  limit?: number,
  skipLimit = false
): ComponentSqlResult {
  const bucket = buildGeneratedXAxisBucket(config);
  const effectiveConfig = bucket ? withGeneratedXAxisBucket(config, bucket) : config;
  const calcMap = buildCalcFieldMap(effectiveConfig.calculatedFields);
  const selectFields: string[] = [];
  const groupByFields: string[] = [];
  const aggregateFields: string[] = [];
  const aggregateExprMap = new Map<string, string>();
  const aggregatedFieldNames = new Set<string>();
  let requiresGroupBy = false;
  let orderByField: string | undefined;

  const addGroup = (field: string) => {
    if (field && !groupByFields.includes(d.escapeField(field))) groupByFields.push(d.escapeField(field));
  };
  const addSelect = (field: string) => {
    const esc = d.escapeField(field);
    if (field && !selectFields.includes(esc) && !aggregatedFieldNames.has(field)) selectFields.push(esc);
  };
  const addAgg = (field: string | null, summarize = 'sum', alias?: string, expression?: string) => {
    const sql = getAggregationSql(field, summarize, alias, expression, d);
    if (!sql) { if (field) addGroup(field); return; }
    aggregateFields.push(sql);
    const aliasOrField = alias ?? field ?? '';
    const expr = sql.replace(/\s+as\s+.+$/i, '').trim();
    aggregateExprMap.set(aliasOrField.toLowerCase(), expr);
    if (field) aggregateExprMap.set(field.toLowerCase(), expr);
    requiresGroupBy = true;
    if (field && (!alias || alias === field)) {
      aggregatedFieldNames.add(field);
      const idx = selectFields.indexOf(d.escapeField(field));
      if (idx >= 0) selectFields.splice(idx, 1);
      const gidx = groupByFields.indexOf(d.escapeField(field));
      if (gidx >= 0) groupByFields.splice(gidx, 1);
    }
  };

  // X-axis / dimension
  if (effectiveConfig.xField) {
    const calcField = calcMap.get(effectiveConfig.xField);
    if (calcField) {
      const expr = buildCalcFieldExpression(calcField, d, dbType);
      if (expr) {
        const alias = d.formatAlias(calcFieldBackgroundName(calcField));
        selectFields.push(`${expr} as ${alias}`);
        groupByFields.push(expr);
        orderByField = expr;
      }
    } else if (effectiveConfig.xAxisGrouping) {
      const grouped = d.xAxisGrouping(effectiveConfig.xField, effectiveConfig.xAxisGrouping, effectiveConfig);
      const alias = d.formatAlias(`${effectiveConfig.xField}__grouped`);
      groupByFields.push(grouped);
      selectFields.push(`${grouped} as ${alias}`);
      if (effectiveConfig.xAxisGrouping === 'week') {
        const weekExpr = d.weekNumberExpr(effectiveConfig.xField, effectiveConfig);
        const weekAlias = d.formatAlias(`${effectiveConfig.xField}__value`);
        if (!groupByFields.includes(weekExpr)) groupByFields.push(weekExpr);
        selectFields.push(`${weekExpr} as ${weekAlias}`);
      }
      orderByField = grouped;
    } else {
      addSelect(effectiveConfig.xField);
      addGroup(effectiveConfig.xField);
      orderByField = d.escapeField(effectiveConfig.xField);
    }
  }

  // seriesBy
  if (effectiveConfig.seriesBy) {
    const calcField = calcMap.get(effectiveConfig.seriesBy);
    if (calcField) {
      const expr = buildCalcFieldExpression(calcField, d, dbType);
      if (expr) {
        selectFields.push(`${expr} as ${d.formatAlias(calcFieldBackgroundName(calcField))}`);
        groupByFields.push(expr);
      }
    } else {
      addSelect(effectiveConfig.seriesBy);
      addGroup(effectiveConfig.seriesBy);
    }
  }

  // Series/measures (ySeries + series arrays)
  const seriesArray = [
    ...(Array.isArray(effectiveConfig.ySeries) ? effectiveConfig.ySeries : []),
    ...(Array.isArray(effectiveConfig.series) ? effectiveConfig.series : [])
  ];

  const summarizeForSeriesField = (field: string | undefined, explicit?: string): string => {
    if (explicit) return explicit;
    if (!field) return 'sum';
    return effectiveConfig.ySeriesSummarize?.[field]
      ?? effectiveConfig.aggregations?.[field]
      ?? 'sum';
  };

  for (const entry of seriesArray) {
    const { field, summarize, alias, expression } = typeof entry === 'string'
      ? { field: entry, summarize: summarizeForSeriesField(entry), alias: undefined, expression: undefined }
      : {
          field: entry.field,
          summarize: summarizeForSeriesField(entry.field, entry.summarize),
          alias: 'alias' in entry ? entry.alias : undefined,
          expression: 'expression' in entry ? entry.expression : undefined
        };

    const calcField = field ? calcMap.get(field) : undefined;
    if (calcField) {
      const timeFilterSql = buildCalcFieldExpression({ ...calcField, type: 'time_filter' } as any, d, dbType);
      if (calcField.type === 'time_filter' && timeFilterSql) {
        aggregateFields.push(`${timeFilterSql} as ${d.formatAlias(alias ?? field ?? calcFieldBackgroundName(calcField))}`);
        requiresGroupBy = true;
        continue;
      }
      const expr = buildCalcFieldExpression(calcField, d, dbType);
      if (expr && isAggregateExpression(expr)) {
        const outputAlias = alias ?? field ?? calcFieldBackgroundName(calcField);
        aggregateFields.push(`${expr} as ${d.formatAlias(outputAlias)}`);
        aggregateExprMap.set(outputAlias.toLowerCase(), expr);
        if (field) aggregateExprMap.set(field.toLowerCase(), expr);
        requiresGroupBy = true;
        continue;
      }
      for (const dep of collectCalcFieldDependencies(calcField)) {
        if (!calcMap.has(dep)) addAgg(dep, summarize);
      }
    } else {
      addAgg(field, summarize, alias, expression);
    }
  }

  // Build SQL
  const projection = requiresGroupBy
    ? [...selectFields, ...aggregateFields]
    : selectFields.length > 0 ? selectFields : ['*'];

  const { rowFilters, havingClauses } = separateHavingFilters(filters, new Set(aggregatedFieldNames), aggregateExprMap, d);
  const where = buildWhereClause(rowFilters, d);

  let orderBy: string;
  if (config.xAxisSortOrder !== undefined && orderByField) {
    orderBy = `ORDER BY ${orderByField} ${config.xAxisSortOrder === 'desc' ? 'DESC' : 'ASC'}`;
  } else if (orderByField) {
    orderBy = `ORDER BY ${orderByField} ASC`;
  } else {
    orderBy = '';
  }

  const groupBy = requiresGroupBy && groupByFields.length > 0 ? `GROUP BY ${groupByFields.join(', ')}` : '';
  const having = havingClauses.length > 0 ? `HAVING ${havingClauses.join(' AND ')}` : '';
  const effectiveLimit = limit ?? effectiveConfig.limit ?? effectiveConfig.topN;
  const limitFallback = !orderBy && effectiveLimit && !skipLimit ? d.limitOrderFallback(true) : '';
  const limitClause = !skipLimit && effectiveLimit ? d.limitClause(effectiveLimit) : '';

  // ROW_NUMBER ranking for per-group top-N
  const ranking = effectiveConfig.ranking;
  const hasPgRanking = ranking?.rankWithinDimensions?.length && ranking.rankMetricField;

  let sql = [
    `SELECT ${projection.join(', ')}`,
    `FROM ${tableName}`,
    where, groupBy, having,
    orderBy || limitFallback,
    skipLimit ? '' : limitClause
  ].filter(Boolean).join('\n');

  if (hasPgRanking && ranking) {
    const partFields = (ranking.rankWithinDimensions ?? ranking.withinDimensions ?? []).map(f => d.escapeField(f)).join(', ');
    const dir = ranking.rankType === 'bottom' ? 'ASC' : 'DESC';
    const metric = d.escapeField(ranking.rankMetricField!);
    const rankLimit = ranking.rankLimit ?? 1;
    const rankPos = ranking.rankPosition;
    sql = `WITH base_query AS (\n${sql}\n),\nranked AS (\n  SELECT *, ROW_NUMBER() OVER (PARTITION BY ${partFields} ORDER BY ${metric} ${dir}) AS __rank\n  FROM base_query\n)\nSELECT * FROM ranked WHERE __rank ${rankPos ? `= ${rankPos}` : `<= ${rankLimit}`}`;
  }

  return { sql, requiresGroupBy };
}

export function buildSparklineSql(
  tableName: string,
  config: ComponentConfig,
  filters: FilterCondition[],
  d: Dialect
): string | null {
  if (!config.sparklineField || !config.sparklineXField) return null;
  const agg = config.sparklineAggregation ?? 'sum';
  const xField = d.escapeField(config.sparklineXField);
  const yExpr = agg === 'avg'
    ? `AVG(${d.castNumeric(d.escapeField(config.sparklineField))})`
    : agg === 'count' ? d.count(d.escapeField(config.sparklineField))
    : `SUM(${d.castNumeric(d.escapeField(config.sparklineField))})`;
  const groupFields = config.groupByFields?.length
    ? config.groupByFields.map(f => d.escapeField(f))
    : config.xField ? [d.escapeField(config.xField)] : [];
  const allGroupFields = [...groupFields, xField];
  const where = buildWhereClause(filters, d);
  const firstGroup = config.groupByFields?.[0] ?? config.xField ?? 'id';
  return [
    `SELECT ${[...allGroupFields, `${yExpr} as sparkline_y_value`].join(', ')}`,
    `FROM ${tableName}`,
    where,
    `GROUP BY ${allGroupFields.join(', ')}`,
    `ORDER BY ${d.escapeField(firstGroup)} ASC, ${xField} ASC`
  ].filter(Boolean).join('\n');
}
