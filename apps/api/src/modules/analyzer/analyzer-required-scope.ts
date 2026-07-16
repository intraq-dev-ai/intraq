import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  analyzerParameterDefinitionsForTable,
  type AnalyzerParameterDefinition
} from './analyzer-plan-parameter-values.js';

export interface AnalyzerRequiredScopeClarification {
  reason: string;
  suggestedFollowUps: string[];
}

export interface AnalyzerScopeRequirement {
  fields: string[];
  label: string;
  parameters: string[];
}

export interface AnalyzerTimeRequirement extends AnalyzerScopeRequirement {
  asOfParameters: string[];
  endParameters: string[];
  mode: 'as_of' | 'range' | 'range_or_as_of';
  startParameters: string[];
}

interface ScopePolicy {
  subject: AnalyzerScopeRequirement | null;
  suggestedFollowUps: string[];
  targetLabel: string;
  time: AnalyzerTimeRequirement | null;
}

const GENERIC_SCOPE_NAMES = [
  'account', 'accountid', 'accountnumber',
  'client', 'clientid', 'company', 'companyid', 'customer', 'customerid',
  'entity', 'entityid', 'item', 'itemid', 'location', 'locationid',
  'record', 'recordid', 'site', 'siteid', 'subject', 'subjectid'
];
const RANGE_START_NAMES = ['from', 'fromdate', 'startdate', 'datefrom', 'periodstart'];
const RANGE_END_NAMES = ['to', 'todate', 'enddate', 'dateto', 'periodend'];
const AS_OF_NAMES = ['asof', 'asofdate', 'reportdate', 'snapshotdate', 'effectivedate'];
const COMMON_DATE_FIELDS = ['businessdate', 'createdat', 'date', 'effectivedate', 'perioddate', 'reportdate', 'snapshotdate'];

export function requiredAnalyzerScopeClarification(input: {
  actionParams: Record<string, unknown>;
  question: string;
  table: TableDefinition;
}): AnalyzerRequiredScopeClarification | null {
  const policy = scopePolicyForTable(input.table);
  if (!policy) return null;
  const values = readRecord(input.actionParams.parameterValues);
  const missing: string[] = [];
  if (policy.subject && !hasRequirementValue(policy.subject, values, input.actionParams)) {
    missing.push(policy.subject.label);
  }
  if (policy.time && !hasTimeValue(policy.time, values, input.actionParams, input.question)) {
    missing.push(policy.time.label);
  }
  if (missing.length === 0) return null;
  return {
    reason: `Analyzer needs ${formatList(missing)} before running ${policy.targetLabel}.`,
    suggestedFollowUps: policy.suggestedFollowUps.length > 0
      ? policy.suggestedFollowUps
      : inferredSuggestions(policy)
  };
}

export function analyzerScopeRequirementsForTable(table: TableDefinition): {
  subject: AnalyzerScopeRequirement | null;
  time: AnalyzerTimeRequirement | null;
} | null {
  const policy = scopePolicyForTable(table);
  return policy ? { subject: policy.subject, time: policy.time } : null;
}

function scopePolicyForTable(table: TableDefinition): ScopePolicy | null {
  const explicit = explicitScopePolicy(table);
  if (explicit) return explicit;
  const parameters = analyzerParameterDefinitionsForTable(table);
  const scopeNames = genericScopeNames(table, parameters);
  const businessRequired = modelRequiresBusinessScope(table);
  const requiredScopeParameters = parameters
    .filter(parameter => parameter.required !== false && GENERIC_SCOPE_NAMES.includes(normalizeName(parameter.name)))
    .map(parameter => parameter.name);
  const subject = requiredScopeParameters.length > 0 || businessRequired
    ? genericSubjectRequirement(scopeNames, requiredScopeParameters)
    : null;
  const time = inferredTimeRequirement(table, parameters, modelRequiresDateRange(table));
  if (!subject && !time) return null;
  return {
    subject,
    suggestedFollowUps: [],
    targetLabel: modelTargetLabel(table),
    time
  };
}

function explicitScopePolicy(table: TableDefinition): ScopePolicy | null {
  const configured = readRecord(table.settings?.scopePolicy ?? table.dictionary.scopePolicy);
  if (!readBoolean(configured.required)) return null;
  const parameters = analyzerParameterDefinitionsForTable(table);
  const subjectValue = configured.subject ?? configured.entity;
  const hasSubjectConfig = isRecord(subjectValue);
  const hasTimeConfig = isRecord(configured.time);
  const subjectConfig = readRecord(subjectValue);
  const timeConfig = readRecord(configured.time);
  const inferredSubject = genericSubjectRequirement(genericScopeNames(table, parameters), []);
  const subject = hasSubjectConfig
    ? subjectConfig.required === false ? null : requirementFromConfig(subjectConfig, inferredSubject)
    : hasTimeConfig ? null : inferredSubject;
  const time = hasTimeConfig
    ? timeConfig.required === false ? null : timeRequirementFromConfig(timeConfig, table, parameters)
    : hasSubjectConfig ? null : inferredTimeRequirement(table, parameters, false);
  return {
    subject,
    suggestedFollowUps: readStringArray(configured.suggestedFollowUps ?? configured.suggestions),
    targetLabel: readString(configured.modelLabel) || modelTargetLabel(table),
    time
  };
}

