import { analyzerTokenSet } from './analyzer-token-utils.js';

interface FilterTargetReference {
  field?: string;
  label?: string;
  searchText?: string;
  value?: unknown;
}

const GENERIC_TARGET_TOKENS = new Set([
  'attribute',
  'concept',
  'condition',
  'dimension',
  'field',
  'filter',
  'value'
]);
const STRUCTURAL_TARGET_TOKENS = new Set([
  'amount',
  'date',
  'id',
  'identifier',
  'method',
  'name',
  'number',
  'status',
  'total',
  'type'
]);
const DESCRIPTIVE_CONDITION_TOKENS = new Set([
  'active',
  'archive',
  'archived',
  'cancel',
  'cancelled',
  'deleted',
  'discounted',
  'exclude',
  'excluded',
  'exclusion',
  'inactive',
  'missing',
  'negative',
  'refund',
  'refunded',
  'void',
  'voided',
  'zero'
]);
const LOW_SIGNAL_VALUE_TOKENS = new Set([
  'from',
  'invoice',
  'invoices',
  'record',
  'records',
  'revenue',
  'sale',
  'sales'
]);

/**
 * Returns null when the planner did not provide a semantic field target,
 * otherwise reports whether that target is covered by one configured field term.
 */
export function explicitFilterTargetFieldCompatibility(
  filter: FilterTargetReference,
  metadataFieldTerms: string[]
): boolean | null {
  const rawTarget = typeof filter.field === 'string' ? filter.field.trim() : '';
  const target = normalizedText(rawTarget);
  if (!target || targetIsValueFraming(rawTarget, target, filter)) return null;
  const targetTokens = analyzerTokenSet(target);
  if (targetTokens.size === 0 || allGenericTargetTokens(targetTokens)) return null;
  return metadataFieldTerms.some(term => {
    const fieldTokens = analyzerTokenSet(term);
    if (fieldTokens.size === 0) return false;
    for (const token of targetTokens) {
      if (!fieldTokens.has(token)) return false;
    }
    return true;
  });
}

export function descriptiveValueFilterHasMetadataEvidence(
  filter: FilterTargetReference,
  metadataValueTerms: string[]
): boolean | null {
  const filterTokens = meaningfulValueTokens([
    filter.label,
    filter.searchText,
    typeof filter.value === 'string' ? filter.value : undefined
  ].filter((value): value is string => Boolean(value)).join(' '));
  if (![...filterTokens].some(token => DESCRIPTIVE_CONDITION_TOKENS.has(token))) return null;
  return metadataValueTerms.some(term => {
    const termTokens = meaningfulValueTokens(term);
    for (const token of filterTokens) {
      if (termTokens.has(token)) return true;
    }
    return false;
  });
}

function targetIsValueFraming(
  rawTarget: string,
  target: string,
  filter: FilterTargetReference
): boolean {
  const targetTokens = analyzerTokenSet(rawTarget);
  if (
    rawTarget.includes('_')
    || rawTarget.includes('-')
    || [...targetTokens].some(token => STRUCTURAL_TARGET_TOKENS.has(token))
  ) {
    return false;
  }
  const searchText = normalizedText(filter.searchText);
  if (searchText && searchText === target) return true;
  const directValue = typeof filter.value === 'string' ? normalizedText(filter.value) : '';
  return Boolean(directValue) && directValue === target;
}

function allGenericTargetTokens(tokens: Set<string>): boolean {
  for (const token of tokens) {
    if (!GENERIC_TARGET_TOKENS.has(token)) return false;
  }
  return true;
}

function meaningfulValueTokens(value: string): Set<string> {
  return new Set([...analyzerTokenSet(value)].filter(token => !LOW_SIGNAL_VALUE_TOKENS.has(token)));
}

function normalizedText(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
    : '';
}
