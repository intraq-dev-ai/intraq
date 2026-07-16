import { isRecord, readBoolean, readString } from './view-model-config';
import { matchesFilter, readClassList, readStyle, readTone, safeClassToken } from './view-model-runtime';
import type { DashboardTableCell } from './view-model-types';

type TableConditionalScope = 'cell' | 'column' | 'row';

interface TableConditionalRule {
  conditionField: string;
  displayValue?: unknown;
  hasDisplayValue: boolean;
  formatClasses: string[];
  operator: string;
  scope: TableConditionalScope;
  style: Record<string, string>;
  targetField?: string;
  tone?: DashboardTableCell['tone'];
  value?: unknown;
  valueTo?: unknown;
}

export interface TableConditionalPatch {
  displayValue?: unknown;
  formatClasses: string[];
  style: Record<string, string>;
  tone?: DashboardTableCell['tone'];
}

export function readTableConditionalRules(config: Record<string, unknown>): TableConditionalRule[] {
  const value = config.conditionalFormatting ?? config.conditionalFormats;
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const conditionField = readString(item.field) ?? readString(item.column) ?? readString(item.key);
    if (!conditionField) return [];
    return [{
      conditionField,
      displayValue: conditionalDisplayValue(item),
      hasDisplayValue: hasConditionalDisplayValue(item),
      formatClasses: readClassList(item.className ?? item.class ?? item.formatClass),
      operator: readString(item.operator) ?? 'equals',
      scope: readScope(item.scope),
      style: { ...readStyle(item.style ?? item.styles), ...conditionalRuleStyle(item) },
      targetField: readString(item.scopeCell),
      tone: readTone(item.tone ?? item.color ?? item.variant),
      value: item.value,
      valueTo: item.valueTo ?? item.max
    }];
  });
}

export function resolveTableConditionalPatch(options: {
  currentField: string;
  row?: Record<string, unknown>;
  rowValue: unknown;
  rules: TableConditionalRule[];
}): TableConditionalPatch {
  const rowRules = options.rules.filter(rule =>
    rule.scope === 'row' && matchesRuleCondition(rule, options.currentField, options.rowValue, options.row)
  );
  const targetedRules = options.rules.filter(rule =>
    rule.scope !== 'row'
    && targetsField(rule, options.currentField)
    && matchesRuleCondition(rule, options.currentField, options.rowValue, options.row)
  );
  const displayRule = targetedRules.find(rule => rule.hasDisplayValue);
  const rowStyleRule = rowRules[0];
  const targetedStyleRule = targetedRules[0];

  if (rowStyleRule) {
    return {
      displayValue: displayRule?.displayValue,
      formatClasses: [...rowStyleRule.formatClasses, `format-${safeClassToken(rowStyleRule.operator)}`],
      style: rowStyleRule.style,
      tone: rowStyleRule.tone
    };
  }

  if (!targetedStyleRule) {
    return {
      displayValue: displayRule?.displayValue,
      formatClasses: [],
      style: {},
      tone: undefined
    };
  }

  return {
    displayValue: displayRule?.displayValue,
    formatClasses: [...targetedStyleRule.formatClasses, `format-${safeClassToken(targetedStyleRule.operator)}`],
    style: targetedStyleRule.style,
    tone: targetedStyleRule.tone
  };
}

function matchesRuleCondition(
  rule: TableConditionalRule,
  currentField: string,
  rowValue: unknown,
  row?: Record<string, unknown>
): boolean {
  const conditionValue = readConditionValue(rule, currentField, rowValue, row);
  if (conditionValue === undefined) return false;
  return matchesFilter(conditionValue, rule);
}

function readConditionValue(
  rule: TableConditionalRule,
  currentField: string,
  rowValue: unknown,
  row?: Record<string, unknown>
): unknown {
  if (row && Object.prototype.hasOwnProperty.call(row, rule.conditionField)) {
    return row[rule.conditionField];
  }
  return rule.conditionField === currentField ? rowValue : undefined;
}

function targetsField(rule: TableConditionalRule, currentField: string): boolean {
  if (rule.scope === 'column') return rule.conditionField === currentField;
  return (rule.targetField ?? rule.conditionField) === currentField;
}

function readScope(value: unknown): TableConditionalScope {
  return value === 'row' || value === 'column' ? value : 'cell';
}

function conditionalDisplayValue(item: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(item, 'displayValue')) return item.displayValue;
  if (Object.prototype.hasOwnProperty.call(item, 'displayText')) return item.displayText;
  return undefined;
}

function hasConditionalDisplayValue(item: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(item, 'displayValue')
    || Object.prototype.hasOwnProperty.call(item, 'displayText');
}

function conditionalRuleStyle(item: Record<string, unknown>): Record<string, string> {
  const background = readBoolean(item.disableBg ?? item.disableBackground) === true
    ? undefined
    : readCssColor(item.bgColor ?? item.backgroundColor ?? item.background);
  const color = readBoolean(item.disableText ?? item.disableTextColor) === true
    ? undefined
    : readCssColor(item.textColor ?? item.color);
  return {
    ...cssVariable('backgroundColor', background),
    ...cssVariable('color', color),
    ...(readBoolean(item.bold) === true ? { fontWeight: '700' } : {}),
    ...(readBoolean(item.italic) === true ? { fontStyle: 'italic' } : {})
  };
}

function readCssColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const palette: Record<string, string> = {
    blue: '#3b82f6',
    green: '#22c55e',
    red: '#ef4444',
    yellow: '#eab308',
    orange: '#f97316',
    purple: '#8b5cf6',
    teal: '#14b8a6',
    pink: '#ec4899',
    indigo: '#6366f1'
  };
  if (palette[trimmed]) return palette[trimmed];
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)
    || /^rgba?\([^)]+\)$/.test(trimmed)
    || /^hsla?\([^)]+\)$/.test(trimmed)
    ? trimmed
    : undefined;
}

function cssVariable(name: string, value: string | undefined): Record<string, string> {
  return value ? { [name]: value } : {};
}
