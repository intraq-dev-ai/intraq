import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';
import type {
  AnalyzerCapabilityOperationName,
  AnalyzerPlanAgentLoopOptions,
  AnalyzerPlanToolState,
  AnalyzerRequestBreakdown,
  AnalyzerRequestBreakdownFilter
} from './analyzer-plan-agent-loop-types.js';
import {
  noEligibleCapabilitiesClarificationPlan,
  recoverableAnalyzerRouteMismatchResult,
  recoverableAnalyzerRouteRequiredResult
} from './analyzer-plan-agent-loop-recovery.js';
import {
  rememberResolvedModelCapabilities,
  resolveModelCapabilities
} from './analyzer-plan-agent-loop-capability-tools.js';
import { attachAnalyzerPlanTraceMetadata } from './analyzer-plan-agent-loop-trace-metadata.js';
import { normalizeAnalyzerGroupByForQuestion } from './analyzer-plan-grouping-intent.js';
import {
  analyzerDashboardComparisonMeasures,
  isDashboardAnswerFramingMeasure,
  isDashboardDisplayReferenceFilter
} from './analyzer-dashboard-context.js';

const requestFilterSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    field: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Known exact field name. Omit when the user only gave a business label.'
    },
    label: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Business filter label from the user request, for example payment method, location, date, product, or amount.'
    },
    operator: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Business operator such as equals, in, contains, between, gt, gte, lt, or lte.'
    },
    searchText: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'User wording that needs value lookup, for example a payment method, location, date, product, or amount.'
    },
    value: {
      description: 'Literal filter value or range from the user request.',
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'array', items: {} },
        { type: 'null' }
      ]
    }
  },
  required: ['field', 'label', 'operator', 'searchText', 'value']
};

const RANKING_DESCRIPTOR_TOKENS = new Set([
  'cheap',
  'cheapest',
  'expensive',
  'high',
  'highest',
  'large',
  'largest',
  'least',
  'low',
  'lowest',
  'most',
  'small',
  'smallest',
  'top',
  'value'
]);

const RANKING_METRIC_TOKENS = new Set([
  'amount',
  'aov',
  'average',
  'avg',
  'count',
  'counts',
  'invoice',
  'invoices',
  'margin',
  'order',
  'orders',
  'profit',
  'qty',
  'quantity',
  'revenue',
  'sale',
  'sales',
  'sold',
  'spend',
  'spending',
  'volume'
]);

const RANKING_ENTITY_TOKENS = new Set([
  'check',
  'invoice',
  'invoices',
  'order',
  'orders',
  'record',
  'records',
  'transaction',
  'transactions'
]);

const GENERIC_GROUPING_VALUE_TOKENS = new Set([
  'category',
  'categories',
  'client',
  'clients',
  'company',
  'companies',
  'date',
  'dates',
  'day',
  'days',
  'group',
  'groups',
  'item',
  'items',
  'location',
  'locations',
  'method',
  'methods',
  'month',
  'months',
  'order',
  'orders',
  'payment',
  'payments',
  'period',
  'periods',
  'product',
  'products',
  'tender',
  'tenders',
  'time',
  'times',
  'type',
  'types',
  'week',
  'weeks'
]);

