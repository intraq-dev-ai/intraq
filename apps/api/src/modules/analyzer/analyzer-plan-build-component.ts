import type { AnalyzerPlanRequest } from '../../validation.js';
import { findDataSource, type TableDefinition } from '../data-source/foundation-store.js';
import {
  businessNameForTable,
  isAnalyzerModel
} from './analyzer-plan-schema.js';
import { normalizeAnalyzerActionStepsForBuild } from './analyzer-plan-action-normalizer.js';
import { normalizeAnalyzerFieldReferences } from './analyzer-plan-field-reference-normalizer.js';
import { conceptCoverageForAnalyzerPlan } from './analyzer-plan-concept-coverage.js';
import { analyzerParameterSelectionForQuestion } from './analyzer-plan-parameter-values.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import {
  attachAnalyzerSafeRefusal,
  type AnalyzerSafeRefusalInput
} from './analyzer-safe-refusal.js';
import {
  buildAnalyzerCapabilityManifest,
  validateAnalyzerCapabilityInvocation,
  type AnalyzerCapabilityInvocation
} from './analyzer-capability-contract.js';
import {
  augmentActionForAnalyzer,
  componentTypeFromActions,
  parseComponentType,
  readActionSteps,
  resolveTableFromBuildComponent,
  selectedModelFor,
  valueResolutionGuidanceFromActions
} from './analyzer-plan-build-component-actions.js';
import {
  invalidFieldsFromActions,
  readCreateTableColumns,
  validCalculatedFieldNames
} from './analyzer-plan-build-component-fields.js';
import { knowledgeReferencesFromIds } from './analyzer-plan-build-component-knowledge.js';
import {
  annotatePlanActionsForMultiModel,
  deduplicateBuiltAnalyzerSubplans,
  readMultiComponentResultArgs,
  uniqueKnowledgeReferences,
  uniqueSelectedModels
} from './analyzer-plan-build-component-multi.js';
import { actionFilterRecords } from './analyzer-plan-build-component-filters.js';
import {
  analyzerMessageWithParameterDefault,
  commonDefaultedPeriodLabel,
  dateFilterSelectionForAction,
  messageClaimsRelativePeriod,
  parametersUseDefault,
  questionMentionsDateOrPeriod,
  readParameterValues
} from './analyzer-plan-build-component-parameters.js';
import {
  normalizeCapabilityInvocationForParameterFilters,
  removeParameterBackedFilters
} from './analyzer-plan-parameter-filter-normalizer.js';
import {
  primaryTimeFieldNamesForTable,
} from './analyzer-plan-answer-column-normalizer.js';
import { analyzerVisibleFieldNames } from './analyzer-plan-field-visibility.js';
import {
  missingModelKnowledgeReason,
  recordAnalyzerBuildRefusal,
  unsupportedConceptsReason
} from './analyzer-plan-build-component-refusals.js';
import type { AnalyzerActionStep, AnalyzerSelectedModel } from './analyzer-plan-build-component-types.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';
import type { AnalyzerCapabilityGapIdentity } from './analyzer-unmapped-concept-log.js';

export const BUILD_COMPONENT_CONTEXT_FAILURE_REASON =
  'Analyzer build_component plans must select a valid data model and include a create_table action.';

