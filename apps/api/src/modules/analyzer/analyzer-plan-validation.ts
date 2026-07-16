import type { AnalyzerPlanRequest } from '../../validation.js';
import { validateAnalyzerExecutionScope } from '../sql-chart/analyzer-chart-execution-scope.js';
import {
  findDataSource,
  type TableDefinition
} from '../data-source/foundation-store.js';
import { analyzerParameterNamesForTable } from './analyzer-plan-parameter-values.js';
import {
  derivedColumnsForTable,
  derivedColumnSourceFields
} from './analyzer-plan-derived-columns.js';
import { analyzerVisibleFieldNames } from './analyzer-plan-field-visibility.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { fieldValueResolutionForTable } from './analyzer-value-resolver.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

export type AnalyzerPlanValidationStatus = 'passed' | 'warning' | 'failed';

export interface AnalyzerPlanValidationCheck {
  details?: Record<string, unknown>;
  id: string;
  message: string;
  status: AnalyzerPlanValidationStatus;
  title: string;
}

export interface AnalyzerPlanValidationSummary {
  checks: AnalyzerPlanValidationCheck[];
  evidence: AnalyzerPlanValidationEvidence[];
  failedCount: number;
  passedCount: number;
  status: AnalyzerPlanValidationStatus;
  valid: boolean;
  warningCount: number;
}

export interface AnalyzerPlanValidationEvidence {
  columns: string[];
  dataSourceId: string;
  filters: Array<Record<string, unknown>>;
  parameterNames: string[];
  parameterValues: Record<string, unknown>;
  tableId: string;
  tableName: string;
}

type AnalyzerActionStep = AnalyzerActionPlanResponse['actions'][number];

