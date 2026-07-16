import type { AnalyzerPlanRequest } from '../../validation.js';
import type { CodexAgentResult } from '../codex-agent/codex-agent-runtime.js';
import {
  findDataSource,
  type TableDefinition
} from '../data-source/foundation-store.js';
import {
  BUILD_COMPONENT_CONTEXT_FAILURE_REASON,
  buildComponentPlan,
  clarificationPlanFromToolArgs
} from './analyzer-plan-build-component.js';
import { defaultSummarizeForField } from './analyzer-plan-column-summary.js';
import { analyzerFieldIsMeasure } from './analyzer-plan-field-matching.js';
import { analyzerVisibleFields } from './analyzer-plan-field-visibility.js';
import {
  businessNameForTable,
  listDataModelsForAnalyzer
} from './analyzer-plan-schema.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { readParameterValues } from './analyzer-plan-build-component-parameters.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';
import type {
  AnalyzerPlanToolState,
  AnalyzerTurnIntent,
  TrustedDirectSchemaCandidate
} from './analyzer-plan-agent-loop-types.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import { attachAnalyzerPlanTraceMetadata } from './analyzer-plan-agent-loop-trace-metadata.js';
import { normalizePreflightSupportedFilters } from './analyzer-plan-preflight-filter-merge.js';
import {
  readAnalyzerSafeRefusal,
  type AnalyzerSafeRefusalCandidateModel,
  type AnalyzerSafeRefusalInput
} from './analyzer-safe-refusal.js';
import type { AnalyzerCapabilityGapIdentity } from './analyzer-unmapped-concept-log.js';
import {
  normalizeUngroupedAggregateBuildShape,
  normalizeUngroupedAggregatePlanShape
} from './analyzer-plan-preflight-build-shape.js';
import { removeBoundBusinessScopeGroupBy } from './analyzer-plan-preflight-grouping.js';
export function analyzerPlanUnavailableMessage(provider: CodexAgentResult): string {
  if (provider.fallbackReason === 'openai_api_key_not_configured') {
    return 'Analyzer planning requires an OpenAI API key to be configured.';
  }
  if (provider.fallbackReason === 'openai_agent_disabled') {
    return 'Analyzer planning OpenAI agent is disabled.';
  }
  if (provider.fallbackReason === 'openai_request_failed') {
    return 'Analyzer planning OpenAI request failed.';
  }
  if (provider.fallbackReason === 'openai_tool_loop_turn_limit') {
    return 'Analyzer planning reached its tool-call limit before producing a plan.';
  }
  if (provider.fallbackReason === 'gemini_api_key_not_configured') {
    return 'Analyzer planning requires a Gemini API key to be configured.';
  }
  if (provider.fallbackReason === 'gemini_agent_disabled') {
    return 'Analyzer planning Gemini agent is disabled.';
  }
  if (provider.fallbackReason === 'gemini_admin_config_failed') {
    return 'Analyzer planning Gemini configuration failed.';
  }
  if (provider.fallbackReason === 'gemini_request_failed') {
    return 'Analyzer planning Gemini request failed.';
  }
  if (provider.fallbackReason === 'gemini_tool_loop_turn_limit') {
    return 'Analyzer planning reached its tool-call limit before producing a plan.';
  }
  if (provider.fallbackReason === 'codex_oauth_not_configured') {
    return 'Analyzer planning requires Codex OAuth to be connected.';
  }
  if (provider.fallbackReason === 'codex_agent_disabled') {
    return 'Analyzer planning agent is disabled.';
  }
  if (provider.fallbackReason === 'codex_request_failed') {
    return 'Analyzer planning AI request failed.';
  }
  if (provider.fallbackReason === 'codex_tool_loop_turn_limit') {
    return 'Analyzer planning reached its tool-call limit before producing a plan.';
  }
  return 'Analyzer planning agent is unavailable.';
}

