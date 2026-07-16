import type { TableDefinition } from '../data-source/foundation-store.js';
import type { PreflightFilter } from './analyzer-plan-capability-filter-selection.js';
import { readString } from './analyzer-plan-utils.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';

const ACTIVE_SCOPE_TOKENS = new Set([
  'active', 'invoice', 'invoices', 'record', 'records', 'status'
]);

const EXCLUSION_SCOPE_TOKENS = new Set([
  'exclude', 'excluded', 'exclusion', 'from', 'include', 'included',
  'inclusion', 'normal', 'record', 'records', 'sale', 'sales', 'status'
]);

const COMPLETED_TIMESHEET_SCOPE_TOKENS = new Set([
  'complete', 'completed', 'status', 'time', 'timesheet', 'timesheets'
]);

export function filterEncodedByAnalyzerModelScope(
  table: TableDefinition,
  filter: PreflightFilter
): boolean {
  const tokens = analyzerTokenSet([
    filter.field,
    filter.label,
    filter.searchText,
    readString(filter.value)
  ].filter((value): value is string => Boolean(value)).join(' '));
  if (tokens.size === 0) return false;
  if (activeInvoiceScope(table) && tokens.has('active') && subset(tokens, ACTIVE_SCOPE_TOKENS)) {
    return true;
  }
  if (
    completedTimesheetScope(table)
    && (tokens.has('complete') || tokens.has('completed'))
    && subset(tokens, COMPLETED_TIMESHEET_SCOPE_TOKENS)
  ) {
    return true;
  }
  return exclusionAuditScope(table)
    && (tokens.has('exclude') || tokens.has('excluded') || tokens.has('exclusion') || tokens.has('inclusion'))
    && (tokens.has('sale') || tokens.has('sales'))
    && subset(tokens, EXCLUSION_SCOPE_TOKENS);
}

export function narrowAnalyzerModelScopeValues(
  table: TableDefinition,
  fieldName: string,
  values: string[],
  question: string
): string[] {
  if (!exclusionAuditScope(table) || fieldName !== 'exclusion_reason' || values.length < 2) {
    return values;
  }
  const tokens = analyzerTokenSet(question);
  const refundOnly = tokens.has('refund') || tokens.has('refunded');
  const cancelledOnly = tokens.has('cancel') || tokens.has('cancelled') || tokens.has('canceled');
  if (refundOnly && !cancelledOnly) {
    const narrowed = values.filter(value => value.toLowerCase().includes('refund'));
    return narrowed.length > 0 ? narrowed : values;
  }
  if (cancelledOnly && !refundOnly) {
    const narrowed = values.filter(value => value.toLowerCase().includes('cancel'));
    return narrowed.length > 0 ? narrowed : values;
  }
  const invoiceOnly = tokens.has('invoice') || tokens.has('invoices');
  const itemOnly = tokens.has('item') || tokens.has('items') || tokens.has('line') || tokens.has('lines');
  if (invoiceOnly && !itemOnly) {
    const narrowed = values.filter(value => value.toLowerCase().startsWith('invoice '));
    return narrowed.length > 0 ? narrowed : values;
  }
  if (itemOnly) {
    const narrowed = values.filter(value => value.toLowerCase().startsWith('item line '));
    return narrowed.length > 0 ? narrowed : values;
  }
  return values;
}

function activeInvoiceScope(table: TableDefinition): boolean {
  const sql = readString(table.sqlQuery)?.toLowerCase() ?? '';
  return sql.includes('isnull(i.archived, 0) = 0')
    && sql.includes('isnull(i.void, 0) = 0')
    && sql.includes('isnull(i.isdraft, 0) = 0')
    && sql.includes('isnull(i.isliability, 0) = 0');
}

function exclusionAuditScope(table: TableDefinition): boolean {
  const name = table.name.toLowerCase();
  return name.includes('sales_exclusion_audit') || name.includes('excluded_sales');
}

function completedTimesheetScope(table: TableDefinition): boolean {
  const sql = readString(table.sqlQuery)?.toLowerCase().replace(/\s+/g, ' ') ?? '';
  return /endtime\s+is\s+not\s+null/.test(sql)
    && /datediff\s*\(\s*minute\s*,[^)]*\)\s*>\s*0/.test(sql)
    && /datediff\s*\(\s*minute\s*,[^)]*\)\s*<=\s*1440/.test(sql);
}

function subset(tokens: Set<string>, allowed: Set<string>): boolean {
  for (const token of tokens) {
    if (!allowed.has(token)) return false;
  }
  return true;
}