export function validateAnalyzerPlan(
  request: AnalyzerPlanRequest,
  response: AnalyzerActionPlanResponse
): AnalyzerPlanValidationSummary {
  const checks: AnalyzerPlanValidationCheck[] = [];
  const evidence: AnalyzerPlanValidationEvidence[] = [];
  const createTableActions = response.actions.filter(action => action.action === 'create_table');

  const addCheck = (check: AnalyzerPlanValidationCheck): void => {
    checks.push(check);
  };

  if (response.actions.some(action => action.action === 'answer_conversation')) {
    addCheck({
      id: 'conversation-route',
      message: 'The Analyzer classified this turn as conversation, so no source-data query validation is required.',
      status: 'passed',
      title: 'Conversation route'
    });
    return summarizeValidation(checks, evidence);
  }

  if (response.actions.some(action => action.action === 'request_clarification')) {
    addCheck({
      id: 'safe-clarification',
      message: 'The Analyzer asked for clarification instead of executing an uncertain query.',
      status: 'passed',
      title: 'Safe clarification'
    });
    return summarizeValidation(checks, evidence);
  }

  const source = findDataSource(request.dataSourceId);
  if (!source) {
    addCheck({
      id: 'data-source-exists',
      message: `Data source ${request.dataSourceId} is not available.`,
      status: 'failed',
      title: 'Data source exists'
    });
    return summarizeValidation(checks, evidence);
  }

  addCheck({
    id: 'data-source-exists',
    message: `Validated against data source ${source.name}.`,
    status: 'passed',
    title: 'Data source exists',
    details: { dataSourceId: source.id, dataSourceName: source.name }
  });

  if (createTableActions.length === 0) {
    addCheck({
      id: 'create-table-action',
      message: 'Analyzer result plans must include a create_table action so the answer can be proven from source data.',
      status: 'failed',
      title: 'Executable result action'
    });
    return summarizeValidation(checks, evidence);
  }

  addCheck({
    id: 'create-table-action',
    message: `Found ${createTableActions.length} executable result action${createTableActions.length === 1 ? '' : 's'}.`,
    status: 'passed',
    title: 'Executable result action',
    details: { actionCount: createTableActions.length }
  });

  createTableActions.forEach((action, index) => {
    const table = tableForCreateAction(source.tables, action, response);
    const actionLabel = createTableActions.length === 1 ? 'result' : `result ${index + 1}`;
    if (!table) {
      addCheck({
        id: `model-selected-${index + 1}`,
        message: `The ${actionLabel} does not resolve to an AI-ready data model in the selected data source.`,
        status: 'failed',
        title: 'Model selected',
        details: {
          tableReference: tableReferenceForAction(action, response)
        }
      });
      return;
    }

    addCheck({
      id: `model-selected-${index + 1}`,
      message: `The ${actionLabel} uses ${table.name}.`,
      status: 'passed',
      title: 'Model selected',
      details: { tableId: table.id, tableName: table.name }
    });

    const validFields = validAnalyzerFieldsForTable(table, response.actions);
    const columnFields = columnFieldsForAction(action);
    const missingColumns = columnFields.filter(field => !validFields.has(field));
    if (columnFields.length === 0) {
      addCheck({
        id: `columns-present-${index + 1}`,
        message: `The ${actionLabel} does not select any answer columns.`,
        status: 'failed',
        title: 'Answer columns'
      });
    } else if (missingColumns.length > 0) {
      addCheck({
        id: `columns-valid-${index + 1}`,
        message: `The ${actionLabel} references fields that are not available in ${table.name}: ${missingColumns.join(', ')}.`,
        status: 'failed',
        title: 'Answer columns',
        details: { invalidFields: missingColumns }
      });
    } else {
      addCheck({
        id: `columns-valid-${index + 1}`,
        message: `Validated ${columnFields.length} answer column${columnFields.length === 1 ? '' : 's'} against ${table.name}.`,
        status: 'passed',
        title: 'Answer columns',
        details: { columns: columnFields }
      });
    }

    const filters = filterRecordsForAction(action);
    const parameterValues = readParameterValues(action.params.parameterValues);
    const invalidFilterFields = filters
      .map(filter => readString(filter.field) ?? readString(filter.name))
      .filter((field): field is string => Boolean(field))
      .filter(field => !validFields.has(field));
    if (invalidFilterFields.length > 0) {
      addCheck({
        id: `filters-valid-${index + 1}`,
        message: `The ${actionLabel} filters on fields that are not available in ${table.name}: ${uniqueStrings(invalidFilterFields).join(', ')}.`,
        status: 'failed',
        title: 'Filter fields',
        details: { invalidFields: uniqueStrings(invalidFilterFields) }
      });
    } else {
      addCheck({
        id: `filters-valid-${index + 1}`,
        message: filters.length === 0
          ? `The ${actionLabel} has no extra filters to validate.`
          : `Validated ${filters.length} filter${filters.length === 1 ? '' : 's'} against ${table.name}.`,
        status: 'passed',
        title: 'Filter fields',
        details: { filterCount: filters.length }
      });
    }

    const relativeDateFilters = filters.filter(filter => isRelativeDateFilter(table, filter));
    if (relativeDateFilters.length > 0) {
      addCheck({
        id: `date-filters-executable-${index + 1}`,
        message: `The ${actionLabel} contains relative date filter operators. Analyzer plans must resolve dates to executable values before querying.`,
        status: 'failed',
        title: 'Date filters executable',
        details: { filters: relativeDateFilters }
      });
    } else {
      addCheck({
        id: `date-filters-executable-${index + 1}`,
        message: `Date filters for the ${actionLabel} are executable.`,
        status: 'passed',
        title: 'Date filters executable'
      });
    }

    const executionScope = validateAnalyzerExecutionScope({
      parameterValues,
      requester: 'ai-data-analyzer',
      table
    });
    if (executionScope.enforced) {
      addCheck({
        id: `execution-scope-${index + 1}`,
        message: executionScope.valid
          ? `The ${actionLabel} has resolved companyId, fromDate, and toDate execution parameters.`
          : `The ${actionLabel} is missing valid execution scope: ${executionScope.issues.join(', ')}.`,
        status: executionScope.valid ? 'passed' : 'failed',
        title: 'Execution scope',
        details: { issues: executionScope.issues }
      });
    }

    const unresolvedLookupWarnings = readStringArray(action.params._valueResolutionWarnings);
    if (unresolvedLookupWarnings.length > 0) {
      addCheck({
        id: `lookup-values-resolved-${index + 1}`,
        message: `The ${actionLabel} has dynamic lookup filters that must be resolved before querying: ${unresolvedLookupWarnings.join(' ')}`,
        status: 'failed',
        title: 'Lookup values resolved',
        details: { warnings: unresolvedLookupWarnings }
      });
    } else {
      addCheck({
        id: `lookup-values-resolved-${index + 1}`,
        message: `Dynamic lookup filters for the ${actionLabel} are resolved or not required.`,
        status: 'passed',
        title: 'Lookup values resolved'
      });
    }

    const lookupFiltersWithoutMarker = unresolvedLookupFilters(table, filters);
    if (lookupFiltersWithoutMarker.length > 0) {
      addCheck({
        id: `lookup-filter-proof-${index + 1}`,
        message: `The ${actionLabel} filters on dynamic source values without proof from value resolution: ${lookupFiltersWithoutMarker.join(', ')}.`,
        status: 'failed',
        title: 'Lookup value proof',
        details: { fields: lookupFiltersWithoutMarker }
      });
    }

    evidence.push({
      columns: columnFields,
      dataSourceId: request.dataSourceId,
      filters,
      parameterNames: Array.from(analyzerParameterNamesForTable(table)),
      parameterValues,
      tableId: table.id,
      tableName: table.name
    });
  });

  return summarizeValidation(checks, evidence);
}