export function recoverableBuildComponentResult(
  request: AnalyzerPlanRequest,
  args: Record<string, unknown>,
  state: AnalyzerPlanToolState,
  capabilityGapIdentity?: AnalyzerCapabilityGapIdentity
): AnalyzerActionPlanResponse | Record<string, unknown> {
  const buildArgs = buildComponentArgsWithSelectedSchema(args, state, request.question);
  const plan = normalizeUngroupedAggregatePlanShape(
    buildComponentPlan(request, buildArgsWithGeneratedAction(request, buildArgs), capabilityGapIdentity),
    buildArgs,
    request.question
  );
  attachAnalyzerPlanTraceMetadata(plan, {
    mergedCapabilityFilters: summarizeCapabilityFiltersForTrace(buildArgs)
  });
  if (plan.message !== BUILD_COMPONENT_CONTEXT_FAILURE_REASON) return plan;
  return {
    success: false,
    error: BUILD_COMPONENT_CONTEXT_FAILURE_REASON,
    nextStep: [
      'For greetings, casual chat, acknowledgements, and capability questions, call answer_analyzer_conversation.',
      'For business analysis questions, use retrievalCandidates.directSchemaCandidate when present by calling get_schema directly for that safe candidate; otherwise call list_data_models, then get_schema, then build_component with a create_table action from that schema.'
    ].join(' ')
  };
}

function summarizeCapabilityFiltersForTrace(args: Record<string, unknown>): Array<Record<string, unknown>> {
  const capability = isRecord(args.capability) ? args.capability : {};
  const filters = Array.isArray(capability.filters) ? capability.filters : [];
  return filters
    .filter(isRecord)
    .slice(0, 8)
    .map(filter => {
      const summary: Record<string, unknown> = {};
      const field = readString(filter.field);
      const operator = readString(filter.operator);
      if (field) summary.field = field;
      if (operator) summary.operator = operator;
      if ('value' in filter) summary.valueShape = traceValueShape(filter.value);
      if ('values' in filter) summary.valuesShape = traceValueShape(filter.values);
      return summary;
    })
    .filter(item => Object.keys(item).length > 0);
}

function traceValueShape(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return 'null';
  return typeof value;
}

function buildArgsWithGeneratedAction(
  request: AnalyzerPlanRequest,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (Array.isArray(args.actions) && args.actions.length > 0) return args;
  const table = selectedTableForBuildArgs(request, args);
  if (!table) return args;
  const title = readString(args.title) ?? businessNameForTable(table);
  const parameterValues = readParameterValues(args.parameterValues);
  return {
    ...args,
    actions: [{
      action: 'create_table',
      params: {
        columns: generatedColumnsForCapability(table, args.capability),
        ...(Object.keys(parameterValues).length > 0 ? { parameterValues } : {}),
        title
      }
    }],
    componentType: readString(args.componentType) ?? 'table',
    message: readString(args.message) ?? `I selected ${businessNameForTable(table)} and created an Analyzer result for this question.`,
    mode: readString(args.mode) ?? 'create',
    title
  };
}

function selectedTableForBuildArgs(
  request: AnalyzerPlanRequest,
  args: Record<string, unknown>
): TableDefinition | null {
  const source = findDataSource(request.dataSourceId);
  if (!source) return null;
  const tableId = readString(args.tableId);
  const tableName = readString(args.tableName);
  return source.tables.find(table =>
    Boolean(tableId && table.id === tableId)
    || Boolean(tableName && table.name === tableName)
  ) ?? null;
}

function generatedColumnsForCapability(table: TableDefinition, capabilityValue: unknown): Array<Record<string, unknown>> {
  const capability = isRecord(capabilityValue) ? capabilityValue : {};
  const operation = readString(capability.operation) ?? 'list';
  const groupBy = readStringArray(capability.groupBy);
  const measure = readString(capability.measure);
  const measures = uniqueStrings([...(measure ? [measure] : []), ...readStringArray(capability.measures)]);
  const selectedFields = operation === 'list'
    ? analyzerVisibleFields(table).map(field => field.name)
    : uniqueStrings([...groupBy, ...measures]);
  const fallbackFields = analyzerVisibleFields(table).map(field => field.name);
  const fields = selectedFields.length > 0 ? selectedFields : fallbackFields;
  return fields.flatMap(fieldName => {
    const field = table.fields.find(item => item.name === fieldName);
    if (!field) return [];
    const summarize = operation === 'list' || groupBy.includes(field.name) || !analyzerFieldIsMeasure(table, field)
      ? 'none'
      : defaultSummarizeForField(field);
    return [{ field: field.name, summarize }];
  });
}

