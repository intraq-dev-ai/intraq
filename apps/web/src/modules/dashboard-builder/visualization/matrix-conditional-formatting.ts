import { isRecord, readString } from './view-model-config';
import {
  matchesFilter,
  numericValueOrNull,
  readClassList,
  readStyle,
  readTone,
  safeClassToken,
  type RuntimeFilter
} from './view-model-runtime';
import type { DashboardMatrixCellMeta } from './view-model-types';

type MatrixFormatType = 'colorScale' | 'rules';
type MatrixRuleTarget = 'column' | 'row' | 'values';
type MatrixRuleScope = 'cell' | 'column' | 'row';

export interface MatrixConditionalRule extends RuntimeFilter {
  applyTo: MatrixRuleTarget;
  autoTextColor: boolean;
  colorScale: string[];
  field: string;
  formatClasses: string[];
  formatType: MatrixFormatType;
  scope: MatrixRuleScope;
  sourceIndex: number;
  style: Record<string, string>;
  textColorScale: string[];
  tone?: DashboardMatrixCellMeta['tone'] | undefined;
  valueFields: string[];
}

export interface MatrixConditionalCellContext {
  columnFieldValues: Map<string, unknown>;
  rawValue: unknown;
  rowFieldValues: Map<string, unknown>;
  valueField: string;
}

export interface MatrixConditionalScales {
  columnValuesByField: Map<string, number[]>;
  rowValuesByField: Map<string, number[]>;
  valueCellValuesByField: Map<string, number[]>;
}

const DEFAULT_HEATMAP_COLORS = ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'];
const DEFAULT_DARK_TEXT = '#111827';
const DEFAULT_LIGHT_TEXT = '#ffffff';

export function matrixBodyCellMeta(
  context: MatrixConditionalCellContext,
  rules: MatrixConditionalRule[],
  scales: MatrixConditionalScales
): DashboardMatrixCellMeta | undefined {
  if (rules.length === 0) return undefined;
  let matched = false;
  let patch: DashboardMatrixCellMeta = { tone: 'neutral' };
  for (const rule of rules) {
    const meta = matrixBodyCellRuleMeta(rule, context, scales);
    if (!meta) continue;
    matched = true;
    patch = mergeMeta(patch, rule, meta);
  }
  return matched ? patch : undefined;
}

export function matrixHeaderMetaPatch(
  values: unknown[],
  field: string,
  rules: MatrixConditionalRule[],
  applyTo: 'column' | 'row'
): DashboardMatrixCellMeta[] {
  if (rules.length === 0) return [];
  const fieldRules = rules.filter(rule =>
    rule.applyTo === applyTo
    && rule.field === field
    && rule.formatType === 'rules'
  );
  if (fieldRules.length === 0) return [];
  const scaleValues = values.flatMap(value => {
    const numeric = numericValueOrNull(value);
    return numeric === null ? [] : [numeric];
  });
  const meta = values.map(value => conditionalMeta(field, value, fieldRules, scaleValues));
  return meta.some(Boolean) ? meta.map(item => item ?? { tone: 'neutral' }) : [];
}

export function readMatrixConditionalRules(config: Record<string, unknown>): MatrixConditionalRule[] {
  const value = config.conditionalFormatting ?? config.conditionalFormats;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, sourceIndex) => {
    if (!isRecord(item)) return [];
    const applyTo = readRuleTarget(item.applyTo ?? item.scope);
    const formatType = readFormatType(item.formatType);
    const valueFields = readConditionalRuleValueFields(item);
    const fields = readConditionalRuleFields(item, formatType);
    if (fields.length === 0) return [];
    return fields.map(field => ({
      applyTo,
      autoTextColor: item.autoTextColor === true,
      colorScale: readColorList(item.colorScale, DEFAULT_HEATMAP_COLORS),
      field,
      formatClasses: readClassList(item.className ?? item.class ?? item.formatClass),
      formatType,
      operator: readString(item.operator) ?? 'equals',
      scope: readRuleScope(item.scope),
      sourceIndex,
      style: conditionalRuleStyle(item),
      textColorScale: readColorList(item.textColorScale, []),
      tone: readTone(item.tone ?? item.color ?? item.variant),
      value: item.value,
      valueFields,
      valueTo: item.valueTo ?? item.max
    }));
  });
}