export function buildComponentPlan(
  request: AnalyzerPlanRequest,
  args: Record<string, unknown>,
  capabilityGapIdentity?: AnalyzerCapabilityGapIdentity
): AnalyzerActionPlanResponse {
  const source = findDataSource(request.dataSourceId);
  const mode = readString(args.mode) ?? 'create';
  if (mode !== 'create') {
    return clarificationPlanFromToolArgs(request, {
      reason: 'Analyzer creates a new result from the selected model. Use Dashboard Builder for selected-component edits.'
    });
  }

  let rawActions = readActionSteps(args.actions);
  if (!source || rawActions.length === 0) {
    return clarificationPlanFromToolArgs(request, {
      reason: 'Analyzer needs a selected data source and Dashboard Builder action steps before it can create this result.'
    });
  }

  const table = resolveTableFromBuildComponent(source, args, rawActions);
  const capabilityInvocation = table
    ? normalizeCapabilityInvocationForParameterFilters(table, readCapabilityInvocation(args.capability))
    : readCapabilityInvocation(args.capability);
  const preserveRawMeasures = capabilityInvocation?.operation === 'list';
  if (table) rawActions = normalizeAnalyzerFieldReferences(rawActions, table);
  if (table && capabilityInvocation) {
    rawActions = repairCreateTableColumnsFromCapability(rawActions, table, capabilityInvocation, { preserveRawMeasures });
    rawActions = repairAncillaryActionFieldReferencesFromCapability(rawActions, table, capabilityInvocation);
    rawActions = removeRedundantCapabilityFilterActions(rawActions);
  }
  if (table) rawActions = removeParameterBackedActionFilters(rawActions, table);
  const initialCalculatedFields = table ? validCalculatedFieldNames(rawActions, table) : [];
  const originalInvalidFields = table ? uniqueStrings([
    ...readCreateTableColumns(
      rawActions.find(action => action.action === 'create_table')?.params.columns,
      table,
      initialCalculatedFields,
      { preserveRawMeasures }
    ).invalidFields,
    ...invalidFieldsFromActions(rawActions, table, initialCalculatedFields)
  ]) : [];
  if (originalInvalidFields.length > 0) {
    if (table) {
      recordAnalyzerBuildRefusal(request, table, {
        invalidFields: originalInvalidFields,
        reason: missingModelKnowledgeReason(originalInvalidFields),
        unsupportedConcepts: []
      }, capabilityGapIdentity);
    }
    return clarificationPlanFromToolArgs(request, {
      reason: missingModelKnowledgeReason(originalInvalidFields)
    });
  }
  if (table) rawActions = normalizeAnalyzerActionStepsForBuild(rawActions, table, request.question);
  if (table) rawActions = removeUnsupportedCalculatedActions(rawActions, table);
  const createTableAction = rawActions.find(action => action.action === 'create_table');
  if (!table || !createTableAction || !isAnalyzerModel(table)) {
    return clarificationPlanFromToolArgs(request, {
      reason: BUILD_COMPONENT_CONTEXT_FAILURE_REASON
    });
  }

  if (capabilityInvocation) {
    const validation = validateAnalyzerCapabilityInvocation(
      buildAnalyzerCapabilityManifest(source, table),
      capabilityInvocation
    );
    if (!validation.ok) {
      const reason = `Analyzer capability contract rejected this request: ${validation.errors.join(' ')}`;
      recordAnalyzerBuildRefusal(request, table, {
        invalidFields: capabilityInvalidFields(capabilityInvocation),
        reason,
        unsupportedConcepts: validation.errors
      }, capabilityGapIdentity);
      return clarificationPlanFromToolArgs(request, { reason });
    }
  }

  const finalCalculatedFields = validCalculatedFieldNames(rawActions, table);
  const columns = readCreateTableColumns(createTableAction.params.columns, table, finalCalculatedFields, { preserveRawMeasures });
  const answerColumns = focusAnswerColumnsToCapability(
    columnsWithCapabilityGroupBy(columns.columns, capabilityInvocation?.groupBy, table, finalCalculatedFields, { preserveRawMeasures }),
    capabilityInvocation,
    table,
    finalCalculatedFields,
    { preserveRawMeasures }
  );
  const invalidFields = [
    ...columns.invalidFields,
    ...invalidFieldsFromActions(rawActions, table, finalCalculatedFields)
  ];
  const reportedInvalidFields = uniqueStrings(invalidFields);
  if (answerColumns.length === 0 || reportedInvalidFields.length > 0) {
    const coverage = conceptCoverageForAnalyzerPlan(
      request.question,
      table,
      actionsWithCapabilityFiltersForCoverage(rawActions, capabilityInvocation)
    );
    const unsupportedConcepts = coverage.unsupportedTokens;
    recordAnalyzerBuildRefusal(request, table, {
      coverageRatio: coverage.coverageRatio,
      invalidFields: reportedInvalidFields,
      meaningfulTokens: coverage.meaningfulTokens,
      reason: reportedInvalidFields.length > 0
        ? missingModelKnowledgeReason(reportedInvalidFields)
        : unsupportedConcepts.length > 0
          ? unsupportedConceptsReason(unsupportedConcepts)
          : 'Analyzer build_component must include create_table columns selected from get_schema.',
      unsupportedConcepts
    }, capabilityGapIdentity);
    return clarificationPlanFromToolArgs(request, {
      reason: reportedInvalidFields.length > 0
        ? missingModelKnowledgeReason(reportedInvalidFields)
        : unsupportedConcepts.length > 0
          ? unsupportedConceptsReason(unsupportedConcepts)
          : 'Analyzer build_component must include create_table columns selected from get_schema.'
    });
  }

  const coverage = conceptCoverageForAnalyzerPlan(
    request.question,
    table,
    actionsWithCapabilityFiltersForCoverage(rawActions, capabilityInvocation)
  );
  const unsupportedConcepts = coverage.unsupportedTokens;
  if (unsupportedConcepts.length > 0) {
    recordAnalyzerBuildRefusal(request, table, {
      coverageRatio: coverage.coverageRatio,
      meaningfulTokens: coverage.meaningfulTokens,
      reason: unsupportedConceptsReason(unsupportedConcepts),
      unsupportedConcepts
    }, capabilityGapIdentity);
    return clarificationPlanFromToolArgs(request, {
      reason: unsupportedConceptsReason(unsupportedConcepts)
    });
  }

  const title = readString(args.title)
    ?? readString(createTableAction.params.title)
    ?? businessNameForTable(table);
  const parameterSelection = analyzerParameterSelectionForQuestion(table, request.question);
  const explicitParameterValues = readParameterValues(createTableAction.params.parameterValues);
  const preferDefaultParameterValues = Boolean(parameterSelection.defaultedPeriodLabel)
    && !questionMentionsDateOrPeriod(request.question);
  const preferInferredParameterValues = preferDefaultParameterValues
    || (!parameterSelection.defaultedPeriodLabel && questionMentionsDateOrPeriod(request.question));
  const dateFilterSelection = dateFilterSelectionForAction(table, createTableAction, parameterSelection.values, request.question);
  const rawBaseMessage = readString(args.message)
    ?? `I selected ${businessNameForTable(table)} and created a Dashboard Builder action plan for this question.`;
  const baseMessage = preferDefaultParameterValues && messageClaimsRelativePeriod(rawBaseMessage)
    ? `I selected ${businessNameForTable(table)} and created a Dashboard Builder action plan for this question.`
    : rawBaseMessage;
  const parameterDefaultLabel = (preferDefaultParameterValues || parametersUseDefault(parameterSelection.values, explicitParameterValues))
    ? parameterSelection.defaultedPeriodLabel
    : undefined;
  const message = analyzerMessageWithParameterDefault(
    baseMessage,
    parameterDefaultLabel ?? dateFilterSelection?.defaultedPeriodLabel
  );
  const componentType = parseComponentType(args.componentType)
    ?? componentTypeFromActions(rawActions)
    ?? 'table';
  const actions = normalizeTableSortActions(rawActions.map(action => augmentActionForAnalyzer(action, {
    ...(capabilityInvocation ? { capability: capabilityInvocation } : {}),
    columns: answerColumns,
    parameterValues: parameterSelection.values,
    preferDefaultParameterValues,
    preferInferredParameterValues,
    ...(dateFilterSelection?.filter ? { dateFilter: dateFilterSelection.filter } : {}),
    request,
    table,
    title
  })));
  const createAction = actions.find(action => action.action === 'create_table');
  const valueResolutionGuidance = valueResolutionGuidanceFromActions(actions);

  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType,
    params: {
      element: { clientElementId: 'analyzer-result' },
      dataSourceId: request.dataSourceId,
      dataSourceTableId: table.id,
      tableName: table.name
    },
    actions,
    message,
    intentDetails: {
      question: request.question,
      knowledgeReferences: knowledgeReferencesFromIds(readStringArray(args.knowledgeReferenceIds)),
      selectedModel: selectedModelFor(table, answerColumns),
      sql: readString(createAction?.params.sql) ?? '',
      insightGuidance: uniqueStrings([
        ...readStringArray(args.insightGuidance),
        ...valueResolutionGuidance
      ])
    }
  };
}

