import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import {
  findDataSource,
  type TableDefinition
} from '../data-source/foundation-store.js';
import { scopedDataSourceForRead } from '../data-source/source-access.js';
import {
  analyzerCapabilityPromptContract,
  buildAnalyzerCapabilityManifest,
  type AnalyzerCapabilityField,
  type AnalyzerCapabilityFilterOperator,
  type AnalyzerCapabilityOperation
} from './analyzer-capability-contract.js';
import {
  modelMatchesRoutingNotFor,
  modelCatalogQuery,
  rankModelsForCatalogQuery
} from './analyzer-plan-model-catalog.js';
import { readParameterValues } from './analyzer-plan-build-component-parameters.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';
import {
  businessNameForTable,
  isAnalyzerModel
} from './analyzer-plan-table-context.js';
import { analyzerBusinessScopeTermIsBindable } from './analyzer-business-scope-plan.js';
import { parseConfirmedAnalyzerBusinessScope } from './analyzer-business-scope.js';
import {
  analyzerDateRangeSelectionForQuestion,
  analyzerParameterValuesForQuestion,
  analyzerParameterDefinitionsForTable
} from './analyzer-plan-parameter-values.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import {
  fieldValueResolutionForTable,
  resolveAnalyzerFieldValues
} from './analyzer-value-resolver.js';
import {
  withMetadataConditionFilters
} from './analyzer-plan-condition-filter-inference.js';
import { withValueConceptFilters } from './analyzer-plan-value-concept-filter-inference.js';
import {
  filterCompatibleWithField,
  primitiveSearchText,
  readPreflightFilters,
  selectFilterFields,
  stringLikeField,
  supportedOperator,
  type PreflightFilter
} from './analyzer-plan-capability-filter-selection.js';
import type {
  AnalyzerPlanAgentLoopOptions,
  AnalyzerPlanToolState
} from './analyzer-plan-agent-loop-types.js';
import {
  recoverableAnalyzerRouteMismatchResult,
  recoverableAnalyzerRouteRequiredResult,
  noEligibleCapabilitiesClarificationPlan,
  rememberMatchedModels
} from './analyzer-plan-agent-loop-recovery.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';
import { attachAnalyzerPlanTraceMetadata } from './analyzer-plan-agent-loop-trace-metadata.js';
import {
  comparedRequestedMeasureReferenceFilter,
  normalizeNumericPreflightFilter,
  parseBusinessNumericText,
  repeatedMeasureReferenceFilter,
  requestedOutputFieldReferenceFilter,
  thresholdConceptTerms,
  thresholdEncodedByMeasure
} from './analyzer-plan-capability-filter-intent.js';
import {
  explicitlyRequestedMeasureNames,
  explicitlyRequestedMeasureTerms,
  preferSpecificMeasureTerms
} from './analyzer-plan-capability-measures.js';
import {
  supportedFiltersByModel,
  supportedMeasuresByModel,
  supportedStringListByModel
} from './analyzer-plan-preflight-filter-merge.js';
import {
  genericPaymentMethodGroupBy,
  metricLikeGroupByField,
  normalizeAnalyzerGroupByForQuestion
} from './analyzer-plan-grouping-intent.js';
import {
  analyzerBusinessScopeFieldIdentityMatches,
  analyzerBusinessScopeGroupTerm,
  businessScopeFilterReferences,
  fixedBusinessScopeTerms,
  removeFixedFilterGroupBy
} from './analyzer-plan-preflight-grouping.js';
import {
  filterEncodedByAnalyzerModelScope,
  narrowAnalyzerModelScopeValues
} from './analyzer-plan-capability-model-scope.js';
import { invoiceRowListPriorityBoost } from './analyzer-plan-invoice-list-priority.js';
import { analyzerModelQualityRefusal } from './analyzer-plan-model-quality-gate.js';
import {
  normalizeRequestedMeasure,
  operationRequiresMeasure
} from './analyzer-plan-capability-operation-intent.js';
import { analyzerDashboardComponentModelKeys } from './analyzer-dashboard-context.js';
const MAX_PREFLIGHT_MODELS = 8;

type AnalyzerCapabilityResolveOptions =
  Pick<AnalyzerPlanAgentLoopOptions, 'body' | 'request'>
  & Partial<Omit<AnalyzerPlanAgentLoopOptions, 'body' | 'request'>>;

type ResolvedAnalyzerCapabilityModel = Record<string, unknown> & {
  id: string;
  name: string;
  supportedFilters?: Array<Record<string, unknown>>;
};

const preflightFilterSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    field: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Exact field if already known, otherwise omit and provide label.'
    },
    label: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Business field/filter label from the user request, for example payment method, location id, or business date.'
    },
    operator: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Requested filter operator such as equals, in, contains, between, gte, or lte.'
    },
    searchText: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'User-provided lookup text to resolve through configured value concepts or lookup configuration.'
    },
    value: {
      description: 'Direct filter value or date range. Use the user-provided value.',
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

export function resolveModelCapabilitiesTool(
  options: AnalyzerPlanAgentLoopOptions,
  state: AnalyzerPlanToolState
): CodexAgentTool {
  return {
    terminal: output => isRecord(output) && output.success === true && Array.isArray(output.actions),
    definition: {
      type: 'function',
      name: 'resolve_model_capabilities',
      description: [
        'Resolve the user request against AI-ready data-model capabilities before get_schema/build_component.',
        'Use this for business analysis requests with operations, filters, groupings, measures, lookup values, or scoped values.',
        'The backend returns only models that support the requested operation, requested groupings, requested measure, and filters, and resolves lookup values from model metadata/config in parallel.'
      ].join(' '),
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          filters: {
            type: 'array',
            description: 'Filters or lookup values from the user request. These are semantic inputs; backend maps them to AI-ready fields.',
            items: preflightFilterSchema
          },
          groupBy: {
            type: 'array',
            description: 'Business dimensions or breakdowns requested by the user. These are semantic labels; backend maps them to AI-ready groupable fields.',
            items: { type: 'string' }
          },
          limit: {
            oneOf: [{ type: 'number' }, { type: 'null' }],
            description: 'Maximum eligible models to return.'
          },
          measure: {
            oneOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Primary business measure requested by the user, for example sales, revenue, count, quantity, discount, or profit.'
          },
          measures: {
            type: 'array',
            description: 'Every requested output measure or comparison operand, including the primary measure.',
            items: { type: 'string' }
          },
          operation: {
            oneOf: [
              {
                type: 'string',
                enum: ['list', 'aggregate', 'top_n', 'trend', 'compare', 'bucket']
              },
              { type: 'null' }
            ],
            description: 'The requested model capability operation.'
          },
          query: {
            oneOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Business request terms for AI-ready data-model retrieval.'
          }
        },
        required: ['filters', 'groupBy', 'limit', 'measure', 'measures', 'operation', 'query']
      }
    },
    run: async args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'business_analysis') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      const result = await resolveModelCapabilities(options, args, state.requestBreakdown);
      rememberResolvedModelCapabilities(state, result);
      if (result.eligibleModels.length === 0) {
        return attachAnalyzerPlanTraceMetadata(noEligibleCapabilitiesClarificationPlan(options.request, result.rejectedModels), {
          capabilityPreflight: {
            eligibleModelCount: 0,
            rejectedModelCount: result.rejectedModels.length
          },
          rejectedModels: summarizeRejectedPreflightModels(result.rejectedModels)
        });
      }
      return result;
    }
  };
}

function summarizeRejectedPreflightModels(models: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return models.slice(0, 4).map(model => {
    const summary: Record<string, unknown> = {};
    const id = readString(model.id);
    const name = readString(model.name);
    const businessName = readString(model.businessName);
    const operation = readString(model.operation);
    if (id) summary.id = id;
    if (name) summary.name = name;
    if (businessName) summary.businessName = businessName;
    if (operation) summary.operation = operation;
    const reasons = readStringArray(model.reasons).slice(0, 4);
    if (reasons.length > 0) summary.reasons = reasons;
    return summary;
  }).filter(model => Object.keys(model).length > 0);
}

