import { isRecord } from './foundation-route-utils.js';

export const ANALYZER_EXECUTION_SCOPE_ERROR_PREFIX =
  'Analyzer execution requires resolved companyId, fromDate, and toDate in parameterValues.';

export interface AnalyzerExecutionScopeValidation {
  enforced: boolean;
  issues: Array<'companyId' | 'fromDate' | 'toDate'>;
  valid: boolean;
}

interface AnalyzerExecutionScopeInput {
  parameterValues: Record<string, unknown>;
  requester: unknown;
  table: AnalyzerExecutionScopeTable;
}

interface AnalyzerExecutionScopeTable {
  isDataModel?: boolean;
  settings?: unknown;
}

const ANALYZER_EXECUTION_REQUESTERS = new Set([
  'ai-data-analyzer',
  'ai-data-analyzer-export'
]);

const COMPANY_PARAMETER_NAMES = new Set(['company', 'companyid']);
const FROM_PARAMETER_NAMES = new Set(['datefrom', 'from', 'fromdate', 'startdate']);
const TO_PARAMETER_NAMES = new Set(['dateto', 'enddate', 'to', 'todate']);

export function validateAnalyzerExecutionScope(
  input: AnalyzerExecutionScopeInput
): AnalyzerExecutionScopeValidation {
  if (!requiresAnalyzerExecutionScope(input.requester, input.table)) {
    return { enforced: false, issues: [], valid: true };
  }

  const company = scopeValue(input.parameterValues, COMPANY_PARAMETER_NAMES);
  const fromDate = scopeValue(input.parameterValues, FROM_PARAMETER_NAMES);
  const toDate = scopeValue(input.parameterValues, TO_PARAMETER_NAMES);
  const issues: AnalyzerExecutionScopeValidation['issues'] = [];
  if (!validCompanyId(company)) issues.push('companyId');
  if (!validIsoDate(fromDate)) issues.push('fromDate');
  if (!validIsoDate(toDate)) issues.push('toDate');
  if (
    validIsoDate(fromDate)
    && validIsoDate(toDate)
    && dateTime(fromDate) >= dateTime(toDate)
  ) {
    if (!issues.includes('fromDate')) issues.push('fromDate');
    if (!issues.includes('toDate')) issues.push('toDate');
  }
  return { enforced: true, issues, valid: issues.length === 0 };
}

export function analyzerExecutionScopeError(
  validation: AnalyzerExecutionScopeValidation
): string | null {
  if (validation.valid) return null;
  return `${ANALYZER_EXECUTION_SCOPE_ERROR_PREFIX} Missing or invalid: ${validation.issues.join(', ')}.`;
}

function requiresAnalyzerExecutionScope(requester: unknown, table: AnalyzerExecutionScopeTable): boolean {
  if (typeof requester !== 'string' || !ANALYZER_EXECUTION_REQUESTERS.has(requester.trim())) return false;
  const settings = isRecord(table.settings) ? table.settings : {};
  if (settings.lookupOnly === true && normalizedName(settings.targetType) === 'lookup') return false;
  return (table.isDataModel === true || settings.isDataModel === true)
    && settings.requiresBusinessScope === true;
}

function scopeValue(
  record: Record<string, unknown>,
  names: Set<string>
): unknown {
  const entry = Object.entries(record).find(([name]) => names.has(normalizedName(name)));
  return entry?.[1];
}

function validCompanyId(value: unknown): boolean {
  if (Array.isArray(value) || unresolvedValue(value)) return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || unresolvedValue(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][0-9:Z.+-]+)?$/u.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay && Number.isFinite(Date.parse(value));
}

function dateTime(value: string): number {
  return Date.parse(value);
}

function unresolvedValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return !text
    || /^\{\{.+\}\}$/u.test(text)
    || /^[$:].+/u.test(text)
    || /^__.+__$/u.test(text)
    || /^<.+>$/u.test(text);
}

function normalizedName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/[\s_-]+/gu, '').toLowerCase() : '';
}
