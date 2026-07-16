import type { MetricFormatOptions } from './formatting';
import { tableCellDisplay } from './table-cell-formatting';
import { resolveTableConditionalPatch } from './table-conditional-formatting';
import { cssVariable, readCssColor } from './table-view-model-format-utils';
import type { ConditionalRule, TableRuntimeContext } from './table-view-model-types';
import { isRecord } from './view-model-config';
import { numericValueOrNull, readTone, safeClassToken } from './view-model-runtime';
import type { DashboardTableCell, DashboardTableCellConfig, DashboardTableColumn, DashboardTableModel } from './view-model-types';

export function tableCell(
  raw: unknown,
  column: DashboardTableColumn,
  rules: ConditionalRule[],
  formatOptions: MetricFormatOptions,
  isTotal = false,
  row?: Record<string, unknown>,
  runtimeContext: TableRuntimeContext = {}
): DashboardTableCell {
  const numeric = numericValueOrNull(raw);
  const conditional = resolveTableConditionalPatch({
    currentField: column.key,
    ...(row === undefined ? {} : { row }),
    rowValue: raw,
    rules
  });
  const mappedBadge = column.cellType === 'badge' ? badgePatch(raw, column.cellConfig) : undefined;
  const delta = column.cellType === 'delta' ? deltaFor(row, column, numeric) : undefined;
  const display = column.cellType === 'sparkline' || column.cellType === 'advanced-sparkline' || column.cellType === 'trend-indicator'
    ? ''
    : tableCellDisplay({ column, conditionalDisplayValue: conditional.displayValue, delta, formatOptions, raw });
  return {
    raw,
    numeric,
    ratio: null,
    sparkline: sparklineValues(raw, row, column.cellConfig),
    display,
    tone: mappedBadge?.tone ?? conditional.tone ?? deltaTone(delta) ?? toneForValue(raw, numeric),
    ...formatClassesPatch(conditional, mappedBadge, display),
    ...(!isTotal ? cellLinkPatch(column.link, { column, display, raw, ...(row === undefined ? {} : { row }), runtimeContext }) : {}),
    ...stylePatch(column, conditional, mappedBadge),
    ...(delta ? { delta } : {}),
    ...(isTotal ? { isTotal: true } : {})
  };
}

export function applyColumnRatios(model: DashboardTableModel): DashboardTableModel {
  const maxByColumn = model.columns.map((_, index) => Math.max(...model.rows.map(row => Math.abs(row.cells[index]?.numeric ?? 0)), 0));
  return {
    ...model,
    rows: model.rows.map(row => ({
      ...row,
      cells: row.cells.map((cell, index) => ({
        ...cell,
        ratio: maxByColumn[index] ? Math.min(100, Math.round((Math.abs(cell.numeric ?? 0) / maxByColumn[index]) * 100)) : null
      }))
    }))
  };
}

export function buildTableAnalytics(
  columns: DashboardTableColumn[],
  rows: Array<Record<string, unknown>>
): unknown[][] {
  const seriesCache = new Map<string, Array<number | null>>();
  const seriesFor = (field: string): Array<number | null> => {
    const existing = seriesCache.get(field);
    if (existing) return existing;
    const next = rows.map(row => numericValueOrNull(row[field]));
    seriesCache.set(field, next);
    return next;
  };
  return columns.map(column => {
    const series = seriesFor(column.key);
    switch (column.cellType) {
      case 'running-total':
        return runningTotalSeries(series);
      case 'moving-average':
        return movingAverageSeries(series, 3);
      case 'percent-of-total':
        return percentOfTotalSeries(series);
      case 'mom-change':
        return periodChangeSeries(series, 1);
      case 'yoy-change':
        return periodChangeSeries(series, 12);
      case 'trend-indicator':
        return trailingSparklineSeries(series, 6);
      default:
        return [];
    }
  });
}