export function rememberResolvedModelCapabilities(
  state: AnalyzerPlanToolState,
  result: {
    eligibleModels: Array<Record<string, unknown> & { id: string; name: string }>;
    operation?: AnalyzerCapabilityOperation;
  }
): void {
  state.capabilityPreflightUsed = true;
  if (result.operation) state.preflightOperation = result.operation;
  state.preflightModelIds = result.eligibleModels.map(model => model.id);
  state.preflightModelNames = result.eligibleModels.map(model => model.name);
  state.preflightSupportedFiltersByModel = supportedFiltersByModel(result.eligibleModels);
  state.preflightSupportedGroupByByModel = supportedStringListByModel(result.eligibleModels, 'supportedGroupBy');
  state.preflightSupportedMeasuresByModel = supportedMeasuresByModel(result.eligibleModels);
  state.capabilityPreflightHadNoEligibleModels = result.eligibleModels.length === 0;
  if (result.eligibleModels[0]) {
    state.firstMatchedModelId = result.eligibleModels[0].id;
    state.firstMatchedModelName = result.eligibleModels[0].name;
    state.matchedModelCount = result.eligibleModels.length;
  }
  rememberMatchedModels(state, {
    models: result.eligibleModels.map(model => ({
      id: model.id,
      name: model.name
    }))
  });
}

export async function resolveModelCapabilities(
  options: AnalyzerCapabilityResolveOptions,
  args: Record<string, unknown>,
  breakdown?: AnalyzerPlanToolState['requestBreakdown']
): Promise<{
  dataSourceId: string;
  eligibleModels: ResolvedAnalyzerCapabilityModel[];
  operation: AnalyzerCapabilityOperation;
  rejectedModels: Array<Record<string, unknown>>;
  success: boolean;
}> {
  const capabilityArgs: Record<string, unknown> = breakdown
    ? {
        filters: breakdown.filters,
        groupBy: breakdown.groupBy,
        limit: breakdown.limit,
        measure: breakdown.measure,
        measures: breakdown.measures,
        operation: breakdown.operation,
        query: breakdown.query
      }
    : args;
  const operation = readOperation(capabilityArgs.operation);
  const rawSource = findDataSource(options.request.dataSourceId);
  const source = rawSource && options.accessPolicy ? scopedDataSourceForRead(rawSource, options.accessPolicy) : rawSource;
  if (!source) {
    return {
      dataSourceId: options.request.dataSourceId,
      eligibleModels: [],
      operation,
      rejectedModels: [],
      success: false
    };
  }
  const modelBinding = analyzerDashboardComponentModelKeys(options.body);
  const analyzerModels = source.tables.filter(isAnalyzerModel).filter(table =>
    !modelBinding || modelBinding.ids.includes(table.id) || modelBinding.names.includes(table.name)
  );
  const filters = normalizeComparePreflightFilters(
    readPreflightFilters(capabilityArgs.filters),
    operation
  ).map(normalizeNumericPreflightFilter);
  const groupingFilters = [
    ...filters,
    ...businessScopeFilterReferences(capabilityArgs.filters)
  ];
  const groupBy = inferImplicitPreflightGroupBy(
    normalizeAnalyzerGroupByForQuestion(
      readPreflightGroupBy(capabilityArgs.groupBy),
      operation,
      options.request.question
    ),
    groupingFilters,
    options.request.question,
    [],
    []
  );
  const limit = readPreflightLimit(capabilityArgs.limit);
  const primaryMeasure = normalizeRequestedMeasure(readString(capabilityArgs.measure) ?? undefined, {
    groupBy,
    operation,
    question: options.request.question
  });
  const measures = uniqueStrings([
    ...(primaryMeasure ? [primaryMeasure] : []),
    ...readStringArray(capabilityArgs.measures)
  ].map(value => normalizeRequestedMeasure(value, {
    groupBy,
    operation,
    question: options.request.question
  })).filter((value): value is string => Boolean(value)));
  const measure = primaryMeasure ?? measures[0];
  const query = readString(capabilityArgs.query) ?? options.request.question;
  const ranked = rankModelsForCatalogQuery(
    analyzerModels,
    modelCatalogQuery(query, options.request.question)
  ).slice(0, Math.max(limit, MAX_PREFLIGHT_MODELS));
  const candidates = ranked.length > 0
    ? ranked
    : analyzerModels.slice(0, MAX_PREFLIGHT_MODELS).map((table, index) => ({ index, score: 0, table }));
  const explicitMeasures = preferSpecificMeasureTerms(analyzerModels
    .flatMap(table => explicitlyRequestedMeasureTerms(
      buildAnalyzerCapabilityManifest(source, table).measures,
      options.request.question
    )));
  const resolvedMeasure = measure ?? explicitMeasures[0];
  const resolvedMeasures = uniqueStrings([...measures, ...explicitMeasures]);

  const evaluated = await Promise.all(candidates.map(item => evaluateModelCandidate({
    exactMeasures: explicitMeasures,
    filters,
    groupBy,
    groupingFilters,
    measure: resolvedMeasure,
    measures: resolvedMeasures,
    operation,
    options,
    rankingScore: item.score,
    table: item.table
  })));
  const eligibleModels = evaluated
    .filter(item => item.eligible)
    .sort((left, right) =>
      eligibleModelPriorityScore(right.table, right.model, {
        filters,
        operation,
        question: options.request.question
      }) - eligibleModelPriorityScore(left.table, left.model, {
        filters,
        operation,
        question: options.request.question
      })
    )
    .slice(0, limit)
    .map(item => item.model);
  const rejectedModels = evaluated
    .filter(item => !item.eligible)
    .slice(0, 12)
    .map(item => item.model);
  return {
    dataSourceId: source.id,
    eligibleModels,
    operation,
    rejectedModels,
    success: true
  };
}

function normalizeComparePreflightFilters(
  filters: PreflightFilter[],
  operation: AnalyzerCapabilityOperation
): PreflightFilter[] {
  if (operation !== 'compare' || filters.length < 2) return filters;
  return normalizePaymentFamilyCompareFilters(filters);
}

function normalizePaymentFamilyCompareFilters(filters: PreflightFilter[]): PreflightFilter[] {
  const candidateIndexes = filters.flatMap((filter, index) =>
    paymentFamilyCandidateFilter(filter) ? [index] : []
  );
  if (candidateIndexes.length < 2) return filters;
  const candidates = candidateIndexes
    .map(index => filters[index])
    .filter((filter): filter is PreflightFilter => Boolean(filter));
  const combinedTexts = uniqueStrings(candidates.flatMap(filter => [
    readString(filter.searchText),
    ...textValues(filter.value)
  ].filter((value): value is string => Boolean(value))));
  if (!paymentFamilyComparisonTokens(tokenSet(combinedTexts.join(' ')))) return filters;
  const [firstCandidate] = candidates;
  if (!firstCandidate) return filters;
  const mergedFilter: PreflightFilter = {
    ...firstCandidate,
    operator: 'in',
    searchText: combinedTexts.join(', '),
    value: combinedTexts
  };
  const firstIndex = candidateIndexes[0] ?? -1;
  const normalized: PreflightFilter[] = [];
  for (let index = 0; index < filters.length; index += 1) {
    if (index === firstIndex) {
      normalized.push(mergedFilter);
      continue;
    }
    if (candidateIndexes.includes(index)) continue;
    const filter = filters[index];
    if (filter) normalized.push(filter);
  }
  return normalized;
}

function paymentFamilyCandidateFilter(filter: PreflightFilter): boolean {
  return filterTargetsTerms(filter, ['payment', 'method', 'tender', 'family']) && filterHasConcreteValue(filter);
}

export function inferImplicitPreflightGroupBy(
  groupBy: string[],
  filters: PreflightFilter[],
  question: string,
  fixedScopeTerms = fixedBusinessScopeTerms(undefined, question),
  bindableScopeTerms?: string[]
): string[] {
  const paymentFamilyGrouping = questionRequestsPaymentFamilyGrouping(question, filters);
  const normalized = paymentFamilyGrouping
    ? removeFixedFilterGroupBy(groupBy, filters, question, fixedScopeTerms, bindableScopeTerms).filter(item => !genericPaymentMethodGroupBy(item))
    : removeFixedFilterGroupBy(groupBy, filters, question, fixedScopeTerms, bindableScopeTerms);
  if (
    !groupByAlreadyRequested(normalized, ['family', 'cash', 'card'])
    && paymentFamilyGrouping
  ) {
    normalized.push('payment family');
  }
  if (
    !paymentFamilyGrouping
    && !groupByAlreadyRequested(normalized, ['payment', 'method', 'type', 'tender'])
    && questionRequestsPaymentGrouping(question)
    && !explicitPaymentValueFilter(filters)
  ) {
    normalized.push('payment method');
  }
  if (
    !groupByAlreadyRequested(normalized, ['product', 'products', 'item', 'items'])
    && questionRequestsProductGrouping(question)
    && !explicitProductValueFilter(filters)
  ) {
    normalized.push('product');
  }
  return uniqueStrings(normalized);
}