export function buildComponentArgsWithSelectedSchema(
  args: Record<string, unknown>,
  state: AnalyzerPlanToolState,
  question = state.requestBreakdown?.query ?? ''
): Record<string, unknown> {
  const hasTableId = Boolean(readString(args.tableId));
  const hasTableName = Boolean(readString(args.tableName));
  const withSelectedSchema = (hasTableId && hasTableName) || (!state.selectedTableId && !state.selectedTableName)
    ? args
    : {
    ...args,
    ...(hasTableId || !state.selectedTableId ? {} : { tableId: state.selectedTableId }),
    ...(hasTableName || !state.selectedTableName ? {} : { tableName: state.selectedTableName })
  };
  return withCapabilityMeasureFromActions(
    withPreflightSupportedFilters(withSelectedSchema, state, question)
  );
}

function withCapabilityMeasureFromActions(args: Record<string, unknown>): Record<string, unknown> {
  const capability = isRecord(args.capability) ? args.capability : null;
  if (!capability) return args;
  const operation = readString(capability.operation)?.trim().toLowerCase();
  if (operation === 'list' || readString(capability.measure) || readStringArray(capability.measures).length > 0) return args;
  const measure = firstMeasureFieldFromActions(args.actions);
  if (!measure) return args;
  return {
    ...args,
    capability: {
      ...capability,
      measure
    }
  };
}

function withPreflightSupportedFilters(
  args: Record<string, unknown>,
  state: AnalyzerPlanToolState,
  question: string
): Record<string, unknown> {
  const modelKey = preflightModelKeyForBuildArgs(args, state);
  if (!modelKey) return args;
  const supported = normalizePreflightSupportedFilters(
    state.preflightSupportedFiltersByModel?.[modelKey] ?? []
  );
  const supportedMeasures = state.preflightSupportedMeasuresByModel?.[modelKey] ?? [];
  const filters = supported.filter(item => readString(item.field) && readString(item.operator));
  const parameterValues = preflightParameterValues(supported);
  const supportedGroupBy = removeBoundBusinessScopeGroupBy(
    state.preflightSupportedGroupByByModel?.[modelKey] ?? [],
    parameterValues,
    question
  );
  const capability = isRecord(args.capability) ? args.capability : {};
  const {
    filters: _unverifiedFilters,
    groupBy: _unverifiedGroupBy,
    limit: _unverifiedLimit,
    measure: _unverifiedMeasure,
    measures: _unverifiedMeasures,
    operation: _unverifiedOperation,
    orderBy: _unverifiedOrderBy,
    ...verifiedCapability
  } = capability;
  const operation = state.preflightOperation
    ?? state.requestBreakdown?.operation
    ?? readString(capability.operation)
    ?? 'list';
  const requestedLimit = state.requestBreakdown?.limit;
  const requestedOrderBy = state.requestBreakdown?.sortBy && Array.isArray(capability.orderBy)
    ? capability.orderBy
    : undefined;
  const nextArgs = {
    ...args,
    ...(Object.keys(parameterValues).length > 0
      ? { parameterValues: { ...readParameterValues(args.parameterValues), ...parameterValues } }
      : {}),
    capability: {
      ...verifiedCapability,
      operation,
      ...(filters.length > 0 ? { filters } : {}),
      ...(supportedGroupBy.length > 0 ? { groupBy: supportedGroupBy } : {}),
      ...(supportedMeasures[0] ? { measure: supportedMeasures[0], measures: supportedMeasures } : {}),
      ...(requestedLimit ? { limit: requestedLimit } : {}),
      ...(requestedOrderBy ? { orderBy: requestedOrderBy } : {})
    }
  };
  return normalizeUngroupedAggregateBuildShape(Object.keys(parameterValues).length > 0
    ? withPreflightParameterValues(nextArgs, parameterValues)
    : nextArgs, question);
}