export function breakDownAnalyzerRequestTool(
  options: AnalyzerPlanAgentLoopOptions,
  state: AnalyzerPlanToolState
): CodexAgentTool {
  return {
    terminal: false,
    definition: {
      type: 'function',
      name: 'break_down_analyzer_request',
      description: [
        'Break a business-analysis request into the actual ask, operation, filters, lookup values, grouping, sorting, and limit.',
        'This tool only captures the user request structure; model lookup and exact value resolution happen in later tools.',
        'Every explicit predicate value named by the user must be captured as a filter candidate with label and searchText, including products, items, categories, payment methods, order types, locations, staff, customers, statuses, and numeric thresholds. Requested output measures or comparison operands are not filters unless the user applies a predicate to their values.',
        'When the user asks which or what dimension performed best, or asks for a mix, breakdown, or percentage by a dimension, put that dimension in groupBy and do not also emit it as a filter unless the user supplied a concrete value such as Visa, Cash, Delivery, or Breakfast.',
        'Do not drop named lookup values because a date, metric, or grouping is also present; unsupported values are rejected by capability resolution later.',
        'For attachment, basket, or pairing questions, wording such as "with X", "for X", or "X attachment" usually names the anchor/filter value; keep X exactly in searchText and use a broad business label such as product, item, or category when the exact field is unknown.',
        'Use top_n for questions asking what items, entities, or categories are most common, most frequent, highest, lowest, or commonly paired with a filtered item.',
        'For high-value, low-value, most expensive, cheapest, or largest-smallest invoice/order/check prompts without an explicit numeric threshold, treat that as ranking intent, not as a literal value filter. Use top_n or list-with-sorting semantics and leave the amount concept as the metric or sort target instead of emitting a generic "value" filter.',
        'When one filter compares several values, return value as an array of the individual user values instead of one combined lookup phrase.',
        'For a breakdown by a field with no explicit business metric, put that field in groupBy and leave measure null; do not invent count unless the user asked for count, number of records, transactions, invoices, visits, or orders.',
        'For mix, share, or percentage-by-dimension requests, treat the percentage as answer framing rather than a physical measure field unless the user named a concrete rate metric such as discount rate, margin percent, utilization percent, or cost percent.',
        'When a comparison or answer asks for several output metrics, put the primary metric in measure and every requested metric or comparison operand in measures. Do not emit those output metrics as filters.'
      ].join(' '),
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          filters: {
            type: 'array',
            description: 'All filters from the user request, including dates, scope, lookup values, numeric thresholds, and statuses.',
            items: requestFilterSchema
          },
          groupBy: {
            type: 'array',
            description: 'Business groupings or breakdowns requested by the user.',
            items: { type: 'string' }
          },
          limit: {
            oneOf: [{ type: 'number' }, { type: 'null' }],
            description: 'Requested row limit or top-N limit.'
          },
          measure: {
            oneOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Business metric explicitly requested by the user. Leave null for plain breakdown/list/grouping requests without a named metric. For common-pairing questions, use a frequency/count style measure.'
          },
          measures: {
            type: 'array',
            description: 'Every business metric or comparison operand requested in the output. Include the primary measure here too.',
            items: { type: 'string' }
          },
          operation: {
            type: 'string',
            enum: ['list', 'aggregate', 'top_n', 'trend', 'compare', 'bucket'],
            description: 'Requested analysis operation. Use top_n, not compare, for "what do customers commonly buy/get/order with X" style questions.'
          },
          query: {
            type: 'string',
            description: 'Concise business ask in the user request, without implementation details.'
          },
          sortBy: {
            oneOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Business sort request when present.'
          }
        },
        required: ['filters', 'groupBy', 'limit', 'measure', 'measures', 'operation', 'query', 'sortBy']
      }
    },
    run: async args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'business_analysis') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      const breakdown = normalizeDashboardRequestBreakdown(
        readAnalyzerRequestBreakdown(args),
        options.body
      );
      state.requestBreakdown = breakdown;
      const preflight = hasLookupOrFilterInputs(breakdown)
        ? await resolveModelCapabilities(options, {}, breakdown)
        : null;
      if (preflight) rememberResolvedModelCapabilities(state, preflight);
      if (preflight && preflight.eligibleModels.length === 0) {
        return attachAnalyzerPlanTraceMetadata(noEligibleCapabilitiesClarificationPlan(options.request, preflight.rejectedModels), {
          capabilityPreflight: {
            eligibleModelCount: 0,
            rejectedModelCount: preflight.rejectedModels.length
          },
          rejectedModels: summarizeRejectedPreflightModels(preflight.rejectedModels)
        });
      }
      return {
        success: true,
        breakdown,
        ...(preflight
          ? {
              capabilityPreflight: {
                eligibleModelCount: preflight.eligibleModels.length,
                firstModelId: preflight.eligibleModels[0]?.id,
                firstModelName: preflight.eligibleModels[0]?.name,
                rejectedModelCount: preflight.rejectedModels.length
              }
            }
          : {}),
        nextStep: hasLookupOrFilterInputs(breakdown)
          ? 'Capability preflight already ran. Call get_schema for an eligible model, then build_component.'
          : 'Use a safe direct retrieval candidate when available; otherwise search data models.'
      };
    }
  };
}