async function evaluateModelCandidate(input: {
  exactMeasures: string[];
  filters: PreflightFilter[];
  groupBy: string[];
  groupingFilters: PreflightFilter[];
  measure?: string | undefined;
  measures: string[];
  operation: AnalyzerCapabilityOperation;
  options: AnalyzerCapabilityResolveOptions;
  rankingScore: number;
  table: TableDefinition;
}): Promise<{ eligible: boolean; model: ResolvedAnalyzerCapabilityModel; table: TableDefinition }> {
  const rawSource = findDataSource(input.options.request.dataSourceId);
  const source = rawSource && input.options.accessPolicy ? scopedDataSourceForRead(rawSource, input.options.accessPolicy) : rawSource;
  if (!source) {
    return {
      eligible: false,
      model: { id: input.table.id, name: input.table.name, reasons: ['Data source unavailable.'] },
      table: input.table
    };
  }
  const manifest = buildAnalyzerCapabilityManifest(source, input.table);
  const filters = withValueConceptFilters(
    input.table,
    manifest.filterableFields,
    input.options.request.question,
    withMetadataConditionFilters(
      input.table,
      manifest.filterableFields,
      input.options.request.question,
      input.filters
    )
  );
  const reasons: string[] = [];
  const routingMismatch = modelMatchesRoutingNotFor(input.table, input.options.request.question);
  if (routingMismatch) reasons.push(`${businessNameForTable(input.table)} is configured not to answer this request.`);
  if (!manifest.operations.includes(input.operation)) {
    reasons.push(`${manifest.modelName} does not support ${input.operation}.`);
  }
  const confirmedScope = isRecord(input.options.body)
    ? parseConfirmedAnalyzerBusinessScope(input.options.body.businessScope)
    : null;
  const fixedScopeTerms = fixedBusinessScopeTerms(input.options.body, input.options.request.question);
  const bindableScopeTerms = uniqueStrings([...fixedScopeTerms, ...input.groupBy]).filter(term =>
    analyzerBusinessScopeTermIsBindable(input.table, term, confirmedScope)
  );
  const candidateGroupBy = removeFixedFilterGroupBy(
    input.groupBy,
    input.groupingFilters,
    input.options.request.question,
    fixedScopeTerms,
    bindableScopeTerms
  );
  const rawGroupBy = input.operation === 'list' ? [] : candidateGroupBy;
  const classifiedGroupBy = rawGroupBy.map(term => ({
    groupField: metricLikeGroupByField(manifest.groupableFields, term),
    measureField: metricLikeGroupByField(manifest.measures, term),
    term
  }));
  const groupByMeasureFields = classifiedGroupBy
    .filter(item => !item.groupField)
    .map(item => item.measureField)
    .filter((field): field is AnalyzerCapabilityField => Boolean(field));
  const groupBy = classifiedGroupBy
    .filter(item => item.groupField || !item.measureField)
    .map(item => item.term);
  const groupByFields = resolveRequestedGroupByFields(manifest.groupableFields, groupBy);
  const shouldRequireMeasure = operationRequiresMeasure(input.operation);
  const requestedMeasureTerms = uniqueStrings([
    ...input.measures,
    ...explicitlyRequestedMeasureNames(manifest.measures, input.options.request.question)
  ]);
  const requestedMeasureFields = shouldRequireMeasure
    ? requestedMeasureTerms.map(measure => ({
        field: resolveRequestedCapabilityField(manifest.measures, measure, {
          filters,
          groupBy,
          question: input.options.request.question
        }, input.exactMeasures.includes(measure)),
        measure
      }))
    : [];
  const requestedMeasureField = input.measure && shouldRequireMeasure
    ? resolveRequestedCapabilityField(manifest.measures, input.measure, {
        filters,
        groupBy,
        question: input.options.request.question
      }, input.exactMeasures.includes(input.measure))
    : null;
  const measureField = requestedMeasureField
    ?? groupByMeasureFields[0]
    ?? requestedMeasureFields.find(item => item.field)?.field
    ?? null;
  for (const requested of requestedMeasureFields) {
    if (!requested.field) reasons.push(`No AI-ready measure field supports ${requested.measure}.`);
  }

  const qualityRefusal = reasons.length === 0
    ? analyzerModelQualityRefusal({
        groupBy: groupByFields.flatMap(item => item.field ? [item.field.name] : []),
        measures: uniqueStrings([
          ...requestedMeasureFields.flatMap(item => item.field ? [item.field.name] : []),
          ...(measureField ? [measureField.name] : [])
        ]),
        operation: input.operation,
        question: input.options.request.question,
        table: input.table
      })
    : null;
  if (qualityRefusal) {
    return {
      eligible: false,
      table: input.table,
      model: {
        id: input.table.id,
        name: input.table.name,
        businessName: businessNameForTable(input.table),
        capabilityContract: analyzerCapabilityPromptContract(manifest),
        operation: input.operation,
        rankingScore: input.rankingScore,
        reasons: [qualityRefusal.reason],
        safeRefusal: qualityRefusal.safeRefusal,
        safeRefusalReason: qualityRefusal.reason,
        safeRefusalSuggestedFollowUps: qualityRefusal.suggestedFollowUps
      }
    };
  }

  const derivedParameterValues = {
    ...parameterValuesFromPreflightFilters(
      input.table,
      manifest.filterableFields,
      filters,
      input.options.request.question
    ),
    ...analyzerParameterValuesForQuestion(input.table, input.options.request.question)
  };
  const resolvedFilters = reasons.length > 0 ? [] : await Promise.all(filters.map(filter => resolvePreflightFilter(
    input.options,
    input.table,
    filter,
    derivedParameterValues,
    Array.from(new Map([
      ...requestedMeasureFields.flatMap(item => item.field ? [item.field] : []),
      ...(measureField ? [measureField] : [])
    ].map(field => [field.name, field])).values()),
    input.operation
  )));
  for (const filter of resolvedFilters) {
    if (!filter.supported) reasons.push(filter.reason);
  }
  const supportedFilters = resolvedFilters.filter(filter => filter.supported).map(filter => filter.filter);
  const materializedFilters = supportedFilters.filter(filter =>
    filter.source !== 'measure_hint' && filter.source !== 'model_scope' && filter.source !== 'semantic_hint'
  );
  for (const item of groupByFields) {
    if (!item.field && !groupByTermCoveredByFilter(item.term, materializedFilters)) {
      reasons.push(`No AI-ready grouping field supports ${item.term}.`);
    }
  }
  const eligible = reasons.length === 0;
  return {
    eligible,
    table: input.table,
    model: {
      id: input.table.id,
      name: input.table.name,
      businessName: businessNameForTable(input.table),
      capabilityContract: analyzerCapabilityPromptContract(manifest),
      operation: input.operation,
      rankingScore: input.rankingScore,
      ...(groupByFields.some(item => item.field)
        ? { supportedGroupBy: groupByFields.flatMap(item => item.field ? [item.field.name] : []) }
        : {}),
      supportedFilters: materializedFilters,
      ...(measureField ? { supportedMeasure: measureField.name } : {}),
      ...(requestedMeasureFields.some(item => item.field)
        ? { supportedMeasures: uniqueStrings(requestedMeasureFields.flatMap(item => item.field ? [item.field.name] : [])) }
        : {}),
      ...(eligible ? {
        nextStep: 'Call get_schema for this model, then build_component using the supportedFilters and capability operation.'
      } : { reasons })
    }
  };
}

function eligibleModelPriorityScore(
  table: TableDefinition,
  model: Record<string, unknown> & { id: string; name: string },
  context: {
    filters: PreflightFilter[];
    operation: AnalyzerCapabilityOperation;
    question: string;
  }
): number {
  let score = typeof model.rankingScore === 'number' && Number.isFinite(model.rankingScore)
    ? model.rankingScore
    : 0;
  score += invoiceRowListPriorityBoost(table, context.operation, context.question, context.filters);
  return score;
}

function groupByAlreadyRequested(groupBy: string[], expectedTokens: string[]): boolean {
  return groupBy.some(item => {
    const tokens = tokenSet(item);
    return expectedTokens.some(token => tokens.has(token));
  });
}

function explicitPaymentValueFilter(filters: PreflightFilter[]): boolean {
  return filters.some(filter => {
    if (!filterTargetsTerms(filter, ['payment', 'method', 'tender', 'family'])) return false;
    if (!filterHasConcreteValue(filter)) return false;
    return !paymentFamilyComparisonFilter(filter);
  });
}

function explicitProductValueFilter(filters: PreflightFilter[]): boolean {
  return filters.some(filter => {
    if (filterTargetsTerms(filter, ['product'])) return filterHasConcreteValue(filter);
    if (filterTargetsTerms(filter, ['item', 'items'])) return filterHasConcreteValue(filter);
    return false;
  });
}