export function analyzerValidationFailureReason(summary: AnalyzerPlanValidationSummary): string {
  const failures = summary.checks
    .filter(check => check.status === 'failed')
    .map(check => check.message);
  if (failures.length === 0) return 'Analyzer validation did not find any blocking issue.';
  return `Analyzer could not prove this plan safely: ${failures.join(' ')}`;
}

export function analyzerValidationUserReason(summary: AnalyzerPlanValidationSummary): string {
  const failedScope = summary.checks.find(check =>
    check.status === 'failed' && check.id.startsWith('execution-scope-')
  );
  if (failedScope) {
    return `To run this scoped model safely, provide an organization or location and a date range. ${failedScope.message}`;
  }
  const failedLookup = summary.checks.some(check =>
    check.status === 'failed'
    && (check.id.startsWith('lookup-values-resolved') || check.id.startsWith('lookup-filter-proof'))
  );
  if (failedLookup) {
    return [
      'To keep the answer accurate, I could not match part of the request to a trusted value in this data source.',
      'Please check the product, category, location, or payment wording, or ask for the available values first.'
    ].join(' ');
  }
  return 'To keep the answer accurate, I could not match this request to the AI-ready fields available in this data source.';
}

function summarizeValidation(
  checks: AnalyzerPlanValidationCheck[],
  evidence: AnalyzerPlanValidationEvidence[]
): AnalyzerPlanValidationSummary {
  const passedCount = checks.filter(check => check.status === 'passed').length;
  const warningCount = checks.filter(check => check.status === 'warning').length;
  const failedCount = checks.filter(check => check.status === 'failed').length;
  const status: AnalyzerPlanValidationStatus = failedCount > 0
    ? 'failed'
    : warningCount > 0
      ? 'warning'
      : 'passed';
  return {
    checks,
    evidence,
    failedCount,
    passedCount,
    status,
    valid: failedCount === 0,
    warningCount
  };
}

function tableForCreateAction(
  tables: TableDefinition[],
  action: AnalyzerActionStep,
  response: AnalyzerActionPlanResponse
): TableDefinition | null {
  const candidates = tableReferenceForAction(action, response);
  for (const candidate of candidates) {
    const table = tables.find(item => item.id === candidate || item.name === candidate);
    if (table) return table;
  }
  return null;
}

function tableReferenceForAction(
  action: AnalyzerActionStep,
  response: AnalyzerActionPlanResponse
): string[] {
  return uniqueStrings([
    readString(action.params.dataSourceTableId),
    readString(action.params._dataSourceTableId),
    readString(action.params.tableId),
    readString(action.params.tableName),
    readString(action.params._tableName),
    readString(response.params.dataSourceTableId),
    readString(response.params.tableName),
    response.intentDetails.selectedModel?.id,
    response.intentDetails.selectedModel?.name
  ].filter((value): value is string => Boolean(value)));
}