function conditionalMeta(
  field: string,
  value: unknown,
  rules: MatrixConditionalRule[],
  scaleValues: number[]
): DashboardMatrixCellMeta | null {
  const matched = rules.filter(rule => rule.field === field && ruleMatchesValue(rule, value));
  if (matched.length === 0) return null;
  return matched.reduce((patch, rule) => mergeMeta(
    patch,
    rule,
    rule.formatType === 'colorScale' ? colorScaleMeta(rule, value, scaleValues) : {}
  ), { tone: 'neutral' } as DashboardMatrixCellMeta);
}

function matrixBodyCellRuleMeta(
  rule: MatrixConditionalRule,
  context: MatrixConditionalCellContext,
  scales: MatrixConditionalScales
): Pick<DashboardMatrixCellMeta, 'style' | 'tone'> | null {
  if (rule.formatType === 'colorScale') {
    const scaleValue = colorScaleValue(rule, context);
    if (scaleValue === null) return null;
    if (!ruleTargetsCell(rule, context)) return null;
    return colorScaleMeta(rule, scaleValue, colorScaleValues(rule, scales));
  }
  if (!ruleTargetsCell(rule, context)) return null;
  return { style: rule.style, tone: rule.tone };
}

function ruleTargetsCell(rule: MatrixConditionalRule, context: MatrixConditionalCellContext): boolean {
  if (rule.formatType === 'colorScale') {
    if (rule.applyTo === 'values') {
      const targetedFields = rule.valueFields.length > 0 ? rule.valueFields : [rule.field];
      return targetedFields.includes(context.valueField);
    }
    if (rule.applyTo === 'row') return colorScaleValue(rule, context) !== null;
    return colorScaleValue(rule, context) !== null;
  }
  if (rule.applyTo === 'row') {
    return rule.scope === 'cell'
      && matchesFilter(context.rowFieldValues.get(rule.field), rule);
  }
  if (rule.applyTo === 'column') {
    return (rule.scope === 'cell' || rule.scope === 'column')
      && matchesFilter(context.columnFieldValues.get(rule.field), rule);
  }
  const targetedFields = rule.valueFields.length > 0 ? rule.valueFields : [rule.field];
  return targetedFields.includes(context.valueField) && matchesFilter(context.rawValue, rule);
}

function colorScaleValue(rule: MatrixConditionalRule, context: MatrixConditionalCellContext): number | null {
  if (rule.applyTo === 'values') return numericValueOrNull(context.rawValue);
  if (rule.applyTo === 'row') return numericValueOrNull(context.rowFieldValues.get(rule.field));
  return numericValueOrNull(context.columnFieldValues.get(rule.field));
}

function colorScaleValues(rule: MatrixConditionalRule, scales: MatrixConditionalScales): number[] {
  if (rule.applyTo === 'values') {
    const targetedFields = rule.valueFields.length > 0 ? rule.valueFields : [rule.field];
    return targetedFields.flatMap(field => scales.valueCellValuesByField.get(field) ?? []);
  }
  if (rule.applyTo === 'row') return scales.rowValuesByField.get(rule.field) ?? [];
  return scales.columnValuesByField.get(rule.field) ?? [];
}

function mergeMeta(
  patch: DashboardMatrixCellMeta,
  rule: MatrixConditionalRule,
  next: Pick<DashboardMatrixCellMeta, 'style' | 'tone'>
): DashboardMatrixCellMeta {
  return {
    formatClasses: [
      ...(patch.formatClasses ?? []),
      ...rule.formatClasses,
      rule.formatType === 'colorScale' ? 'format-color-scale' : `format-${safeClassToken(rule.operator)}`
    ],
    style: { ...(patch.style ?? {}), ...rule.style, ...(next.style ?? {}) },
    tone: next.tone ?? rule.tone ?? patch.tone
  };
}

function ruleMatchesValue(rule: MatrixConditionalRule, value: number): boolean {
  if (rule.formatType === 'colorScale') return numericValueOrNull(value) !== null;
  return matchesFilter(value, rule);
}

function colorScaleMeta(
  rule: MatrixConditionalRule,
  value: unknown,
  scaleValues: number[]
): Pick<DashboardMatrixCellMeta, 'style' | 'tone'> {
  const numeric = numericValueOrNull(value);
  if (numeric === null) return {};
  const ratio = scaleRatio(numeric, scaleValues);
  const backgroundColor = colorAtRatio(rule.colorScale, ratio);
  const textColor = rule.autoTextColor
    ? contrastTextColor(backgroundColor)
    : colorAtRatio(rule.textColorScale, ratio);
  return {
    style: {
      ...(backgroundColor ? { backgroundColor } : {}),
      ...(textColor ? { color: textColor } : {})
    },
    tone: heatmapTone(ratio)
  };
}