function filterTargetsTerms(filter: PreflightFilter, terms: string[]): boolean {
  const tokens = tokenSet([
    filter.field,
    filter.label
  ].filter(Boolean).join(' '));
  if (tokens.size === 0) return false;
  return terms.some(term => tokenSetsOverlap(tokens, tokenSet(term)));
}

function filterHasConcreteValue(filter: PreflightFilter): boolean {
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

function questionRequestsPaymentGrouping(question: string): boolean {
  const tokens = tokenSet(question);
  if (!(tokens.has('payment') || tokens.has('tender'))) return false;
  return tokens.has('method')
    || tokens.has('type')
    || tokens.has('mix')
    || tokens.has('breakdown')
    || tokens.has('split')
    || tokens.has('versus')
    || tokens.has('vs')
    || tokens.has('highest')
    || tokens.has('top')
    || tokens.has('strongest')
    || tokens.has('best')
    || tokens.has('produced');
}

function questionRequestsPaymentFamilyGrouping(question: string, filters: PreflightFilter[]): boolean {
  const tokens = tokenSet(question);
  if (tokens.has('family') && (tokens.has('payment') || tokens.has('tender'))) return true;
  if (paymentFamilyComparisonTokens(tokens)) return true;
  return filters.some(paymentFamilyComparisonFilter);
}

function paymentFamilyComparisonFilter(filter: PreflightFilter): boolean {
  const tokens = tokenSet([
    filter.searchText,
    ...textValues(filter.value)
  ].join(' '));
  return paymentFamilyComparisonTokens(tokens);
}

function paymentFamilyComparisonTokens(tokens: Set<string>): boolean {
  if (tokens.size === 0) return false;
  const hasCashFamily = tokens.has('cash');
  const hasCardFamily = tokens.has('card')
    || tokens.has('credit')
    || tokens.has('debit')
    || tokens.has('eftpos');
  return hasCashFamily && hasCardFamily;
}

function questionRequestsProductGrouping(question: string): boolean {
  const tokens = tokenSet(question);
  if (!(tokens.has('product') || tokens.has('products') || tokens.has('item') || tokens.has('items'))) {
    return false;
  }
  return tokens.has('which')
    || tokens.has('what')
    || tokens.has('top')
    || tokens.has('highest')
    || tokens.has('strongest')
    || tokens.has('best')
    || tokens.has('improving')
    || tokens.has('declining')
    || tokens.has('drop');
}

function groupByTermCoveredByFilter(term: string, filters: Record<string, unknown>[]): boolean {
  const termTokens = tokenSet(term);
  if (termTokens.size === 0) return false;
  return filters.some(filter => tokenSetsOverlap(termTokens, filterEvidenceTokens(filter)));
}

function filterEvidenceTokens(filter: Record<string, unknown>): Set<string> {
  const values = [
    readString(filter.field),
    readString(filter.label),
    readString(filter.requestedText),
    ...textValues(filter.value),
    ...textValues(filter.values),
    ...textValues(isRecord(filter.resolution) ? filter.resolution.values : undefined)
  ].filter((value): value is string => Boolean(value));
  return tokenSet(values.join(' '));
}

function textValues(value: unknown): string[] {
  const direct = readString(value);
  if (direct) return [direct];
  if (Array.isArray(value)) return value.flatMap(textValues);
  return [];
}

async function resolvePreflightFilter(
  options: AnalyzerCapabilityResolveOptions,
  table: TableDefinition,
  filter: PreflightFilter,
  derivedParameterValues: Record<string, unknown> = {},
  requestedMeasures: AnalyzerCapabilityField[] = [],
  operation: AnalyzerCapabilityOperation = 'list'
): Promise<
  | { filter: Record<string, unknown>; supported: true }
  | { reason: string; supported: false }
> {
  const rawSource = findDataSource(options.request.dataSourceId);
  const source = rawSource && options.accessPolicy ? scopedDataSourceForRead(rawSource, options.accessPolicy) : rawSource;
  if (!source) return { supported: false, reason: 'Data source unavailable.' };
  const manifest = buildAnalyzerCapabilityManifest(source, table);
  const lookupParameterValues = {
    ...analyzerParameterValuesForQuestion(table, options.request.question),
    ...derivedParameterValues
  };
  const scopeParameterValues = parameterValuesForScopeFilter(
    table,
    filter,
    lookupParameterValues
  );
  const dateParameterValues = parameterValuesForDateRangeFilter(table, filter, options.request.question);
  if (dateParameterValues && datePreflightFilter(filter)) {
    return {
      supported: true,
      filter: {
        parameterValues: dateParameterValues,
        source: 'model_parameters'
      }
    };
  }
  if (numericScopeIdentifierFilter(filter) && Object.keys(scopeParameterValues).length > 0) {
    return {
      supported: true,
      filter: {
        parameterValues: scopeParameterValues,
        source: 'model_parameters'
      }
    };
  }
  if (filterEncodedByAnalyzerModelScope(table, filter)) {
    return {
      supported: true,
      filter: {
        label: filter.label ?? filter.field ?? filter.searchText,
        source: 'model_scope'
      }
    };
  }
  const outputReferenceFields = [
    ...manifest.filterableFields,
    ...manifest.groupableFields,
    ...manifest.measures
  ];
  const outputField = [filter.field, filter.label, filter.searchText]
    .filter((value): value is string => Boolean(value))
    .map(term => resolveRequestedCapabilityField(outputReferenceFields, term))
    .find((field): field is AnalyzerCapabilityField => Boolean(field));
  if (outputField && requestedOutputFieldReferenceFilter(
    outputField,
    filter,
    options.request.question,
    requestedMeasures
  )) {
    return {
      supported: true,
      filter: { field: outputField.name, source: 'semantic_hint' }
    };
  }
  const fields = selectFilterFields(table, manifest.filterableFields, filter);
  const measureHint = measureHintFilter(manifest.measures, filter);
  const thresholdMeasureHint = thresholdConceptTerms(filter)
    .map(term => term ? resolveRequestedCapabilityField(manifest.measures, term) : null)
    .find((field): field is AnalyzerCapabilityField => Boolean(field)) ?? null;
  const encodedThreshold = requestedMeasures.some(measure =>
    thresholdEncodedByMeasure(measure, thresholdMeasureHint, filter)
  );
  if (encodedThreshold || (measureHint && (
    measureHintCanClaimFilter(fields, filter, measureHint)
    || repeatedMeasureReferenceFilter(measureHint, filter)
    || comparedRequestedMeasureReferenceFilter(
      measureHint,
      filter,
      requestedMeasures.map(measure => measure.name),
      operation,
      options.request.question
    )
  ))) {
    return {
      supported: true,
      filter: {
        field: (measureHint ?? thresholdMeasureHint)?.name,
        source: 'measure_hint'
      }
    };
  }
  if (genericMetricHintFilter(filter) && fields.length === 0) {
    return {
      supported: true,
      filter: {
        label: filter.label ?? filter.field ?? filter.searchText,
        source: 'measure_hint'
      }
    };
  }
  if (fields.length === 0) {
    if (dateParameterValues) {
      return {
        supported: true,
        filter: {
          parameterValues: dateParameterValues,
          source: 'model_parameters'
        }
      };
    }
    const filterParameterValues = parameterValuesFromPreflightFilters(
      table,
      manifest.filterableFields,
      [filter],
      options.request.question
    );
    const modelParameterValues = Object.keys(scopeParameterValues).length > 0
      ? {
          ...filterParameterValues,
          ...scopeParameterValues
        }
      : filterParameterValues;
    if (Object.keys(modelParameterValues).length > 0) {
      return {
        supported: true,
        filter: {
          parameterValues: modelParameterValues,
          source: 'model_parameters'
        }
      };
    }
    if (semanticHintFilter(filter)) {
      return {
        supported: true,
        filter: {
          label: filter.label ?? filter.field,
          source: 'semantic_hint'
        }
      };
    }
    return {
      supported: false,
      reason: `No AI-ready filter field supports ${filter.field ?? filter.label ?? 'requested filter'}.`
    };
  }
  const unsupportedReasons: string[] = [];
  for (const field of fields) {
    const result = await resolvePreflightFilterWithField(
      options,
      table,
      field,
      filter,
      lookupParameterValues
    );
    if (result.supported) return result;
    unsupportedReasons.push(result.reason);
  }
  if (Object.keys(scopeParameterValues).length > 0) {
    return {
      supported: true,
      filter: {
        parameterValues: scopeParameterValues,
        source: 'model_parameters'
      }
    };
  }
  return {
    supported: false,
    reason: uniqueStrings(unsupportedReasons).join(' ')
      || `No AI-ready filter field supports ${filter.field ?? filter.label ?? 'requested filter'}.`
  };
}

async function resolvePreflightFilterWithField(
  options: AnalyzerCapabilityResolveOptions,
  table: TableDefinition,
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number],
  filter: PreflightFilter,
  lookupParameterValues: Record<string, unknown>
): Promise<
  | { filter: Record<string, unknown>; supported: true }
  | { reason: string; supported: false }