function requirementFromConfig(
  config: Record<string, unknown>,
  fallback: AnalyzerScopeRequirement
): AnalyzerScopeRequirement {
  const fields = readStringArray(config.fields ?? config.filterFields);
  const parameters = readStringArray(config.parameters ?? config.parameterNames);
  return {
    fields: fields.length > 0 ? fields : fallback.fields,
    label: readString(config.label) || fallback.label,
    parameters: parameters.length > 0 ? parameters : fallback.parameters
  };
}

function timeRequirementFromConfig(
  config: Record<string, unknown>,
  table: TableDefinition,
  parameters: AnalyzerParameterDefinition[]
): AnalyzerTimeRequirement {
  const fallback = inferredTimeRequirement(table, parameters, true)!;
  const mode = readTimeMode(config.mode) ?? fallback.mode;
  const configured = requirementFromConfig(config, fallback);
  return {
    ...configured,
    label: readString(config.label) || timeLabel(mode),
    mode,
    asOfParameters: readStringArray(config.asOfParameters).length > 0
      ? readStringArray(config.asOfParameters)
      : fallback.asOfParameters,
    endParameters: readStringArray(config.endParameters).length > 0
      ? readStringArray(config.endParameters)
      : fallback.endParameters,
    startParameters: readStringArray(config.startParameters).length > 0
      ? readStringArray(config.startParameters)
      : fallback.startParameters
  };
}

function genericSubjectRequirement(fields: string[], parameters: string[]): AnalyzerScopeRequirement {
  const names = unique([...fields, ...parameters]);
  return {
    fields: names.length > 0 ? names : ['subject_id', 'entity_id', 'account_id', 'company_id', 'location_id'],
    label: 'subject, entity, account, company, or location',
    parameters: names.length > 0 ? names : ['subjectId', 'entityId', 'accountId', 'companyId', 'locationId']
  };
}

function inferredTimeRequirement(
  table: TableDefinition,
  parameters: AnalyzerParameterDefinition[],
  legacyRequired: boolean
): AnalyzerTimeRequirement | null {
  const required = parameters.filter(parameter => parameter.required !== false);
  const startParameters = parameterNames(required, 'start', RANGE_START_NAMES);
  const endParameters = parameterNames(required, 'end', RANGE_END_NAMES);
  const asOfParameters = parameterNames(required, 'as_of', AS_OF_NAMES);
  let mode: AnalyzerTimeRequirement['mode'] | null = null;
  if (asOfParameters.length > 0 && startParameters.length > 0 && endParameters.length > 0) mode = 'range_or_as_of';
  else if (asOfParameters.length > 0) mode = 'as_of';
  else if (startParameters.length > 0 && endParameters.length > 0 || legacyRequired) mode = 'range';
  if (!mode) return null;
  const fields = table.fields
    .map(field => field.name)
    .filter(field => isDateField(field));
  return {
    asOfParameters: unique([...asOfParameters, 'as_of_date', 'asOfDate', 'report_date', 'reportDate']),
    endParameters: unique([...endParameters, 'toDate', 'to_date', 'endDate', 'end_date', 'dateTo', 'date_to']),
    fields: fields.length > 0 ? fields : ['business_date', 'invoice_created_at', 'created_at', 'date'],
    label: timeLabel(mode),
    mode,
    parameters: unique([...startParameters, ...endParameters, ...asOfParameters]),
    startParameters: unique([...startParameters, 'fromDate', 'from_date', 'startDate', 'start_date', 'dateFrom', 'date_from'])
  };
}

function hasRequirementValue(
  requirement: AnalyzerScopeRequirement,
  values: Record<string, unknown>,
  params: Record<string, unknown>
): boolean {
  return hasAnyValue(values, requirement.parameters)
    || hasFilterForAnyField(params.filters, requirement.fields)
    || hasFilterForAnyField(params.filter, requirement.fields);
}

function hasTimeValue(
  requirement: AnalyzerTimeRequirement,
  values: Record<string, unknown>,
  params: Record<string, unknown>,
  question: string
): boolean {
  const hasRange = hasAnyValue(values, requirement.startParameters)
    && hasAnyValue(values, requirement.endParameters);
  const hasAsOf = hasAnyValue(values, requirement.asOfParameters);
  const hasDateFilter = hasFilterForAnyField(params.filters, requirement.fields)
    || hasFilterForAnyField(params.filter, requirement.fields);
  if (requirement.mode === 'range' && hasRange) return true;
  if (requirement.mode === 'as_of' && hasAsOf) return true;
  if (requirement.mode === 'range_or_as_of' && (hasRange || hasAsOf)) return true;
  return hasDateFilter || questionHasExplicitDate(question);
}