function preflightModelKeyForBuildArgs(
  args: Record<string, unknown>,
  state: AnalyzerPlanToolState
): string | null {
  const tableIds = [
    readString(args.tableId),
    readString(args.tableName),
    state.selectedTableId,
    state.selectedTableName
  ].filter((value): value is string => Boolean(value));
  for (const tableId of tableIds) {
    if (
      state.preflightModelIds?.includes(tableId)
      || state.preflightModelNames?.includes(tableId)
      || Object.prototype.hasOwnProperty.call(state.preflightSupportedFiltersByModel ?? {}, tableId)
      || Object.prototype.hasOwnProperty.call(state.preflightSupportedGroupByByModel ?? {}, tableId)
      || Object.prototype.hasOwnProperty.call(state.preflightSupportedMeasuresByModel ?? {}, tableId)
    ) return tableId;
  }
  return null;
}

function preflightParameterValues(filters: Array<Record<string, unknown>>): Record<string, unknown> {
  return filters.reduce<Record<string, unknown>>((values, filter) => ({
    ...values,
    ...readParameterValues(filter.parameterValues)
  }), {});
}

function withPreflightParameterValues(
  args: Record<string, unknown>,
  parameterValues: Record<string, unknown>
): Record<string, unknown> {
  if (!Array.isArray(args.actions)) return args;
  return {
    ...args,
    actions: args.actions.map(action => {
      if (!isRecord(action) || action.action !== 'create_table') return action;
      const params = isRecord(action.params) ? action.params : {};
      return {
        ...action,
        params: {
          ...params,
          parameterValues: {
            ...readParameterValues(params.parameterValues),
            ...parameterValues
          }
        }
      };
    })
  };
}

function firstMeasureFieldFromActions(actionsValue: unknown): string | null {
  const actions = Array.isArray(actionsValue) ? actionsValue.filter(isRecord) : [];
  for (const action of actions) {
    if (readString(action.action) !== 'create_table') continue;
    const params = isRecord(action.params) ? action.params : {};
    const columns = Array.isArray(params.columns) ? params.columns.filter(isRecord) : [];
    for (const column of columns) {
      const field = readString(column.field);
      const summarize = readString(column.summarize)?.trim().toLowerCase();
      if (field && summarize && summarize !== 'none') return field;
    }
  }
  return null;
}

export function rememberMatchedModels(state: AnalyzerPlanToolState, result: unknown): void {
  const models = isRecord(result) && Array.isArray(result.models) ? result.models : [];
  state.matchedModelCount = models.length;
  const first = models.find(isRecord);
  const firstId = readString(first?.id);
  const firstName = readString(first?.name);
  if (firstId) state.firstMatchedModelId = firstId;
  else delete state.firstMatchedModelId;
  if (firstName) state.firstMatchedModelName = firstName;
  else delete state.firstMatchedModelName;
}

export function hasAnalyzerModelMatches(request: AnalyzerPlanRequest, accessPolicy?: DataSourceAccessPolicy): boolean {
  const result = listDataModelsForAnalyzer(request.dataSourceId, { limit: 1, query: request.question }, request.question, accessPolicy);
  return isRecord(result) && typeof result.totalMatches === 'number' && result.totalMatches > 0;
}

export function recoverableModelSearchRequiredResult(): Record<string, unknown> {
  return {
    success: false,
    error: 'Analyzer must search AI-ready data models before asking for missing model context.',
    nextStep: 'Use context.retrievalCandidates.directSchemaCandidate if present, otherwise call list_data_models with the business question. If there is no safe match, then call request_data_source_or_model_context.'
  };
}

export function requestBreakdownRequiresCapabilityPreflight(state: AnalyzerPlanToolState): boolean {
  const breakdown = state.requestBreakdown;
  if (!breakdown) return false;
  return breakdown.filters.length > 0
    || breakdown.groupBy.length > 0
    || Boolean(breakdown.measure)
    || breakdown.limit !== undefined
    || Boolean(breakdown.sortBy);
}