> {
  const tableField = table.fields.find(item => item.name === field.name);
  const effectiveFilter = booleanConditionFilter(table, field, filter);
  const operator = supportedOperator(field.operators, effectiveFilter, field.type);
  if (!operator) {
    return {
      supported: false,
      reason: `The AI-ready field ${field.name} does not support the requested filter operator.`
    };
  }

  const directValue = effectiveFilter.value;
  const searchTexts = lookupSearchTexts(effectiveFilter);
  const searchText = searchTexts[0];
  if (!filterCompatibleWithField(field, effectiveFilter)) {
    return {
      supported: false,
      reason: `The AI-ready field ${field.name} does not support the requested text value.`
    };
  }
  const paymentFamilyValues = canonicalPaymentFamilyFilterValues(table, field, effectiveFilter, searchTexts);
  if (paymentFamilyValues) {
    return {
      supported: true,
      filter: {
        field: field.name,
        operator: 'in',
        value: paymentFamilyValues,
        requestedText: searchTexts.join(', '),
        ...(searchTexts.length > 1 ? { requestedTexts: searchTexts } : {})
      }
    };
  }
  if (tableField && searchTexts.length > 0 && stringLikeField(field.type)) {
    const resolution = fieldValueResolutionForTable(table, tableField);
    if (resolution.mode === 'lookup' || resolution.mode === 'catalog') {
      const resolvedValues = await Promise.all(searchTexts.map(item => resolveAnalyzerFieldValues(options.request.dataSourceId, {
        field: field.name,
        searchText: item,
        tableId: table.id,
        tableName: table.name
      }, {
        ...(options.accessPolicy ? { accessPolicy: options.accessPolicy } : {}),
        ...runtimeParameterValuesOption(options.body, lookupParameterValues),
        question: options.request.question
      })));
      const failedIndex = resolvedValues.findIndex(resolved =>
        resolved.success !== true || !Array.isArray(resolved.matches) || resolved.matches.length === 0
      );
      if (failedIndex >= 0) {
        const failedSearchText = searchTexts[failedIndex] ?? searchTexts[0] ?? '';
        const resolved = resolvedValues[failedIndex];
        const fallback = searchTexts.length === 1
          ? unresolvedTextLookupFallbackFilter(field, resolution, failedSearchText, resolved, table)
          : null;
        if (fallback) return fallback;
        return {
          supported: false,
          reason: `The configured lookup for ${field.name} did not resolve ${failedSearchText}.`
        };
      }
      const resolvedMatchValues = uniqueStrings(resolvedValues.flatMap(resolved => Array.isArray(resolved.matches) ? resolved.matches : [])
        .map(match => isRecord(match) ? readString(match.value) : null)
        .filter((value): value is string => Boolean(value)));
      const values = narrowAnalyzerModelScopeValues(
        table,
        field.name,
        resolvedMatchValues,
        options.request.question
      );
      if (values.length === 0) {
        return {
          supported: false,
          reason: `The configured lookup for ${field.name} did not return usable values.`
        };
      }
      const resolvedOperator = lookupOperatorForResolvedValues(field, values);
      if (!resolvedOperator) {
        return {
          supported: false,
          reason: `The AI-ready field ${field.name} does not support multiple resolved lookup values.`
        };
      }
      const resolvedParameterValues = parameterValuesFromResolvedLookup(
        table,
        field.name,
        values
      );
      return {
        supported: true,
        filter: {
          field: field.name,
          operator: resolvedOperator,
          value: values.length === 1 ? values[0] : values,
          requestedText: searchTexts.join(', '),
          ...(searchTexts.length > 1 ? { requestedTexts: searchTexts } : {}),
          resolution: {
            field: field.name,
            mode: resolution.mode,
            source: uniqueStrings(resolvedValues.map(resolved => readString(resolved.source)).filter((value): value is string => Boolean(value))).join(','),
            values,
            ...(Object.keys(resolvedParameterValues).length > 0 ? { parameterValues: resolvedParameterValues } : {})
          }
        }
      };
    }
    const directTextValue = directStringFilterValue(field, operator, searchTexts);
    if (directTextValue !== undefined) {
      return {
        supported: true,
        filter: {
          field: field.name,
          operator: Array.isArray(directTextValue) ? 'in' : operator,
          value: directTextValue,
          requestedText: searchTexts.join(', '),
          ...(searchTexts.length > 1 ? { requestedTexts: searchTexts } : {})
        }
      };
    }
  }

  return {
    supported: true,
    filter: {
      field: field.name,
      operator,
      ...(directValue === undefined ? {} : { value: normalizeDirectFilterValue(field.type, directValue) })
    }
  };
}

function canonicalPaymentFamilyFilterValues(
  table: TableDefinition,
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number],
  filter: PreflightFilter,
  searchTexts: string[]
): string[] | null {
  if (!paymentFamilyComparisonFilter(filter)) return null;
  if (!paymentFamilyLikeField(table, field)) return null;
  const tokens = tokenSet(searchTexts.join(' '));
  const values: string[] = [];
  if (tokens.has('cash')) values.push('Cash');
  if (tokens.has('card') || tokens.has('credit') || tokens.has('debit') || tokens.has('eftpos')) values.push('Card');
  return values.length >= 2 ? values : null;
}

function paymentFamilyLikeField(
  table: TableDefinition,
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number]
): boolean {
  const metadata = analyzerFieldMetadata(table, field.name);
  const tokens = tokenSet([
    field.name,
    field.label,
    ...metadataFieldTerms(field),
    readString(metadata.businessName),
    readString(metadata.label),
    readString(metadata.semanticRole),
    readString(metadata.filterRole),
    readString(metadata.valueResolutionRole),
    ...readStringArray(metadata.synonyms),
    ...readStringArray(metadata.aliases)
  ].filter((value): value is string => Boolean(value)).join(' '));
  if (tokens.size === 0) return false;
  const familyLike = tokens.has('family') || field.name.trim().toLowerCase().includes('family');
  const paymentLike = tokens.has('payment') || tokens.has('tender') || tokens.has('cash') || tokens.has('card');
  return familyLike && paymentLike;
}

function directStringFilterValue(
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number],
  operator: AnalyzerCapabilityFilterOperator,
  searchTexts: string[]
): string | string[] | undefined {
  const values = uniqueStrings(searchTexts.map(value => value.trim()).filter(Boolean));
  if (values.length === 0) return undefined;
  if (values.length === 1) {
    return operator === 'contains' ? values[0] : values[0];
  }
  if (field.operators.includes('in')) return values;
  if (operator === 'contains') return values.join(' ');
  return undefined;
}

function measureHintFilter(
  measures: AnalyzerCapabilityField[],
  filter: PreflightFilter
): AnalyzerCapabilityField | null {
  const genericMetricHint = genericMetricHintFilter(filter);
  const terms = uniqueStrings([
    filter.searchText,
    ...textValues(filter.value),
    ...(genericMetricHint ? [] : metricLikeFilterTerms(filter))
  ].filter((value): value is string => Boolean(value)));
  for (const term of terms) {
    const field = resolveRequestedCapabilityField(measures, term);
    if (field) return field;
  }
  return null;
}

function measureHintCanClaimFilter(
  fields: AnalyzerCapabilityField[],
  filter: PreflightFilter,
  measureHint: AnalyzerCapabilityField
): boolean {
  if (filterHasConcreteValue(filter) && !genericMetricHintFilter(filter)) return false;
  if (fields.length === 0 || fields.every(field => field.role === 'measure')) return true;
  return filter.value === undefined
    && !filter.searchText
    && fields.some(field => field.name === measureHint.name);
}

function metricLikeFilterTerms(filter: PreflightFilter): string[] {
  const terms = [filter.label, filter.field].filter((value): value is string => Boolean(value));
  return terms.filter(term => {
    const tokens = tokenSet(term);
    if (tokens.size === 0) return false;
    return !genericMetricTermTokens(tokens);
  });
}

function genericMetricHintFilter(filter: PreflightFilter): boolean {
  if (!operatorAllowsMetricHint(filter.operator)) return false;
  const terms = [filter.label, filter.field].filter((value): value is string => Boolean(value));
  return terms.some(term => {
    const tokens = tokenSet(term);
    return tokens.size > 0 && genericMetricTermTokens(tokens);
  });
}