function cellLinkPatch(
  linkConfig: DashboardTableColumn['link'],
  context: {
    column: DashboardTableColumn;
    display: string;
    raw: unknown;
    row?: Record<string, unknown>;
    runtimeContext: TableRuntimeContext;
  }
): Pick<DashboardTableCell, 'link'> {
  if (!linkConfig?.hrefTemplate || context.display.trim().length === 0) return {};
  const href = safeCellLinkHref(resolveCellLinkTemplate(linkConfig.hrefTemplate, context));
  if (!href) return {};
  const ariaLabel = linkConfig.ariaLabelTemplate
    ? resolveCellLinkTemplate(linkConfig.ariaLabelTemplate, context, { encode: false })
    : undefined;
  const target = linkConfig.target ?? '_blank';
  return {
    link: {
      href,
      target,
      ...linkRelPatch(linkConfig.rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)),
      ...(ariaLabel ? { ariaLabel } : {})
    }
  };
}

function linkRelPatch(rel: string | undefined): Pick<NonNullable<DashboardTableCell['link']>, 'rel'> {
  return rel ? { rel } : {};
}

function resolveCellLinkTemplate(
  template: string,
  context: {
    column: DashboardTableColumn;
    display: string;
    raw: unknown;
    row?: Record<string, unknown>;
    runtimeContext: TableRuntimeContext;
  },
  options: { encode?: boolean } = {}
): string {
  const encode = options.encode !== false;
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, expression: string) =>
    placeholderValue(expression, context, encode)
  );
}

function placeholderValue(
  expression: string,
  context: {
    column: DashboardTableColumn;
    display: string;
    raw: unknown;
    row?: Record<string, unknown>;
    runtimeContext: TableRuntimeContext;
  },
  shouldEncode: boolean
): string {
  const parts = expression.split('|').map(part => part.trim()).filter(Boolean);
  const token = parts.shift() ?? '';
  const raw = parts.includes('raw');
  const dateFormat = parts.find(part => part.startsWith('date:'))?.slice('date:'.length).trim();
  const valueMap = parts.find(part => part.startsWith('map:'))?.slice('map:'.length).trim();
  let value = lookupTemplateToken(token, context);
  if (dateFormat) value = formatTemplateDate(value, dateFormat);
  if (valueMap) value = mappedTemplateValue(value, valueMap);
  const text = stringifyTemplateValue(value);
  return shouldEncode && !raw ? encodeURIComponent(text) : text;
}

function lookupTemplateToken(
  token: string,
  context: {
    column: DashboardTableColumn;
    display: string;
    raw: unknown;
    row?: Record<string, unknown>;
    runtimeContext: TableRuntimeContext;
  }
): unknown {
  if (!token) return '';
  if (token === 'cell.raw' || token === 'raw') return context.raw;
  if (token === 'cell.display' || token === 'display') return context.display;
  if (token === 'column.key') return context.column.key;
  if (token === 'column.label') return context.column.label;
  if (token === 'origin' || token === 'locationOrigin') return context.runtimeContext.locationOrigin ?? '';
  if (token === 'parentOrigin' || token === 'embedParentOrigin' || token === 'referrerOrigin') return context.runtimeContext.parentOrigin ?? '';
  if (token.startsWith('row.')) return lookupPath(context.row, token.slice('row.'.length));
  if (token.startsWith('param.')) return lookupPath(context.runtimeContext.parameterValues, token.slice('param.'.length));
  if (token.startsWith('parameter.')) return lookupPath(context.runtimeContext.parameterValues, token.slice('parameter.'.length));
  if (token.startsWith('context.')) return lookupPath(context.runtimeContext, token.slice('context.'.length));
  const rowValue = lookupPath(context.row, token);
  if (rowValue !== undefined) return rowValue;
  return lookupPath(context.runtimeContext.parameterValues, token) ?? '';
}