function readFormatType(value: unknown): MatrixFormatType {
  return readString(value)?.toLowerCase() === 'colorscale' ? 'colorScale' : 'rules';
}

function readRuleTarget(value: unknown): MatrixRuleTarget {
  const normalized = readString(value)?.toLowerCase();
  return normalized === 'row' || normalized === 'column' ? normalized : 'values';
}

function readRuleScope(value: unknown): MatrixRuleScope {
  const normalized = readString(value)?.toLowerCase();
  return normalized === 'row' || normalized === 'column' ? normalized : 'cell';
}

function readConditionalRuleValueFields(item: Record<string, unknown>): string[] {
  return Array.isArray(item.valueFields)
    ? item.valueFields.flatMap(value => readString(value) ?? [])
    : [];
}

function readConditionalRuleFields(item: Record<string, unknown>, formatType: MatrixFormatType): string[] {
  const applyTo = readRuleTarget(item.applyTo ?? item.scope);
  if (formatType === 'colorScale' && applyTo === 'values') {
    const valueFields = readConditionalRuleValueFields(item);
    if (valueFields.length > 0) return valueFields;
  }
  const field = applyTo === 'row'
    ? readString(item.row) ?? readString(item.field) ?? readString(item.key)
    : applyTo === 'column'
      ? readString(item.column) ?? readString(item.field) ?? readString(item.key)
      : readString(item.field) ?? readString(item.column) ?? readString(item.key);
  if (field) return [field];
  if (Array.isArray(item.valueFields)) return item.valueFields.flatMap(value => readString(value) ?? []);
  return [];
}

function conditionalRuleStyle(item: Record<string, unknown>): Record<string, string> {
  return {
    ...readStyle(item.style ?? item.styles),
    ...(readColor(item.bgColor ?? item.backgroundColor) ? { backgroundColor: readColor(item.bgColor ?? item.backgroundColor) as string } : {}),
    ...(readColor(item.textColor ?? item.color) ? { color: readColor(item.textColor ?? item.color) as string } : {}),
    ...(item.bold === true ? { fontWeight: '700' } : {}),
    ...(item.italic === true ? { fontStyle: 'italic' } : {})
  };
}

function readColorList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const colors = value.flatMap(item => readColor(item) ?? []);
  return colors.length > 0 ? colors : fallback;
}

function scaleRatio(value: number, values: number[]): number {
  if (values.length === 0) return 1;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 1;
  if (max === min) return 1;
  return clamp((value - min) / (max - min));
}

function colorAtRatio(colors: string[], ratio: number): string | undefined {
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return colors[0];
  const scaled = clamp(ratio) * (colors.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(colors.length - 1, Math.ceil(scaled));
  const lower = colors[lowerIndex];
  const upper = colors[upperIndex];
  if (!lower || !upper || lower === upper) return lower ?? upper;
  return interpolateColor(lower, upper, scaled - lowerIndex) ?? colors[Math.round(scaled)];
}

function interpolateColor(left: string, right: string, ratio: number): string | undefined {
  const leftRgb = parseHexColor(left);
  const rightRgb = parseHexColor(right);
  if (!leftRgb || !rightRgb) return undefined;
  const channels = leftRgb.map((channel, index) => Math.round(channel + (rightRgb[index] - channel) * clamp(ratio)));
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function contrastTextColor(backgroundColor: string | undefined): string | undefined {
  const rgb = backgroundColor ? parseHexColor(backgroundColor) : null;
  if (!rgb) return undefined;
  const luminance = relativeLuminance(rgb);
  return luminance > 0.48 ? DEFAULT_DARK_TEXT : DEFAULT_LIGHT_TEXT;
}

function relativeLuminance(rgb: number[]): number {
  const [red, green, blue] = rgb.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function parseHexColor(value: string): number[] | null {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const raw = match[1] ?? '';
  const normalized = raw.length === 3
    ? raw.split('').map(channel => `${channel}${channel}`).join('')
    : raw;
  return [0, 2, 4].map(index => Number.parseInt(normalized.slice(index, index + 2), 16));
}

function heatmapTone(ratio: number): DashboardMatrixCellMeta['tone'] {
  if (ratio >= 0.66) return 'success';
  if (ratio >= 0.33) return 'warning';
  return 'neutral';
}

function readColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(trimmed) || /^rgba?\([^)]+\)$/i.test(trimmed) ? trimmed : undefined;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