export function recoverableCapabilityPreflightRequiredResult(): Record<string, unknown> {
  return {
    success: false,
    error: 'Analyzer must resolve data model capabilities before loading schema for this request.',
    nextStep: 'Call resolve_model_capabilities. It will use the request breakdown to choose eligible models and resolve supported lookup filters.'
  };
}

export function recoverableNoEligibleCapabilitiesResult(): Record<string, unknown> {
  return {
    success: false,
    error: 'No data model supports the requested operation and filters.',
    nextStep: 'Ask a concise clarification or explain that the selected data source does not have a data model for this exact request.'
  };
}

export function noEligibleCapabilitiesClarificationPlan(
  request: AnalyzerPlanRequest,
  rejectedModels: Array<Record<string, unknown>> = []
): AnalyzerActionPlanResponse {
  const strongestRejectedModel = rejectedModels.find(model =>
    readAnalyzerSafeRefusal(model.safeRefusal)
  ) ?? rejectedModels[0];
  const rejectionReasons = strongestRejectedModel
    ? readStringArray(strongestRejectedModel.reasons)
    : [];
  const unresolvedLookup = strongestRejectedModel
    ? firstUnresolvedLookupReason([strongestRejectedModel])
    : null;
  const modelSafeRefusal = strongestRejectedModel
    ? readAnalyzerSafeRefusal(strongestRejectedModel.safeRefusal)
    : null;
  const modelRefusalReason = modelSafeRefusal && strongestRejectedModel
    ? readString(strongestRejectedModel.safeRefusalReason)
    : null;
  const modelRefusalFollowUps = modelSafeRefusal && strongestRejectedModel
    ? readStringArray(strongestRejectedModel.safeRefusalSuggestedFollowUps)
    : [];
  return clarificationPlanFromToolArgs(request, {
    reason: modelRefusalReason
      ?? unresolvedLookup?.reason
      ?? 'I can’t answer that from the available data model metadata yet.',
    suggestedFollowUps: modelRefusalFollowUps.length > 0
      ? modelRefusalFollowUps
      : unresolvedLookup
      ? unresolvedLookup.suggestedFollowUps
      : [
        'Ask a question using the available data models.',
        'Broaden or remove one filter and try again.',
        'Add AI metadata for a model that covers this question if it is a recurring need.'
      ]
  }, modelSafeRefusal
    ?? safeRefusalForRejectedModel(strongestRejectedModel, rejectionReasons, unresolvedLookup));
}

function safeRefusalForRejectedModel(
  model: Record<string, unknown> | undefined,
  rejectionReasons: string[],
  unresolvedLookup: { reason: string; suggestedFollowUps: string[] } | null
): AnalyzerSafeRefusalInput | undefined {
  if (!model || rejectionReasons.length === 0) return undefined;
  const candidateModel = safeRefusalCandidateModel(model);
  const instruction = unresolvedLookup?.suggestedFollowUps[0]
    ?? 'Choose an available data model or add metadata to one that supports this request.';
  return {
    ...(candidateModel ? { candidateModel } : {}),
    evidence: rejectionReasons.slice(0, 4).map(fact => ({
      code: unresolvedLookupValue(fact) ? 'lookup_unresolved' : 'model_rejected',
      fact
    })),
    nextStep: {
      code: unresolvedLookup ? 'correct_lookup_value' : 'train_or_choose_supported_model',
      instruction
    },
    reasonCode: unresolvedLookup ? 'unresolved_lookup' : 'no_eligible_capability'
  };
}

function safeRefusalCandidateModel(
  model: Record<string, unknown>
): AnalyzerSafeRefusalCandidateModel | undefined {
  const businessName = readString(model.businessName);
  const id = readString(model.id);
  const name = readString(model.name);
  if (!businessName && !id && !name) return undefined;
  return {
    ...(businessName ? { businessName } : {}),
    ...(id ? { id } : {}),
    ...(name ? { name } : {})
  };
}