function validAnalyzerFieldsForTable(
  table: TableDefinition,
  actions: AnalyzerActionStep[]
): Set<string> {
  return new Set([
    ...analyzerVisibleFieldNames(table),
    ...analyzerParameterNamesForTable(table),
    ...derivedColumnsForTable(table).map(column => column.name),
    ...derivedColumnsForTable(table).flatMap(column => derivedColumnSourceFields(table, column)),
    ...calculatedFieldNames(actions)
  ]);
}

function calculatedFieldNames(actions: AnalyzerActionStep[]): string[] {
  return uniqueStrings(actions.flatMap(action => {
    if (action.action !== 'add_calculated_field') return [];
    const name = readString(action.params.name)
      ?? readString(action.params.field)
      ?? readString(action.params.key);
    return name ? [name] : [];
  }));
}

function columnFieldsForAction(action: AnalyzerActionStep): string[] {
  const columns = Array.isArray(action.params.columns) ? action.params.columns : [];
  return uniqueStrings(columns.flatMap(column => {
    if (typeof column === 'string' && column.trim().length > 0) return [column.trim()];
    if (!isRecord(column)) return [];
    const field = readString(column.field) ?? readString(column.name);
    return field ? [field] : [];
  }));
}

function filterRecordsForAction(action: AnalyzerActionStep): Array<Record<string, unknown>> {
  return [
    ...readFilterRecords(action.params.filters),
    ...readFilterRecords(action.params.filter)
  ];
}

function readFilterRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function isRelativeDateFilter(table: TableDefinition, filter: Record<string, unknown>): boolean {
  const fieldName = readString(filter.field) ?? readString(filter.name);
  if (!fieldName) return false;
  const field = table.fields.find(item => item.name === fieldName);
  if (!field || !isDateLikeField(field.type)) return false;
  const operator = (readString(filter.operator) ?? '').toLowerCase();
  const value = [
    readString(filter.value),
    ...readStringArray(filter.values)
  ].join(' ').toLowerCase();
  return RELATIVE_DATE_OPERATORS.has(operator)
    || /\b(current|previous|last|next|past|rolling|today|yesterday|tomorrow)\b/.test(value);
}

function isDateLikeField(type: string): boolean {
  return /\b(date|time|timestamp|datetime)\b/i.test(type);
}

const RELATIVE_DATE_OPERATORS = new Set([
  'current_day',
  'current_month',
  'current_quarter',
  'current_week',
  'current_year',
  'last_n_days',
  'last_n_months',
  'last_n_weeks',
  'last_n_years',
  'next_n_days',
  'past_n_days',
  'past_n_months',
  'previous_day',
  'previous_month',
  'previous_week',
  'previous_year',
  'rolling',
  'rolling_window'
]);

function unresolvedLookupFilters(table: TableDefinition, filters: Array<Record<string, unknown>>): string[] {
  return uniqueStrings(filters.flatMap(filter => {
    if (filterHasResolutionMarker(filter)) return [];
    const fieldName = readString(filter.field) ?? readString(filter.name);
    if (!fieldName) return [];
    const field = table.fields.find(item => item.name === fieldName);
    if (!field || !filterHasUserValue(filter)) return [];
    const resolution = fieldValueResolutionForTable(table, field);
    return resolution.mode === 'lookup' ? [fieldName] : [];
  }));
}

function filterHasResolutionMarker(filter: Record<string, unknown>): boolean {
  if (valueResolutionSource(filter) === 'unresolved_text_filter') return false;
  return Boolean(
    filter.resolvedValue
    || filter.resolvedValues
    || filter.valueResolution
    || filter.valueResolutionResult
    || filter.resolution
    || filter.matchType
    || filter._resolvedBy === 'resolve_field_values'
  );
}

function valueResolutionSource(filter: Record<string, unknown>): string | null {
  const resolution = isRecord(filter.resolution) ? filter.resolution : {};
  const valueResolution = isRecord(filter.valueResolution) ? filter.valueResolution : {};
  return readString(resolution.source ?? valueResolution.source)?.trim().toLowerCase() ?? null;
}

function filterHasUserValue(filter: Record<string, unknown>): boolean {
  return Boolean(
    readString(filter.value)
    || readString(filter.searchText)
    || readString(filter.query)
    || readStringArray(filter.values).length > 0
  );
}

function readParameterValues(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}