function operatorAllowsMetricHint(operator: string | undefined): boolean {
  const normalized = operator?.trim().toLowerCase();
  return !normalized || ['equals', 'equal', 'is', 'in', 'contains'].includes(normalized);
}

function genericMetricTermTokens(tokens: Set<string>): boolean {
  return setIsSubset(tokens, new Set(['metric', 'measure', 'value', 'comparison', 'compare', 'ratio']));
}

function semanticHintFilter(filter: PreflightFilter): boolean {
  return !filter.operator
    && !filter.searchText
    && filter.value === undefined
    && Boolean(filter.label ?? filter.field);
}

function lookupSearchTexts(filter: PreflightFilter): string[] {
  if (Array.isArray(filter.value)) {
    return uniqueStrings(filter.value
      .map(item => primitiveSearchText(item))
      .filter((value): value is string => Boolean(value)));
  }
  const searchText = filter.searchText ?? primitiveSearchText(filter.value);
  if (!searchText) return [];
  return splitLookupSearchText(searchText);
}

function splitLookupSearchText(searchText: string): string[] {
  const normalized = searchText
    .replace(/\bversus\b/gi, ',')
    .replace(/\bvs\b/gi, ',')
    .replace(/[\/|]/g, ',');
  const parts = uniqueStrings(normalized
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));
  return parts.length >= 2 ? parts : [searchText];
}

function lookupOperatorForResolvedValues(
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number],
  values: string[]
): AnalyzerCapabilityFilterOperator | null {
  if (values.length === 1 && field.operators.includes('equals')) return 'equals';
  return field.operators.includes('in') ? 'in' : null;
}

function normalizeDirectFilterValue(fieldType: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => normalizeDirectFilterValue(fieldType, item));
  if (numericFilterType(fieldType) && typeof value === 'string') {
    const parsed = parseBusinessNumericText(value);
    if (parsed !== null) return parsed;
  }
  return value;
}

function numericFilterType(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [
    'bigint',
    'decimal',
    'double',
    'float',
    'int',
    'integer',
    'number',
    'numeric',
    'real',
    'smallint'
  ].some(term => normalized === term || normalized.includes(term));
}

function booleanConditionFilter(
  table: TableDefinition,
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number],
  filter: PreflightFilter
): PreflightFilter {
  if (!booleanConditionField(table, field)) return filter;
  const direct = booleanFilterValue(filter.value);
  if (direct !== null) return { ...filter, operator: 'equals', value: direct };
  const operator = filter.operator ? supportedOperator(field.operators, filter, field.type) : null;
  if (operator === 'is_null' || operator === 'is_not_null') return filter;
  const searchText = filter.searchText ?? primitiveSearchText(filter.value) ?? filter.label ?? filter.field;
  if (!searchText) return filter;
  const value = booleanConditionValueFromMetadata(table, field.name, searchText);
  return value === null ? filter : { ...filter, operator: 'equals', value, searchText };
}

function booleanFilterValue(value: unknown): 0 | 1 | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 0) return 0;
    if (value === 1) return 1;
  }
  if (typeof value !== 'string') return null;
  const tokens = tokenSet(value);
  if (tokens.has('true') || tokens.has('yes') || tokens.has('present') || tokens.has('exists') || tokens.has('flagged')) {
    return 1;
  }
  if (tokens.has('false') || tokens.has('no') || tokens.has('without')) return 0;
  return null;
}

function booleanConditionValueFromMetadata(table: TableDefinition, fieldName: string, searchText: string): 0 | 1 | null {
  const searchTokens = tokenSet(searchText);
  if (searchTokens.size === 0) return null;
  const metadata = analyzerFieldMetadata(table, fieldName);
  for (const concept of booleanValueConcepts(metadata)) {
    if (!tokenSetsOverlap(searchTokens, tokenSet(concept.text))) continue;
    return concept.value;
  }
  const field = table.fields.find(item => item.name === fieldName);
  if (field) {
    const fieldTerms = fieldTermsFromDefinition(field);
    if (fieldTerms.some(term => tokenSetsOverlap(searchTokens, tokenSet(term)))) return 1;
  }
  return null;
}

function booleanConditionField(
  table: TableDefinition,
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number]
): boolean {
  if (booleanFieldType(field.type)) return true;
  const metadata = analyzerFieldMetadata(table, field.name);
  const valueConcepts = booleanValueConcepts(metadata);
  if (valueConcepts.length === 0) return false;
  const role = readString(metadata.valueResolutionRole)
    ?? readString(metadata.filterRole)
    ?? readString(metadata.plannerFilterRole)
    ?? readString(metadata.semanticRole);
  if (['condition', 'flag', 'boolean'].includes(role?.trim().toLowerCase() ?? '')) return true;
  return metadata.filterOnly === true
    || readString(metadata.filterOnly)?.trim().toLowerCase() === 'true';
}

function fieldTermsFromDefinition(field: TableDefinition['fields'][number]): string[] {
  return uniqueStrings([
    field.name,
    field.label ?? '',
    ...(field.synonyms ?? [])
  ].filter(Boolean));
}

function booleanValueConcepts(metadata: Record<string, unknown>): Array<{ text: string; value: 0 | 1 }> {
  const concepts = metadata.valueConcepts;
  if (!Array.isArray(concepts)) return [];
  const result: Array<{ text: string; value: 0 | 1 }> = [];
  for (const concept of concepts) {
    if (!isRecord(concept)) continue;
    const value = firstBooleanConceptValue(concept.values);
    if (value === null) continue;
    for (const text of [
      readString(concept.conceptKey),
      readString(concept.key),
      readString(concept.label),
      ...readStringArray(concept.synonyms),
      ...readStringArray(concept.aliases)
    ]) {
      if (text) result.push({ text, value });
    }
  }
  return result;
}

function firstBooleanConceptValue(value: unknown): 0 | 1 | null {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    const parsed = booleanFilterValue(item);
    if (parsed !== null) return parsed;
  }
  return null;
}

function booleanFieldType(value: string): boolean {
  return ['bit', 'bool', 'boolean'].includes(value.trim().toLowerCase());
}

function unresolvedTextLookupFallbackFilter(
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number],
  resolution: ReturnType<typeof fieldValueResolutionForTable>,
  searchText: string,
  lookupResult?: Record<string, unknown>,
  table?: TableDefinition
): { filter: Record<string, unknown>; supported: true } | null {
  if (resolution.mode !== 'lookup') return null;
  const policy = table ? unresolvedValuePolicy(table, field.name) : null;
  if (resolution.lookup && !policy) return null;
  if (resolution.entityType === 'payment_method') return null;
  const operator = unresolvedTextLookupFallbackOperator(field, resolution.entityType, table);
  if (!operator) return null;
  return {
    supported: true,
    filter: {
      field: field.name,
      operator,
      value: unresolvedTextLookupFallbackValue(searchText, resolution.entityType, operator),
      requestedText: searchText,
      resolution: {
        field: field.name,
        mode: resolution.mode,
        source: readString(lookupResult?.source) ?? 'unresolved_text_filter',
        values: [searchText]
      }
    }
  };
}

function unresolvedTextLookupFallbackValue(
  searchText: string,
  _entityType: string | undefined,
  _operator: AnalyzerCapabilityFilterOperator
): string {
  return searchText;
}

function unresolvedTextLookupFallbackOperator(
  field: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number],
  _entityType: string | undefined,
  table?: TableDefinition
): AnalyzerCapabilityFilterOperator | null {
  const policy = table ? unresolvedValuePolicy(table, field.name) : null;
  if (policy === 'allow_contains') {
    if (field.operators.includes('contains')) return 'contains';
    return field.operators.includes('equals') ? 'equals' : null;
  }
  if (policy === 'allow_exact') {
    return field.operators.includes('equals') ? 'equals' : null;
  }
  return null;
}

function datePreflightFilter(filter: PreflightFilter): boolean {
  if (Array.isArray(filter.value) && filter.value.every(dateLikeFilterValue)) return true;
  const value = typeof filter.value === 'string' ? filter.value : '';
  if (value && explicitDateRangeSelectionForText(value)) return true;
  const label = filter.label ?? filter.field ?? '';
  return dateFilterLabel(label);
}

function unresolvedValuePolicy(table: TableDefinition, fieldName: string): string | null {
  const metadata = analyzerFieldMetadata(table, fieldName);
  return readString(metadata.unresolvedValuePolicy ?? metadata.unresolvedLookupPolicy)?.trim().toLowerCase() ?? null;
}

function readOperation(value: unknown): AnalyzerCapabilityOperation {
  return value === 'aggregate'
    || value === 'top_n'
    || value === 'trend'
    || value === 'compare'
    || value === 'bucket'
    ? value
    : 'list';
}