function normalizeTableSortActions(actions: AnalyzerActionStep[]): AnalyzerActionStep[] {
  const createTableAction = actions.find(action => action.action === 'create_table');
  if (!createTableAction) return actions;
  const preferredSort = preferredTableSort(createTableAction);
  if (preferredSort.length === 0) return actions;
  return actions.flatMap(action => {
    if (action.action !== 'set_table_sort') return [action];
    return [{
      action: action.action,
      params: sortActionParamsFromSort(preferredSort)
    }];
  });
}

function preferredTableSort(createTableAction: AnalyzerActionStep): Array<{ direction: 'asc' | 'desc'; field: string }> {
  const explicit = readSortEntries(createTableAction.params.sort);
  if (explicit.length > 0) return explicit;
  const measureField = firstMeasureField(readActionColumns(createTableAction.params.columns));
  return measureField ? [{ field: measureField, direction: 'desc' }] : [];
}

function readSortEntries(value: unknown): Array<{ direction: 'asc' | 'desc'; field: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!isRecord(entry)) return [];
    const field = readString(entry.field);
    if (!field) return [];
    const direction = readString(entry.direction)?.trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
    return [{ field, direction }];
  });
}

function sortActionParamsFromSort(sort: Array<{ direction: 'asc' | 'desc'; field: string }>): Record<string, unknown> {
  const [first] = sort;
  return {
    ...(first ? { field: first.field, direction: first.direction } : {}),
    sort
  };
}

