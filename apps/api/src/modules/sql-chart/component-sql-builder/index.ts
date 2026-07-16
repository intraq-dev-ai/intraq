import type { ComponentConfig, FilterCondition, ComponentSqlResult } from './types.js';
import { getDialect } from './dialect.js';
import { buildChartSql, buildSparklineSql } from './chart-builder.js';
import { buildCardSql } from './card-builder.js';
import { buildTableSql } from './table-builder.js';
import { buildMatrixSql } from './matrix-builder.js';

export type { ComponentConfig, CalculatedField, FilterCondition, ComponentSqlResult, SupportedDialect } from './types.js';

const CHART_COMPONENTS = new Set(['BaseChart', 'ChartComponent', 'PieDonutChart', 'StackedChart']);

function resolveComponent(config: ComponentConfig): string {
  const hasStructuredColumns = Array.isArray(config.columns)
    && config.columns.some(column => typeof column === 'object' && column !== null && !Array.isArray(column));
  const hasLooseColumns = Array.isArray(config.columns) && config.columns.length > 0 && !hasStructuredColumns;
  const hasMatrixFields = Boolean(config.rowFields || config.columnFields);
  const hasChartSeries = Boolean(config.ySeries || config.series);
  if (config.component) return config.component;
  if (config.field && !config.columns && !config.rowFields) return 'CardComponent';
  if (hasMatrixFields) return 'MatrixComponent';
  if (config.xField && hasChartSeries && (!config.columns || hasLooseColumns)) return 'BaseChart';
  if (hasStructuredColumns) return 'TableComponent';
  return 'BaseChart';
}

export function buildComponentSql(
  dbType: string,
  tableName: string,
  config: ComponentConfig,
  filters: FilterCondition[] = [],
  database?: string,
  limit?: number,
  skipLimit = false
): ComponentSqlResult {
  const d = getDialect(dbType);
  const qualifiedTable = database && (dbType === 'sqlserver' || dbType === 'mssql')
    ? `${database}.dbo.${tableName}`
    : tableName;
  const component = resolveComponent(config);

  if (component === 'CardComponent') {
    return buildCardSql(qualifiedTable, config, filters, d, dbType, limit, skipLimit);
  }
  if (component === 'TableComponent') {
    return buildTableSql(qualifiedTable, config, filters, d, dbType, limit, skipLimit);
  }
  if (component === 'MatrixComponent') {
    return buildMatrixSql(qualifiedTable, config, filters, d, dbType, limit, skipLimit);
  }
  // BaseChart, PieDonutChart, StackedChart, ChartComponent, and auto-detected charts
  return buildChartSql(qualifiedTable, config, filters, d, dbType, limit, skipLimit);
}

export { buildSparklineSql } from './chart-builder.js';