function readPreflightLimit(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 4;
  return Math.min(Math.max(parsed, 1), MAX_PREFLIGHT_MODELS);
}

function readPreflightGroupBy(value: unknown, fallback: string[] = []): string[] {
  const parsed = readStringArray(value);
  return parsed.length > 0 ? parsed : fallback;
}

function resolveRequestedCapabilityFields(
  fields: AnalyzerCapabilityField[],
  requestedTerms: string[]
): Array<{ field: AnalyzerCapabilityField | null; term: string }> {
  return uniqueStrings(requestedTerms)
    .map(term => term.trim())
    .filter(term => term.length > 0)
    .map(term => ({
      field: resolveRequestedCapabilityField(fields, term),
      term
    }));
}

function resolveRequestedGroupByFields(
  fields: AnalyzerCapabilityField[],
  requestedTerms: string[]
): Array<{ field: AnalyzerCapabilityField | null; term: string }> {
  return uniqueStrings(requestedTerms).map(term => ({
    field: analyzerBusinessScopeGroupTerm(term)
      ? fields.find(field => metadataFieldTerms(field).some(candidate =>
          analyzerBusinessScopeFieldIdentityMatches(candidate, term)
        )) ?? null
      : resolveRequestedCapabilityField(fields, term),
    term
  }));
}

function resolveRequestedCapabilityField(
  fields: AnalyzerCapabilityField[],
  requestedTerm: string,
  context?: {
    filters?: PreflightFilter[];
    groupBy?: string[];
    question?: string;
  },
  exact = false
): AnalyzerCapabilityField | null {
  const requestedTokens = tokenSet(requestedTerm);
  if (requestedTokens.size === 0) return null;
  if (exact) {
    return fields.find(field => metadataFieldTerms(field).some(term =>
      tokenSetsEqual(tokenSet(term), requestedTokens)
    )) ?? null;
  }
  const preferred = preferredCapabilityMeasureField(fields, requestedTokens, context);
  if (preferred) return preferred;
  const scored = fields
    .map(field => ({
      field,
      score: requestedCapabilityFieldScore(field, requestedTokens)
    }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score);
  return scored[0]?.field ?? null;
}

function tokenSetsEqual(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && setIsSubset(left, right);
}

function preferredCapabilityMeasureField(
  fields: AnalyzerCapabilityField[],
  requestedTokens: Set<string>,
  context?: {
    filters?: PreflightFilter[];
    groupBy?: string[];
    question?: string;
  }
): AnalyzerCapabilityField | null {
  if (!context) return null;
  if (!genericSalesOrRevenueMeasure(requestedTokens)) return null;
  if (!paymentContextRequested(context)) return null;
  return fields.find(field => paymentBasisMeasureField(field)) ?? null;
}

function genericSalesOrRevenueMeasure(tokens: Set<string>): boolean {
  if (tokens.size === 0) return false;
  if (tokens.has('gross') || tokens.has('net') || tokens.has('paid') || tokens.has('amount') || tokens.has('tax')) {
    return false;
  }
  return tokens.has('sales') || tokens.has('sale') || tokens.has('revenue') || tokens.has('takings');
}

function paymentContextRequested(context: {
  filters?: PreflightFilter[];
  groupBy?: string[];
  question?: string;
}): boolean {
  const groupBy = Array.isArray(context.groupBy) ? context.groupBy : [];
  const filters = Array.isArray(context.filters) ? context.filters : [];
  if (groupByAlreadyRequested(groupBy, ['payment', 'method', 'type', 'tender'])) return true;
  if (filters.some(filter => filterTargetsTerms(filter, ['payment', 'method', 'type', 'tender', 'cash', 'card', 'eftpos']))) {
    return true;
  }
  const tokens = tokenSet(context.question ?? '');
  return tokens.has('payment')
    || tokens.has('tender')
    || tokens.has('cash')
    || tokens.has('card')
    || tokens.has('credit')
    || tokens.has('eftpos')
    || tokens.has('visa')
    || tokens.has('mastercard')
    || tokens.has('amex');
}

function paymentBasisMeasureField(field: AnalyzerCapabilityField): boolean {
  if (field.name === 'paid_total' || field.name === 'payment_amount') return true;
  const tokens = tokenSet(metadataFieldTerms(field).join(' '));
  return (tokens.has('paid') && tokens.has('total'))
    || (tokens.has('payment') && tokens.has('amount'));
}

function requestedCapabilityFieldScore(
  field: AnalyzerCapabilityField,
  requestedTokens: Set<string>
): number {
  return metadataFieldTerms(field).reduce((best, term) => {
    const fieldTokens = tokenSet(term);
    if (fieldTokens.size === 0) return best;
    let matches = 0;
    for (const token of requestedTokens) {
      if (fieldTokens.has(token)) matches += 1;
    }
    for (const token of fieldTokens) {
      if (requestedTokens.has(token)) matches += 1;
    }
    return Math.max(best, matches / Math.max(fieldTokens.size, requestedTokens.size));
  }, 0);
}

function runtimeParameterValuesOption(
  body: unknown,
  derivedParameterValues: Record<string, unknown> = {}
): { parameterValues?: Record<string, unknown> } {
  if (!isRecord(body)) {
    return Object.keys(derivedParameterValues).length > 0 ? { parameterValues: derivedParameterValues } : {};
  }
  const values = {
    ...derivedParameterValues,
    ...readParameterValues(body.accessContext),
    ...readParameterValues(body.runtimeParameterValues),
    ...readParameterValues(body.parameterValues)
  };
  return Object.keys(values).length > 0 ? { parameterValues: values } : {};
}

function parameterValuesFromPreflightFilters(
  table: TableDefinition,
  fields: ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'],
  filters: PreflightFilter[],
  question: string
): Record<string, unknown> {
  const definitions = analyzerParameterDefinitionsForTable(table);
  if (definitions.length === 0 || filters.length === 0) return {};
  const values: Record<string, unknown> = {};
  for (const filter of filters) {
    Object.assign(values, parameterValuesForDateRangeFilter(table, filter, question) ?? {});
  }
  for (const definition of definitions) {
    const parameterTokens = tokenSet(definition.name);
    if (parameterTokens.size === 0) continue;
    const matchingFilter = filters.find(filter => {
      if (filter.value === undefined || Array.isArray(filter.value)) return false;
      const selectedFields = selectFilterFields(table, fields, filter);
      const filterMatchesLocationField = selectedFields.some(field => capabilityFieldHasLocationScope(field));
      if (parameterMatchesFilter(definition.name, filter, definitions, filterMatchesLocationField)) return true;
      return selectedFields.some(field =>
        metadataFieldTerms(field).some(term => tokenSetsOverlap(parameterTokens, tokenSet(term)))
      );
    });
    if (
      matchingFilter?.value !== undefined
      && parameterValueCompatibleWithDefinition(definition, matchingFilter.value)
    ) {
      values[definition.name] = matchingFilter.value;
    }
  }
  return values;
}

function parameterValuesForScopeFilter(
  table: TableDefinition,
  filter: PreflightFilter,
  parameterValues: Record<string, unknown>
): Record<string, unknown> {
  const filterTokens = tokenSet([
    filter.field,
    filter.label,
    filter.searchText
  ].filter(Boolean).join(' '));
  if (!organizationScopeFilterTokens(filterTokens) && !locationScopeFilterTokens(filterTokens)) return {};
  const definitions = analyzerParameterDefinitionsForTable(table);
  const values: Record<string, unknown> = {};
  for (const definition of definitions) {
    if (!organizationScopeParameterName(definition.name) && !locationScopeParameterName(definition.name)) continue;
    if (parameterValues[definition.name] === undefined) continue;
    values[definition.name] = parameterValues[definition.name];
  }
  return values;
}

function numericScopeIdentifierFilter(filter: PreflightFilter): boolean {
  const searchText = filter.searchText ?? primitiveSearchText(filter.value);
  if (!searchText || !digitsOnlyFilterValue(searchText)) return false;
  const filterTokens = tokenSet([
    filter.field,
    filter.label
  ].filter(Boolean).join(' '));
  if (!filterTokens.has('id')) return false;
  return organizationScopeFilterTokens(filterTokens) || locationScopeFilterTokens(filterTokens);
}

function digitsOnlyFilterValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  for (const character of trimmed) {
    if (character < '0' || character > '9') return false;
  }
  return true;
}