function readActionColumns(value: unknown): Array<Record<string, unknown> & { field: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!isRecord(entry)) return [];
    const field = readString(entry.field) ?? readString(entry.name);
    return field ? [{ ...entry, field }] : [];
  });
}

function firstMeasureField(
  columns: Array<Record<string, unknown> & { field: string }>
): string | null {
  const measure = columns.find(column => {
    const summarize = readString(column.summarize)?.trim().toLowerCase();
    return Boolean(summarize && summarize !== 'none');
  });
  return measure?.field ?? null;
}

function removeParameterBackedActionFilters(
  actions: AnalyzerActionStep[],
  table: TableDefinition
): AnalyzerActionStep[] {
  return actions.flatMap(action => {
    if (action.action === 'configure_static_filter') {
      const filters = removeParameterBackedFilters(table, [action.params]);
      return filters?.length ? [action] : [];
    }
    if (action.action !== 'create_table') return [action];
    const params = { ...action.params };
    if (Object.prototype.hasOwnProperty.call(params, 'filters')) {
      const filters = removeParameterBackedFilters(table, actionFilterRecords(params.filters));
      if (filters?.length) params.filters = filters;
      else delete params.filters;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'filter')) {
      const filters = removeParameterBackedFilters(table, actionFilterRecords(params.filter));
      if (filters?.length) params.filter = filters.length === 1 ? filters[0] : filters;
      else delete params.filter;
    }
    return [{ action: action.action, params }];
  });
}

function removeRedundantCapabilityFilterActions(actions: AnalyzerActionStep[]): AnalyzerActionStep[] {
  return actions.filter(action => action.action !== 'configure_static_filter');
}

function removeUnsupportedCalculatedActions(
  actions: AnalyzerActionStep[],
  table: TableDefinition
): AnalyzerActionStep[] {
  const metadataCalculatedFields = new Set(validCalculatedFieldNames(actions, table));
  return actions.filter(action => {
    if (action.action !== 'add_calculated_field') return true;
    const name = readString(action.params.name)
      ?? readString(action.params.field)
      ?? readString(action.params.key);
    return Boolean(name && metadataCalculatedFields.has(name));
  });
}

function repairCreateTableColumnsFromCapability(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  capability: AnalyzerCapabilityInvocation,
  options: { preserveRawMeasures?: boolean }
): AnalyzerActionStep[] {
  if (capability.operation === 'list') return actions;
  const createTableIndex = actions.findIndex(action => action.action === 'create_table');
  if (createTableIndex < 0) return actions;
  const createTableAction = actions[createTableIndex];
  if (!createTableAction) return actions;
  const calculatedFields = validCalculatedFieldNames(actions, table);
  const currentColumns = readCreateTableColumns(createTableAction.params.columns, table, calculatedFields, options);
  if (currentColumns.invalidFields.length === 0) return actions;
  const repairedColumns = capabilityColumnsForTable(capability, table, calculatedFields, options);
  if (repairedColumns.length === 0) return actions;
  return actions.map((action, index) => index === createTableIndex
    ? {
        action: action.action,
        params: {
          ...action.params,
          columns: repairedColumns
        }
      }
    : action);
}