function lookupPath(source: unknown, path: string): unknown {
  if (!isRecord(source) || !path.trim()) return undefined;
  return path.split('.').reduce<unknown>((current, part) => {
    if (!isRecord(current)) return undefined;
    return current[part];
  }, source);
}

function stringifyTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringifyTemplateValue).join(',');
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function mappedTemplateValue(value: unknown, mapExpression: string): unknown {
  const entries = mapExpression
    .split(/[;,]/)
    .map(part => part.trim())
    .filter(Boolean)
    .flatMap(part => {
      const separator = part.indexOf('=');
      if (separator <= 0) return [];
      return [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()] as const];
    });
  if (entries.length === 0) return value;
  const text = stringifyTemplateValue(value);
  const match = entries.find(([key]) => key === text)
    ?? entries.find(([key]) => key.toLowerCase() === text.toLowerCase())
    ?? entries.find(([key]) => key === '*');
  return match?.[1] ?? value;
}

function formatTemplateDate(value: unknown, format: string): string {
  const date = dateFromTemplateValue(value);
  if (!date) return stringifyTemplateValue(value);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return format
    .replace(/yyyy/g, String(year))
    .replace(/MMM/g, monthNames[month - 1] ?? '')
    .replace(/MM/g, String(month).padStart(2, '0'))
    .replace(/\bM\b/g, String(month))
    .replace(/dd/g, String(day).padStart(2, '0'))
    .replace(/\bd\b/g, String(day));
}

function dateFromTemplateValue(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function safeCellLinkHref(value: string): string | undefined {
  const href = value.trim();
  if (!href) return undefined;
  if (/^(?:https?:|mailto:|tel:)/i.test(href) || href.startsWith('/') || href.startsWith('#')) return href;
  return undefined;
}

function sparklineValues(value: unknown, row?: Record<string, unknown>, config?: DashboardTableCellConfig): number[] {
  const values = config?.sparklineFields?.length && row ? config.sparklineFields.map(field => row[field]) : value;
  if (!Array.isArray(values)) return [];
  return values.flatMap(item => typeof item === 'number' && Number.isFinite(item) ? [item] : isRecord(item) && typeof item.y === 'number' && Number.isFinite(item.y) ? [item.y] : numericValueOrNull(item) === null ? [] : [numericValueOrNull(item) as number]);
}

function movingAverageSeries(values: Array<number | null>, windowSize: number): Array<number | null> {
  return values.map((_, index) => {
    const window = values.slice(Math.max(0, index - windowSize + 1), index + 1).filter((value): value is number => value !== null);
    if (window.length === 0) return null;
    return window.reduce<number>((sum, value) => sum + value, 0) / window.length;
  });
}

function runningTotalSeries(values: Array<number | null>): Array<number | null> {
  let total = 0;
  return values.map(value => {
    if (value === null) return null;
    total += value;
    return total;
  });
}

function percentOfTotalSeries(values: Array<number | null>): Array<number | null> {
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total === 0) return values.map(() => null);
  return values.map(value => value === null ? null : value / total);
}

function periodChangeSeries(values: Array<number | null>, lag: number): Array<number | null> {
  return values.map((value, index) => {
    if (value === null || index < lag) return null;
    const previous = values[index - lag] ?? null;
    if (previous === null || previous === 0) return null;
    return (value - previous) / Math.abs(previous);
  });
}

function trailingSparklineSeries(values: Array<number | null>, size: number): Array<number[]> {
  return values.map((_, index) =>
    values
      .slice(Math.max(0, index - size + 1), index + 1)
      .filter((value): value is number => value !== null)
  );
}

function badgePatch(value: unknown, config: DashboardTableCellConfig | undefined): { formatClass?: string; style: Record<string, string>; tone?: DashboardTableCell['tone'] } | undefined {
  const mapped = config?.badgeMapping?.[String(value ?? '')];
  if (!mapped) return undefined;
  const tone = readTone(mapped) ?? toneForColorToken(mapped);
  return { formatClass: `badge-${safeClassToken(mapped)}`, style: colorTokenStyle(mapped, 'badge'), ...(tone ? { tone } : {}) };
}