function normalizeDashboardRequestBreakdown(
  breakdown: AnalyzerRequestBreakdown,
  body: unknown
): AnalyzerRequestBreakdown {
  const filters = breakdown.filters.filter(filter => !isDashboardDisplayReferenceFilter(body, filter));
  const requestedMeasures = (breakdown.measures ?? [])
    .filter(measure => !isDashboardAnswerFramingMeasure(body, measure));
  const bodyRecord = isRecord(body) ? body : {};
  const comparisonMeasures = analyzerDashboardComparisonMeasures(
    body,
    readString(bodyRecord.question) ?? breakdown.query
  );
  const measures = comparisonMeasures.length > 1 ? comparisonMeasures : requestedMeasures;
  const measure = comparisonMeasures[0] ?? (isDashboardAnswerFramingMeasure(body, breakdown.measure)
    ? measures[0]
    : breakdown.measure);
  if (
    filters.length === breakdown.filters.length
    && measures.length === (breakdown.measures ?? []).length
    && measure === breakdown.measure
  ) {
    return breakdown;
  }
  const normalized: AnalyzerRequestBreakdown = {
    ...breakdown,
    filters,
    measures
  };
  if (measure) normalized.measure = measure;
  else delete normalized.measure;
  return normalized;
}

function summarizeRejectedPreflightModels(models: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return models.slice(0, 4).map(model => {
    const summary: Record<string, unknown> = {};
    copyString(summary, model, 'id');
    copyString(summary, model, 'name');
    copyString(summary, model, 'businessName');
    copyString(summary, model, 'operation');
    const reasons = readStringArray(model.reasons).slice(0, 4);
    if (reasons.length > 0) summary.reasons = reasons;
    return summary;
  }).filter(model => Object.keys(model).length > 0);
}

function copyString(target: Record<string, unknown>, source: Record<string, unknown>, key: string): void {
  const value = readString(source[key]);
  if (value) target[key] = value;
}

function readAnalyzerRequestBreakdown(args: Record<string, unknown>): AnalyzerRequestBreakdown {
  const measure = readString(args.measure);
  const measures = uniqueStrings([...(measure ? [measure] : []), ...readStringArrayValue(args.measures)]);
  return normalizeAnalyzerRequestBreakdown({
    filters: readBreakdownFilters(args.filters),
    groupBy: readStringArrayValue(args.groupBy),
    ...(readNumber(args.limit) === null ? {} : { limit: readNumber(args.limit)! }),
    ...(measure ? { measure } : {}),
    ...(measures.length > 0 ? { measures } : {}),
    operation: readOperation(args.operation),
    query: readString(args.query) ?? 'Business analysis request',
    ...(readString(args.sortBy) ? { sortBy: readString(args.sortBy)! } : {})
  });
}

export function normalizeAnalyzerRequestBreakdown(
  breakdown: AnalyzerRequestBreakdown
): AnalyzerRequestBreakdown {
  const groupBy = normalizeAnalyzerGroupByForQuestion(
    breakdown.groupBy,
    breakdown.operation,
    breakdown.query
  );
  return {
    ...breakdown,
    groupBy,
    filters: breakdown.filters.filter(filter =>
      !dimensionOnlyFilterAlreadyRepresentedByGroupBy(filter, groupBy)
      && !genericGroupingValueFilterAlreadyRepresentedByGroupBy(filter, groupBy)
      && !groupedRankingPlaceholderFilter(filter, groupBy, breakdown.operation)
      && !rankingDescriptorFilter(filter, breakdown.operation)
    )
  };
}

function readBreakdownFilters(value: unknown): AnalyzerRequestBreakdownFilter[] {
  return Array.isArray(value)
    ? value.flatMap(item => {
      if (!isRecord(item)) return [];
      const field = readString(item.field);
      const label = readString(item.label);
      const operator = readString(item.operator);
      const searchText = readString(item.searchText);
      const filter: AnalyzerRequestBreakdownFilter = {};
      if (field) filter.field = field;
      if (label) filter.label = label;
      if (operator) filter.operator = operator;
      if (searchText) filter.searchText = searchText;
      if ('value' in item) filter.value = item.value;
      return field || label || operator || searchText || 'value' in item ? [filter] : [];
    })
    : [];
}

function readStringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => readString(item)).filter((item): item is string => item !== null)
    : [];
}

function readOperation(value: unknown): AnalyzerCapabilityOperationName {
  return value === 'aggregate'
    || value === 'top_n'
    || value === 'trend'
    || value === 'compare'
    || value === 'bucket'
    ? value
    : 'list';
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hasLookupOrFilterInputs(breakdown: AnalyzerRequestBreakdown): boolean {
  return breakdown.filters.length > 0
    || breakdown.groupBy.length > 0
    || Boolean(breakdown.measure)
    || Boolean(breakdown.sortBy)
    || typeof breakdown.limit === 'number';
}

function dimensionOnlyFilterAlreadyRepresentedByGroupBy(
  filter: AnalyzerRequestBreakdownFilter,
  groupBy: string[]
): boolean {
  if (groupBy.length === 0) return false;
  if (filterHasConcreteValue(filter)) return false;
  const filterTokens = analyzerTokenSet([filter.field, filter.label].filter(Boolean).join(' '));
  if (filterTokens.size === 0) return false;
  return groupBy.some(item => tokenSetsOverlap(filterTokens, analyzerTokenSet(item)));
}

function genericGroupingValueFilterAlreadyRepresentedByGroupBy(
  filter: AnalyzerRequestBreakdownFilter,
  groupBy: string[]
): boolean {
  if (groupBy.length === 0) return false;
  const valueTokens = analyzerTokenSet([
    readString(filter.searchText),
    ...readBreakdownFilterTextValues(filter.value)
  ].filter((value): value is string => Boolean(value)).join(' '));
  if (valueTokens.size === 0) return false;
  if (!groupBy.some(item => tokenSetsOverlap(valueTokens, analyzerTokenSet(item)))) return false;
  return Array.from(valueTokens).every(token => GENERIC_GROUPING_VALUE_TOKENS.has(token));
}

function rankingDescriptorFilter(
  filter: AnalyzerRequestBreakdownFilter,
  operation: AnalyzerCapabilityOperationName
): boolean {
  if (operation !== 'top_n') return false;
  const labelTokens = analyzerTokenSet([filter.field, filter.label].filter(Boolean).join(' '));
  if (!tokenSetHasAny(labelTokens, RANKING_ENTITY_TOKENS)) return false;
  const rankingTokens = analyzerTokenSet(filter.searchText ?? primitiveRankingValue(filter.value));
  if (rankingTokens.size === 0) return false;
  return Array.from(rankingTokens).every(token => RANKING_DESCRIPTOR_TOKENS.has(token));
}

function groupedRankingPlaceholderFilter(
  filter: AnalyzerRequestBreakdownFilter,
  groupBy: string[],
  operation: AnalyzerCapabilityOperationName
): boolean {
  if (operation !== 'top_n' || groupBy.length === 0) return false;
  const filterTokens = analyzerTokenSet([filter.field, filter.label].filter(Boolean).join(' '));
  if (filterTokens.size === 0) return false;
  if (!groupBy.some(item => tokenSetsOverlap(filterTokens, analyzerTokenSet(item)))) return false;
  const valueTokens = analyzerTokenSet([
    readString(filter.searchText),
    ...readBreakdownFilterTextValues(filter.value)
  ].filter((value): value is string => Boolean(value)).join(' '));
  if (valueTokens.size === 0) return false;
  return Array.from(valueTokens).every(token =>
    RANKING_DESCRIPTOR_TOKENS.has(token)
    || RANKING_METRIC_TOKENS.has(token)
    || GENERIC_GROUPING_VALUE_TOKENS.has(token)
  );
}

function filterHasConcreteValue(filter: AnalyzerRequestBreakdownFilter): boolean {
  if (readString(filter.searchText)) return true;
  if (Array.isArray(filter.value)) return filter.value.some(item => concreteFilterValue(item));
  return concreteFilterValue(filter.value);
}

function concreteFilterValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return false;
}

function primitiveRankingValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBreakdownFilterTextValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => typeof item === 'string' && item.trim() ? [item] : []);
}

function tokenSetsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

function tokenSetHasAny(tokens: Set<string>, expected: Set<string>): boolean {
  for (const token of tokens) {
    if (expected.has(token)) return true;
  }
  return false;
}