function repairAncillaryActionFieldReferencesFromCapability(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  capability: AnalyzerCapabilityInvocation
): AnalyzerActionStep[] {
  const { dimensions, measures } = capabilityRequestedFields(capability, table);
  const primaryDimension = [...dimensions][0]
    ?? (capability.operation === 'trend' ? primaryTimeFieldNamesForTable(table)[0] ?? null : null);
  const primaryMeasure = [...measures][0] ?? null;
  const allowedSortFields = new Set([...dimensions, ...measures]);
  if (!primaryDimension && !primaryMeasure) return actions;

  const validFields = analyzerVisibleFieldNames(table);
  return actions.map(action => {
    if (action.action === 'create_table') return action;
    const params = { ...action.params };
    let changed = false;

    for (const key of ['xField', 'groupByField'] as const) {
      const reference = readString(params[key]);
      if (!reference || validFields.has(reference) || !primaryDimension) continue;
      params[key] = primaryDimension;
      changed = true;
    }

    for (const key of ['valueField', 'yField'] as const) {
      const reference = readString(params[key]);
      if (!reference || validFields.has(reference) || !primaryMeasure) continue;
      params[key] = primaryMeasure;
      changed = true;
    }

    if (action.action === 'set_table_sort') {
      const reference = readString(params.field);
      const replacement = primaryMeasure ?? primaryDimension;
      if (reference && (!validFields.has(reference) || !allowedSortFields.has(reference)) && replacement) {
        params.field = replacement;
        changed = true;
      }
    }

    return changed ? { action: action.action, params } : action;
  });
}

function columnsWithCapabilityGroupBy(
  columns: Array<Record<string, unknown> & { field: string }>,
  groupBy: string[] | undefined,
  table: TableDefinition,
  calculatedFields: string[],
  options: { preserveRawMeasures?: boolean }
): Array<Record<string, unknown> & { field: string }> {
  if (!groupBy?.length) return columns;
  const existing = new Set(columns.map(column => column.field));
  const groupedColumns = readCreateTableColumns(
    groupBy.map(field => ({ field, summarize: 'none' })),
    table,
    calculatedFields,
    options
  ).columns.filter(column => !existing.has(column.field));
  return [...groupedColumns, ...columns];
}

function focusAnswerColumnsToCapability(
  columns: Array<Record<string, unknown> & { field: string }>,
  capability: AnalyzerCapabilityInvocation | null,
  table: TableDefinition,
  calculatedFields: string[],
  options: { preserveRawMeasures?: boolean }
): Array<Record<string, unknown> & { field: string }> {
  if (!capability || capability.operation === 'list') return columns;

  const { dimensions, measures } = capabilityRequestedFields(capability, table);

  if (dimensions.size === 0 && measures.size === 0) return columns;

  const keepFields = new Set<string>([...dimensions, ...measures]);
  const byField = new Map(columns.map(column => [column.field, column] as const));
  const filtered = columns.filter(column => keepFields.has(column.field));
  const ensured = readCreateTableColumns(
    [...dimensions, ...measures].map(field => {
      const existing = byField.get(field);
      return existing ?? { field, summarize: dimensions.has(field) ? 'none' : undefined };
    }),
    table,
    calculatedFields,
    options
  ).columns;
  const orderedFields = [...dimensions, ...measures];
  const focused = orderedFields
    .map(field => ensured.find(column => column.field === field) ?? byField.get(field))
    .filter((column): column is Record<string, unknown> & { field: string } => Boolean(column));

  if (focused.length === 0) return columns;
  if (filtered.length === columns.length && focused.length === columns.length) return columns;
  return focused;
}

function capabilityColumnsForTable(
  capability: AnalyzerCapabilityInvocation,
  table: TableDefinition,
  calculatedFields: string[],
  options: { preserveRawMeasures?: boolean }
): Array<Record<string, unknown> & { field: string }> {
  const { dimensions, measures } = capabilityRequestedFields(capability, table);
  const requestedFields = [
    ...dimensions,
    ...measures
  ];
  if (requestedFields.length === 0) return [];
  return readCreateTableColumns(
    requestedFields.map(field => ({
      field,
      summarize: dimensions.has(field) ? 'none' : undefined
    })),
    table,
    calculatedFields,
    options
  ).columns;
}