function deltaFor(row: Record<string, unknown> | undefined, column: DashboardTableColumn, numeric: number | null): DashboardTableCell['delta'] | undefined {
  const compareField = column.cellConfig?.deltaCompareField;
  const compare = compareField && row ? numericValueOrNull(row[compareField]) : null;
  if (numeric === null || compare === null) return undefined;
  const absolute = numeric - compare;
  return {
    absolute,
    direction: absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'neutral',
    percentage: compare === 0 ? null : (absolute / Math.abs(compare)) * 100,
    showArrow: column.cellConfig?.showDeltaArrow !== false
  };
}

function deltaTone(delta: DashboardTableCell['delta'] | undefined): DashboardTableCell['tone'] | undefined {
  if (!delta) return undefined;
  if (delta.direction === 'up') return 'success';
  if (delta.direction === 'down') return 'danger';
  return 'neutral';
}

function formatClassesPatch(conditional: { formatClasses: string[] }, badge: ReturnType<typeof badgePatch>, display = ''): Pick<DashboardTableCell, 'formatClasses'> {
  const formatClasses = [
    ...conditional.formatClasses,
    ...(badge?.formatClass ? [badge.formatClass] : []),
    ...(display.includes('\n') ? ['is-multiline'] : [])
  ];
  return formatClasses.length > 0 ? { formatClasses } : {};
}

function stylePatch(column: DashboardTableColumn, conditional: { style: Record<string, string> }, badge: ReturnType<typeof badgePatch>): Pick<DashboardTableCell, 'style'> {
  const style = { ...cellConfigStyle(column.cellConfig), ...badge?.style, ...conditional.style };
  return Object.keys(style).length > 0 ? { style } : {};
}

function cellConfigStyle(config: DashboardTableCellConfig | undefined): Record<string, string> {
  return {
    ...cssVariable('--dashboard-table-bar-fill', readCssColor(config?.barColor)),
    ...cssVariable('--dashboard-table-progress-fill', readCssColor(config?.progressColor)),
    ...cssVariable('--dashboard-table-sparkline', readCssColor(config?.sparklineColor))
  };
}

function colorTokenStyle(token: string, target: 'badge'): Record<string, string> {
  const colors = token.includes('green') || token.includes('success') ? ['#dcfce7', '#166534']
    : token.includes('yellow') || token.includes('amber') || token.includes('warning') ? ['#fef3c7', '#92400e']
      : token.includes('red') || token.includes('danger') ? ['#fee2e2', '#991b1b']
        : token.includes('blue') || token.includes('info') ? ['#dbeafe', '#1e40af'] : [];
  if (target === 'badge' && colors[0] && colors[1]) return { '--dashboard-table-badge-bg': colors[0], '--dashboard-table-badge-color': colors[1] };
  const color = readCssColor(token);
  return color ? { '--dashboard-table-badge-bg': color } : {};
}

function toneForColorToken(token: string): DashboardTableCell['tone'] | undefined {
  if (/green|success/.test(token)) return 'success';
  if (/yellow|amber|warning/.test(token)) return 'warning';
  if (/red|danger/.test(token)) return 'danger';
  return undefined;
}

function toneForValue(value: unknown, numeric: number | null): DashboardTableCell['tone'] {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (/\b(success|active|open|complete|on track|approved|healthy)\b/.test(normalized)) return 'success';
    if (/\b(warn|watch|pending|review|hold)\b/.test(normalized)) return 'warning';
    if (/\b(error|failed|risk|inactive|closed|rejected|down)\b/.test(normalized)) return 'danger';
  }
  if (numeric === null) return 'neutral';
  if (numeric > 0) return 'success';
  if (numeric < 0) return 'danger';
  return 'neutral';
}
