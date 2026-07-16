import type { TableDefinition } from '../data-source/foundation-store.js';
import { firstRoutingRecord } from './analyzer-plan-schema.js';
import { analyzerDateRangeSelectionForQuestion } from './analyzer-plan-parameter-values.js';
import { isRecord, readString } from './analyzer-plan-utils.js';
import { actionFilterRecords } from './analyzer-plan-build-component-filters.js';
import type { AnalyzerActionStep } from './analyzer-plan-build-component-types.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

export function analyzerMessageWithParameterDefault(message: string, defaultedPeriodLabel: string | undefined): string {
  if (!defaultedPeriodLabel) return message;
  const suffix = `No period was specified, so I used ${defaultedPeriodLabel}.`;
  return message.includes(suffix) ? message : `${message} ${suffix}`;
}

export function commonDefaultedPeriodLabel(plans: AnalyzerActionPlanResponse[]): string | undefined {
  const labels = Array.from(new Set(plans
    .map(plan => defaultedPeriodLabelFromMessage(plan.message))
    .filter((label): label is string => Boolean(label))));
  return labels.length === 1 ? labels[0] : undefined;
}

function defaultedPeriodLabelFromMessage(message: string): string | undefined {
  const match = /\bNo period was specified, so I used ([^.]+(?:\.[^)]+\))?)\./.exec(message);
  return match?.[1]?.trim();
}

export function parametersUseDefault(
  defaultValues: Record<string, string>,
  explicitValues: Record<string, unknown>
): boolean {
  const entries = Object.entries(explicitValues);
  return entries.length === 0 || entries.every(([key, value]) => defaultValues[key] === value);
}

export function dateFilterSelectionForAction(
  table: TableDefinition,
  action: AnalyzerActionStep,
  parameterValues: Record<string, string>,
  question: string
): { defaultedPeriodLabel?: string; filter?: Record<string, unknown> } | null {
  if (Object.keys(parameterValues).length > 0) return null;
  const primaryTimeField = readString(firstRoutingRecord(table).primaryTimeField);
  if (!primaryTimeField || actionHasFilterForField(action, primaryTimeField)) return null;
  const selection = analyzerDateRangeSelectionForQuestion(question);
  if (!selection.range) return null;
  return {
    ...(selection.defaultedPeriodLabel ? { defaultedPeriodLabel: selection.defaultedPeriodLabel } : {}),
    filter: {
      field: primaryTimeField,
      operator: 'between',
      value: [selection.range.from, selection.range.to],
      values: [selection.range.from, selection.range.to]
    }
  };
}

function actionHasFilterForField(action: AnalyzerActionStep, field: string): boolean {
  return actionFilterRecords(action.params.filters)
    .concat(actionFilterRecords(action.params.filter))
    .some(filter => readString(filter.field) === field || readString(filter.name) === field);
}

export function readParameterValues(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeDateParameterValue(item)]));
}

function normalizeDateParameterValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (!match) return trimmed;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return trimmed;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(Number.isInteger(day) ? day : 1, 1), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function questionMentionsDateOrPeriod(question: string): boolean {
  return /\b(today|yesterday|tomorrow|last|previous|this|current|past|next|between|from|to|week|month|quarter|year|fiscal|fy|calendar|period|date|all time|lifetime|entire history|full history|since inception)\b/i.test(question)
    || /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(question)
    || /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i.test(question);
}

export function messageClaimsRelativePeriod(message: string): boolean {
  return /\b(last|previous|this|current|past|next)\s+(full\s+)?(calendar\s+)?(day|week|month|quarter|year)\b/i.test(message)
    || /\bbecause no period was specified\b/i.test(message)
    || /\bsince no period was specified\b/i.test(message);
}