function capabilityRequestedFields(
  capability: AnalyzerCapabilityInvocation,
  table: TableDefinition
): {
  dimensions: Set<string>;
  measures: Set<string>;
} {
  const dimensions = new Set<string>(capability.groupBy ?? []);
  if (capability.operation === 'trend') {
    for (const fieldName of primaryTimeFieldNamesForTable(table)) dimensions.add(fieldName);
  }
  if (capability.bucket?.field) dimensions.add(capability.bucket.field);

  const measures = new Set<string>(capability.measures ?? []);
  if (capability.measure) measures.add(capability.measure);
  for (const sortField of capability.orderBy?.map(item => item.field) ?? []) {
    if (sortField) measures.add(sortField);
  }
  return { dimensions, measures };
}

function readCapabilityInvocation(value: unknown): AnalyzerCapabilityInvocation | null {
  if (!isRecord(value)) return null;
  const operation = readString(value.operation);
  if (
    operation !== 'list'
    && operation !== 'aggregate'
    && operation !== 'top_n'
    && operation !== 'trend'
    && operation !== 'compare'
    && operation !== 'bucket'
  ) {
    return null;
  }
  const invocation: AnalyzerCapabilityInvocation = { operation };
  const measure = readString(value.measure);
  if (measure) invocation.measure = measure;
  const measures = uniqueStrings([...(measure ? [measure] : []), ...readStringArray(value.measures)]);
  if (measures.length > 0) invocation.measures = measures;
  const groupBy = readStringArray(value.groupBy);
  if (groupBy.length > 0) invocation.groupBy = groupBy;
  const limit = typeof value.limit === 'number' && Number.isFinite(value.limit) ? Math.trunc(value.limit) : undefined;
  if (limit !== undefined) invocation.limit = limit;
  const filters = readCapabilityFilters(value.filters);
  if (filters.length > 0) invocation.filters = filters;
  const orderBy = readCapabilityOrderBy(value.orderBy);
  if (orderBy.length > 0) invocation.orderBy = orderBy;
  const bucket = readCapabilityBucket(value.bucket);
  if (bucket) invocation.bucket = bucket;
  return invocation;
}

function readCapabilityFilters(value: unknown): NonNullable<AnalyzerCapabilityInvocation['filters']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const field = readString(item.field);
    const operator = readString(item.operator);
    if (!field || !operator) return [];
    const requestedText = readString(item.requestedText);
    const value = Object.prototype.hasOwnProperty.call(item, 'value')
      ? item.value
      : Object.prototype.hasOwnProperty.call(item, 'values') ? item.values : undefined;
    return [{
      field,
      operator,
      ...(requestedText ? { requestedText } : {}),
      ...(isRecord(item.resolution) ? { resolution: item.resolution } : {}),
      ...(value === undefined ? {} : { value })
    }];
  });
}

function readCapabilityOrderBy(value: unknown): NonNullable<AnalyzerCapabilityInvocation['orderBy']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const field = readString(item.field);
    if (!field) return [];
    const direction = item.direction === 'asc' || item.direction === 'desc' ? item.direction : undefined;
    return [{ field, ...(direction ? { direction } : {}) }];
  });
}

function readCapabilityBucket(value: unknown): AnalyzerCapabilityInvocation['bucket'] {
  if (!isRecord(value)) return undefined;
  const field = readString(value.field);
  const size = typeof value.size === 'number' && Number.isFinite(value.size) ? value.size : undefined;
  return field && size !== undefined ? { field, size } : undefined;
}

function capabilityInvalidFields(invocation: AnalyzerCapabilityInvocation): string[] {
  return uniqueStrings([
    invocation.measure,
    ...(invocation.measures ?? []),
    ...(invocation.groupBy ?? []),
    ...(invocation.filters?.map(filter => filter.field) ?? []),
    invocation.bucket?.field,
    ...(invocation.orderBy?.map(order => order.field) ?? [])
  ].filter((field): field is string => Boolean(field)));
}

function actionsWithCapabilityFiltersForCoverage(
  actions: AnalyzerActionPlanResponse['actions'],
  invocation: AnalyzerCapabilityInvocation | null
): AnalyzerActionPlanResponse['actions'] {
  if (!invocation?.filters?.length) return actions;
  return [
    ...actions,
    {
      action: 'create_table',
      params: {
        filters: invocation.filters
      }
    }
  ];
}

