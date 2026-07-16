import type { TableDefinition } from '../data-source/foundation-store.js';
import type { AnalyzerCapabilityOperation } from './analyzer-capability-contract.js';
import type { PreflightFilter } from './analyzer-plan-capability-filter-selection.js';
import { businessNameForTable } from './analyzer-plan-table-context.js';
import { isRecord, readStringArray } from './analyzer-plan-utils.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';

export function invoiceRowListPriorityBoost(
  table: TableDefinition,
  operation: AnalyzerCapabilityOperation,
  question: string,
  filters: PreflightFilter[]
): number {
  if (!invoiceRowListRequested(operation, question, filters)) return 0;
  const ai = isRecord(table.dictionary?.ai) ? table.dictionary.ai : {};
  const routing = isRecord(ai.routing) ? ai.routing : {};
  const tokens = analyzerTokenSet([
    table.name,
    businessNameForTable(table),
    ...readStringArray(routing.useFor),
    ...readStringArray(routing.triggerKeywords),
    ...readStringArray(routing.exampleQuestions)
  ].join(' '));
  let boost = 0;
  if (tokens.has('invoice') || tokens.has('invoices')) boost += 18;
  if (tokens.has('header') || tokens.has('headers')) boost += 6;
  if (tokens.has('list') || tokens.has('lists')) boost += 4;
  if (table.fields.some(field => field.name === 'invoice_id')) boost += 6;
  if (table.fields.some(field => field.name === 'invoice_number')) boost += 6;
  if (table.fields.some(field => field.name === 'payment_method')) boost += 2;
  if (table.fields.some(field => field.name === 'business_date')) boost += 2;
  if (tokens.has('summary') || tokens.has('daily') || tokens.has('reconciliation')) boost -= 4;
  return boost;
}

function invoiceRowListRequested(
  operation: AnalyzerCapabilityOperation,
  question: string,
  filters: PreflightFilter[]
): boolean {
  if (operation !== 'list') return false;
  const tokens = analyzerTokenSet(question);
  if (!(tokens.has('invoice') || tokens.has('invoices'))) return false;
  const filterTargetsPayment = filters.some(filter => {
    const filterTokens = analyzerTokenSet([filter.field, filter.label].filter(Boolean).join(' '));
    return ['payment', 'method', 'tender'].some(token => filterTokens.has(token));
  });
  return tokens.has('list')
    || tokens.has('show')
    || tokens.has('give')
    || tokens.has('records')
    || filterTargetsPayment;
}