function firstUnresolvedLookupReason(
  rejectedModels: Array<Record<string, unknown>>
): { reason: string; suggestedFollowUps: string[] } | null {
  for (const model of rejectedModels) {
    for (const reason of readStringArray(model.reasons)) {
      const unresolved = unresolvedLookupValue(reason);
      if (!unresolved) continue;
      return {
        reason: `I couldn’t find “${unresolved.value}” for the current scope or filters.`,
        suggestedFollowUps: [
          `Choose the matching ${unresolved.label} for this scope and try again.`,
          `Ask for available ${unresolved.label}s for this scope first.`,
          'Broaden or remove one filter and try again.'
        ]
      };
    }
  }
  return null;
}

function unresolvedLookupValue(reason: string): { label: string; value: string } | null {
  const marker = ' did not resolve ';
  const markerIndex = reason.indexOf(marker);
  if (markerIndex < 0) return null;
  const prefix = 'The configured lookup for ';
  if (!reason.startsWith(prefix)) return null;
  const field = reason.slice(prefix.length, markerIndex).trim();
  const value = stripTrailingPeriods(reason.slice(markerIndex + marker.length).trim());
  if (!field || !value) return null;
  return {
    label: lookupFieldBusinessLabel(field),
    value
  };
}

function lookupFieldBusinessLabel(field: string): string {
  const normalized = field.toLowerCase();
  if (normalized.includes('product')) return 'product';
  if (normalized.includes('location') || normalized.includes('site') || normalized.includes('branch')) return 'location';
  if (normalized.includes('company') || normalized.includes('account') || normalized.includes('client') || normalized.includes('customer') || normalized.includes('organization') || normalized.includes('organisation')) return 'organization';
  if (normalized.includes('payment') || normalized.includes('tender')) return 'payment method';
  if (normalized.includes('order')) return 'order type';
  return 'value';
}

function stripTrailingPeriods(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '.') {
    end -= 1;
  }
  return value.slice(0, end);
}

export function recoverableSchemaSelectionRequiredResult(state: AnalyzerPlanToolState): Record<string, unknown> {
  const modelHint = state.firstMatchedModelId || state.firstMatchedModelName
    ? ` Use get_schema for ${state.firstMatchedModelId ?? state.firstMatchedModelName}.`
    : '';
  return {
    success: false,
    error: 'Analyzer found AI-ready data-model matches and must inspect one schema before asking for more context.',
    nextStep: `Call get_schema for the best matching model from list_data_models, then call build_component.${modelHint}`
  };
}

export function recoverableTrustedDirectSchemaCandidateRequiredResult(
  candidate: TrustedDirectSchemaCandidate
): Record<string, unknown> {
  const schemaTarget = candidate.id
    ? `tableId "${candidate.id}"`
    : `tableName "${candidate.name ?? ''}"`;
  return {
    success: false,
    error: 'The rank 1 retrieval candidate matched an exact AI-ready routing example, so Analyzer must use that direct schema candidate first.',
    directSchemaCandidate: {
      ...(candidate.id ? { id: candidate.id } : {}),
      ...(candidate.name ? { name: candidate.name } : {}),
      ...(candidate.businessName ? { businessName: candidate.businessName } : {}),
      ...(candidate.matchedRoutingExample ? { matchedRoutingExample: candidate.matchedRoutingExample } : {})
    },
    nextStep: `Call get_schema with ${schemaTarget}, then build_component from that schema unless get_schema fails or the required fields are absent.`
  };
}

export function recoverableAnalyzerRouteRequiredResult(): Record<string, unknown> {
  return {
    success: false,
    error: 'Analyzer must semantically classify the user turn before planning.',
    nextStep: 'Call route_analyzer_user_turn first, then continue only with the tool path for that routed intent.'
  };
}

export function recoverableAnalyzerRouteMismatchResult(intent: AnalyzerTurnIntent): Record<string, unknown> {
  return {
    success: false,
    error: `Analyzer route is ${intent}, so this planning tool is not valid for the current user turn.`,
    nextStep: intent === 'conversation'
      ? 'Call answer_analyzer_conversation or route_analyzer_user_turn with intent conversation.'
      : 'Call route_analyzer_user_turn again if the routed intent was wrong.'
  };
}