export function buildMultiComponentPlan(
  request: AnalyzerPlanRequest,
  args: Record<string, unknown>,
  capabilityGapIdentity?: AnalyzerCapabilityGapIdentity
): AnalyzerActionPlanResponse {
  const resultArgs = readMultiComponentResultArgs(args);
  if (resultArgs.length === 0) {
    return clarificationPlanFromToolArgs(request, {
      reason: 'Analyzer needs at least one data model result before it can answer this business question.'
    });
  }

  const builtSubplans = resultArgs.map(result => buildComponentPlan(request, result, capabilityGapIdentity));
  const failed = builtSubplans.find(plan =>
    plan.actions.some(action => action.action === 'request_clarification')
    || !plan.intentDetails.selectedModel
  );
  if (failed) return failed;
  const subplans = deduplicateBuiltAnalyzerSubplans(builtSubplans);

  const actions = subplans.flatMap((plan, index) => annotatePlanActionsForMultiModel(plan, index));
  const selectedModels = uniqueSelectedModels(subplans
    .map(plan => plan.intentDetails.selectedModel)
    .filter((model): model is AnalyzerSelectedModel => Boolean(model)));
  const primary = subplans[0]!;
  const rawMessage = readString(args.message)
    ?? `I selected ${selectedModels.map(model => model.businessName).join(', ')} and created a multi-model Analyzer plan for this question.`;
  const defaultedPeriodLabel = commonDefaultedPeriodLabel(subplans);
  const baseMessage = defaultedPeriodLabel && messageClaimsRelativePeriod(rawMessage)
    ? `I selected ${selectedModels.map(model => model.businessName).join(', ')} and created a multi-model Analyzer plan for this question.`
    : rawMessage;
  const message = analyzerMessageWithParameterDefault(baseMessage, defaultedPeriodLabel);

  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType: 'table',
    params: {
      element: { clientElementId: 'analyzer-result' },
      dataSourceId: request.dataSourceId,
      ...(readString(primary.params.dataSourceTableId) ? { dataSourceTableId: readString(primary.params.dataSourceTableId)! } : {}),
      ...(readString(primary.params.tableName) ? { tableName: readString(primary.params.tableName)! } : {})
    },
    actions,
    message,
    intentDetails: {
      question: request.question,
      knowledgeReferences: uniqueKnowledgeReferences(subplans.flatMap(plan => plan.intentDetails.knowledgeReferences)),
      selectedModel: primary.intentDetails.selectedModel,
      selectedModels,
      sql: subplans
        .map(plan => plan.intentDetails.sql)
        .filter(sql => sql.trim().length > 0)
        .join('\n\n'),
      insightGuidance: uniqueStrings([
        ...readStringArray(args.insightGuidance),
        ...subplans.flatMap(plan => plan.intentDetails.insightGuidance)
      ])
    }
  };
}

export function clarificationPlanFromToolArgs(
  request: AnalyzerPlanRequest,
  args: Record<string, unknown>,
  safeRefusal?: AnalyzerSafeRefusalInput
): AnalyzerActionPlanResponse {
  const reason = readString(args.reason)
    ?? 'Analyzer needs selected data source and business model context before it can answer this business question.';
  const suggestedFollowUps = readStringArray(args.suggestedFollowUps);
  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType: 'table',
    params: {
      element: { clientElementId: 'analyzer-result' },
      dataSourceId: request.dataSourceId
    },
    actions: [{
      action: 'request_clarification',
      params: attachAnalyzerSafeRefusal({
        reason,
        question: request.question,
        dataSourceId: request.dataSourceId
      }, safeRefusal)
    }],
    message: reason,
    intentDetails: {
      question: request.question,
      knowledgeReferences: [],
      selectedModel: null,
      sql: '',
      insightGuidance: suggestedFollowUps.length > 0
        ? suggestedFollowUps
        : [
          'Select a data source for this Analyzer conversation.',
          'Choose a data model with business measures, dimensions, and routing metadata.',
          'Ask the question again after the model context is available.'
        ]
    }
  };
}

export function isAnalyzerActionPlanResponse(value: unknown): value is AnalyzerActionPlanResponse {
  if (!isRecord(value)) return false;
  return value.success === true
    && value.type === 'action-plan'
    && value.mode === 'create'
    && value.requester === 'ai-data-analyzer'
    && Array.isArray(value.actions)
    && isRecord(value.params)
    && isRecord(value.intentDetails);
}