function genericScopeNames(table: TableDefinition, parameters: AnalyzerParameterDefinition[]): string[] {
  return unique([
    ...table.fields.map(field => field.name),
    ...parameters.map(parameter => parameter.name)
  ].filter(name => GENERIC_SCOPE_NAMES.includes(normalizeName(name))));
}

function parameterNames(
  parameters: AnalyzerParameterDefinition[],
  dateRole: string,
  fallbackNames: string[]
): string[] {
  return parameters
    .filter(parameter => normalizeName(parameter.dateRole ?? '') === normalizeName(dateRole)
      || fallbackNames.includes(normalizeName(parameter.name)))
    .map(parameter => parameter.name);
}

function modelRequiresBusinessScope(table: TableDefinition): boolean {
  return readBoolean(table.settings?.businessScopeRequired)
    || readBoolean(table.settings?.requiresBusinessScope)
    || readBoolean(table.settings?.entityScopeRequired)
    || readBoolean(table.settings?.requiresEntityScope)
    || readBoolean(table.settings?.subjectScopeRequired)
    || readBoolean(table.settings?.requiresSubjectScope)
    || readBoolean(table.dictionary.businessScopeRequired)
    || readBoolean(table.dictionary.requiresBusinessScope)
    || readBoolean(table.dictionary.entityScopeRequired)
    || readBoolean(table.dictionary.requiresEntityScope)
    || readBoolean(table.dictionary.subjectScopeRequired)
    || readBoolean(table.dictionary.requiresSubjectScope)
    || readBoolean(readRecord(table.dictionary.businessScopePolicy).required)
    || readBoolean(readRecord(table.dictionary.entityScopePolicy).required)
    || readBoolean(readRecord(table.dictionary.subjectScopePolicy).required)
    || readString(readRecord(table.dictionary.parameterRules).missingSubjectAction) === 'ask_clarification'
    || readString(readRecord(table.dictionary.parameterRules).missingEntityAction) === 'ask_clarification';
}

function modelRequiresDateRange(table: TableDefinition): boolean {
  const rules = readRecord(table.dictionary.parameterRules);
  return readString(rules.missingDateAction) === 'ask_clarification'
    || readString(table.settings?.missingDateAction) === 'ask_clarification'
    || readString(table.dictionary.missingDateAction) === 'ask_clarification';
}

function inferredSuggestions(policy: ScopePolicy): string[] {
  const requirements = [policy.subject?.label, policy.time?.label].filter((value): value is string => Boolean(value));
  return [
    `Provide ${formatList(requirements)}.`,
    'Use an exact scope identifier and an explicit business date, date range, or as-of date.',
    'If you need a broader answer, ask for that scope explicitly.'
  ];
}

function modelTargetLabel(table: TableDefinition): string {
  const businessName = readString(table.dictionary.businessName) || table.name;
  return `the ${businessName} model`;
}

function timeLabel(mode: AnalyzerTimeRequirement['mode']): string {
  if (mode === 'as_of') return 'as-of date';
  if (mode === 'range_or_as_of') return 'date range or as-of date';
  return 'date range';
}

function readTimeMode(value: unknown): AnalyzerTimeRequirement['mode'] | null {
  const mode = normalizeName(readString(value));
  if (mode === 'asof') return 'as_of';
  if (mode === 'rangeorasof') return 'range_or_as_of';
  return mode === 'range' ? 'range' : null;
}

function hasAnyValue(values: Record<string, unknown>, names: string[]): boolean {
  const normalized = new Set(names.map(normalizeName));
  return Object.entries(values).some(([key, value]) => normalized.has(normalizeName(key)) && hasValue(value));
}

function hasFilterForAnyField(value: unknown, fields: string[]): boolean {
  const normalized = new Set(fields.map(normalizeName));
  return readRecordArray(value).some(filter => {
    const field = readString(filter.field) || readString(filter.name) || readString(filter.column);
    return normalized.has(normalizeName(field));
  });
}

function questionHasExplicitDate(question: string): boolean {
  return /\b(?:today|yesterday|this\s+(?:week|month|quarter|year)|last\s+(?:week|month|quarter|year)|from\s+\d{4}-\d{2}-\d{2}|between\s+\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4})\b/i.test(question);
}

function isDateField(value: string): boolean {
  const normalized = normalizeName(value);
  return COMMON_DATE_FIELDS.includes(normalized) || normalized.includes('date') || normalized.includes('timestamp');
}

function formatList(values: string[]): string {
  if (values.length === 1) return values[0] ?? 'more scope';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function hasValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? unique(value.filter((item): item is string => typeof item === 'string')) : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