function parameterValuesFromResolvedLookup(
  table: TableDefinition,
  fieldName: string,
  values: string[]
): Record<string, unknown> {
  const scopeValues = parameterValuesFromResolvedScopeLookup(table, fieldName, values);
  const resolvedValues = uniqueStrings(values
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value)));
  if (resolvedValues.length !== 1) return scopeValues;
  const value = resolvedValues[0];
  if (value === undefined) return scopeValues;
  const fieldToken = normalizedParameterToken(fieldName);
  const fieldParameterValues = Object.fromEntries(analyzerParameterDefinitionsForTable(table)
    .filter(definition => normalizedParameterToken(definition.name) === fieldToken)
    .filter(definition => !organizationScopeParameterName(definition.name) && !locationScopeParameterName(definition.name))
    .filter(definition => parameterValueCompatibleWithDefinition(definition, value))
    .map(definition => [definition.name, value]));
  return { ...fieldParameterValues, ...scopeValues };
}

function parameterValuesFromResolvedScopeLookup(
  table: TableDefinition,
  fieldName: string,
  values: string[]
): Record<string, unknown> {
  const fieldTokens = tokenSet(fieldName);
  const scopeKind = locationScopeFilterTokens(fieldTokens)
    ? 'location'
    : organizationScopeFilterTokens(fieldTokens)
      ? 'organization'
      : null;
  if (!scopeKind) return {};
  const resolvedValues = uniqueStrings(values
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value) && /^\d+$/.test(value)));
  if (resolvedValues.length === 0) return {};

  const definitions = analyzerParameterDefinitionsForTable(table);
  const matchingDefinitions = definitions.filter(definition =>
    scopeKind === 'location'
      ? locationScopeParameterName(definition.name)
      : organizationScopeParameterName(definition.name)
  );
  const fallbackOrganizationDefinitions = scopeKind === 'location' && matchingDefinitions.length === 0
    ? definitions.filter(definition => organizationScopeParameterName(definition.name))
    : [];
  const targetDefinitions = matchingDefinitions.length > 0 ? matchingDefinitions : fallbackOrganizationDefinitions;
  if (targetDefinitions.length === 0) return {};

  const parameterValue = resolvedValues.length === 1 ? resolvedValues[0] : resolvedValues;
  return Object.fromEntries(targetDefinitions.map(definition => [definition.name, parameterValue]));
}

function parameterValueCompatibleWithDefinition(
  definition: ReturnType<typeof analyzerParameterDefinitionsForTable>[number],
  value: unknown
): boolean {
  const dataType = String(definition.dataType ?? '').trim().toLowerCase();
  if (['number', 'integer', 'int', 'bigint', 'decimal', 'float'].includes(dataType)) {
    return typeof value === 'number' && Number.isFinite(value)
      || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
  }
  if (['date', 'datetime', 'timestamp'].includes(dataType)) {
    return typeof value === 'string' && dateLikeFilterValue(value);
  }
  return true;
}

function parameterMatchesFilter(
  parameterName: string,
  filter: PreflightFilter,
  definitions: ReturnType<typeof analyzerParameterDefinitionsForTable>,
  filterMatchesLocationField = false
): boolean {
  const filterTokens = tokenSet([
    filter.field,
    filter.label
  ].filter(Boolean).join(' '));
  if (filterTokens.size === 0) return false;
  const hasLocationParameter = definitions.some(definition => locationScopeParameterName(definition.name));
  if (organizationScopeParameterName(parameterName)) {
    return organizationScopeFilterTokens(filterTokens)
      || (!hasLocationParameter && !filterMatchesLocationField && locationScopeFilterTokens(filterTokens));
  }
  if (locationScopeParameterName(parameterName)) return locationScopeFilterTokens(filterTokens);
  const parameterTokens = tokenSet(parameterName);
  return tokenSetsOverlap(parameterTokens, filterTokens);
}

function capabilityFieldHasLocationScope(field: AnalyzerCapabilityField): boolean {
  const terms = [
    field.name,
    field.label,
    field.role,
    ...metadataFieldTerms(field)
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const tokens = tokenSet(terms.join(' '));
  return locationScopeFilterTokens(tokens)
    || tokens.has('branchid')
    || tokens.has('locationid')
    || tokens.has('siteid')
    || tokens.has('warehouseid');
}

function organizationScopeParameterName(value: string): boolean {
  const tokens = tokenSet(value);
  return ['account', 'company', 'client', 'business', 'customer', 'organization', 'organisation', 'tenant'].some(token => tokens.has(token))
    || tokens.has('accountid')
    || tokens.has('companyid')
    || tokens.has('clientid')
    || tokens.has('businessid')
    || tokens.has('customerid')
    || tokens.has('organizationid')
    || tokens.has('organisationid')
    || tokens.has('tenantid');
}

function locationScopeParameterName(value: string): boolean {
  const tokens = tokenSet(value);
  return ['branch', 'location', 'site', 'warehouse'].some(token => tokens.has(token))
    || tokens.has('branchid')
    || tokens.has('locationid')
    || tokens.has('siteid')
    || tokens.has('warehouseid');
}

function organizationScopeFilterTokens(tokens: Set<string>): boolean {
  return ['account', 'business', 'client', 'company', 'customer', 'organization', 'organisation', 'tenant'].some(token => tokens.has(token));
}

function locationScopeFilterTokens(tokens: Set<string>): boolean {
  return ['branch', 'location', 'site', 'warehouse'].some(token => tokens.has(token))
    || tokens.has('branchid')
    || tokens.has('locationid')
    || tokens.has('siteid')
    || tokens.has('warehouseid');
}

function parameterValuesForDateRangeFilter(
  table: TableDefinition,
  filter: PreflightFilter,
  question: string
): Record<string, unknown> | null {
  const range = dateRangeFromPreflightFilter(filter, question);
  if (!range) return null;
  const definitions = analyzerParameterDefinitionsForTable(table);
  const pair = dateRangeParameterPair(definitions);
  if (!pair) return null;
  return {
    [pair.start]: range.from,
    [pair.end]: range.to
  };
}

function dateRangeFromPreflightFilter(
  filter: PreflightFilter,
  question: string
): { from: string; to: string } | null {
  if (Array.isArray(filter.value) && filter.value.length === 2 && filter.value.every(dateLikeFilterValue)) {
    return { from: String(filter.value[0]), to: String(filter.value[1]) };
  }
  const valueText = typeof filter.value === 'string' ? filter.value.trim() : '';
  const searchText = filter.searchText?.trim() ?? '';
  const labelText = filter.label?.trim() ?? filter.field?.trim() ?? '';
  const candidates = [
    valueText,
    searchText,
    dateFilterLabel(labelText) ? question : ''
  ].filter(Boolean);
  for (const candidate of candidates) {
    const selection = explicitDateRangeSelectionForText(candidate);
    if (selection) return selection;
  }
  return null;
}

function explicitDateRangeSelectionForText(value: string): { from: string; to: string } | null {
  const selection = analyzerDateRangeSelectionForQuestion(value);
  return selection.defaultedPeriodLabel ? null : selection.range;
}

function dateFilterLabel(value: string): boolean {
  const tokens = tokenSet(value);
  return ['date', 'day', 'week', 'month', 'period', 'range', 'time'].some(token => tokens.has(token));
}

function dateRangeParameterPair(
  definitions: ReturnType<typeof analyzerParameterDefinitionsForTable>
): { end: string; start: string } | null {
  const startByRole = definitions.find(definition => normalizedParameterToken(definition.dateRole) === 'start');
  const endByRole = definitions.find(definition => normalizedParameterToken(definition.dateRole) === 'end');
  if (startByRole && endByRole) return { start: startByRole.name, end: endByRole.name };
  const lookup = new Map(definitions.map(definition => [normalizedParameterToken(definition.name), definition.name]));
  for (const [startAlias, endAlias] of [
    ['from', 'to'],
    ['fromdate', 'todate'],
    ['startdate', 'enddate'],
    ['datefrom', 'dateto']
  ] as const) {
    const start = lookup.get(startAlias);
    const end = lookup.get(endAlias);
    if (start && end) return { start, end };
  }
  return null;
}

function normalizedParameterToken(value: string | undefined): string {
  return String(value ?? '').trim().replace(/[\s_-]+/g, '').toLowerCase();
}

function dateLikeFilterValue(value: unknown): boolean {
  return typeof value === 'string' && value.includes('-') && Number.isFinite(Date.parse(value));
}

function metadataFieldTerms(field: Pick<AnalyzerCapabilityField, 'label' | 'name' | 'synonyms'>): string[] {
  return uniqueStrings([
    field.name,
    field.label ?? '',
    ...field.synonyms
  ].filter(Boolean));
}

function tokenSetsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

function setIsSubset(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (!right.has(token)) return false;
  }
  return true;
}

function tokenSet(value: string): Set<string> {
  return analyzerTokenSet(value);
}
