import type { ConfirmedAnalyzerBusinessScope } from '@intraq/contracts';
import type { TableDefinition } from '../data-source/foundation-store.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';
import {
  analyzerParameterDefinitionsForTable,
  type AnalyzerParameterDefinition
} from './analyzer-plan-parameter-values.js';
import {
  analyzerScopeRequirementsForTable,
  type AnalyzerScopeRequirement
} from './analyzer-required-scope.js';

type ScopeValueKind = 'account' | 'company' | 'entity' | 'location' | 'subject';

export function applyAnalyzerBusinessScopeToPlan(
  response: AnalyzerActionPlanResponse,
  table: TableDefinition,
  scope: ConfirmedAnalyzerBusinessScope
): AnalyzerActionPlanResponse {
  return {
    ...response,
    actions: response.actions.map(action => action.action === 'create_table'
      ? { ...action, params: scopedActionParams(action.params, table, scope) }
      : action)
  };
}

export function analyzerBusinessScopeSignature(scope: ConfirmedAnalyzerBusinessScope | null): string {
  if (!scope) return 'unconfirmed';
  const { confirmedAt: _confirmedAt, previousConversationId: _previous, ...stable } = scope;
  return JSON.stringify(stable);
}

/** Proves that a selected model can apply the exact confirmed subject scope. */
export function analyzerBusinessScopeTermIsBindable(
  table: TableDefinition,
  term: string,
  scope?: ConfirmedAnalyzerBusinessScope | null
): boolean {
  const kind = scopeKind(term);
  if (!kind) return false;
  const definitions = analyzerParameterDefinitionsForTable(table);
  const parameter = definitions.find(item => parameterScopeKind(item) === kind
    && (!scope || scopeValueForTarget(scope, kind, item.name, item.dataType) !== null));
  if (parameter) return true;
  return table.fields.some(field => scopeKind(field.name) === kind
    && (!scope || scopeValueForTarget(scope, kind, field.name, field.columnType ?? field.type) !== null));
}

export function analyzerBusinessScopeMatchesTableDomain(
  scope: ConfirmedAnalyzerBusinessScope,
  table: TableDefinition
): boolean {
  void scope;
  void table;
  return true;
}

function scopedActionParams(
  params: Record<string, unknown>,
  table: TableDefinition,
  scope: ConfirmedAnalyzerBusinessScope
): Record<string, unknown> {
  const requirements = analyzerScopeRequirementsForTable(table);
  const definitions = analyzerParameterDefinitionsForTable(table);
  const relevantParameters = new Set([
    ...definitions.filter(item => parameterScopeKind(item) !== null || dateRole(item) !== null).map(item => normalized(item.name)),
    ...(requirements?.subject?.parameters ?? []).map(normalized),
    ...(requirements?.time?.parameters ?? []).map(normalized)
  ]);
  const relevantFields = new Set([
    ...table.fields.filter(item => scopeKind(item.name) !== null || isDateName(item.name)).map(item => normalized(item.name)),
    ...(requirements?.subject?.fields ?? []).map(normalized),
    ...(requirements?.time?.fields ?? []).map(normalized)
  ]);
  const parameterValues = Object.fromEntries(Object.entries(readRecord(params.parameterValues))
    .filter(([key]) => !relevantParameters.has(normalized(key))));
  const existingFilters = readRecordArray(params.filters ?? params.filter)
    .filter(filter => !relevantFields.has(normalized(readString(filter.field))));

  const parameterKinds = applySubjectParameters(parameterValues, definitions, scope);
  const filters = applySubjectFilters(existingFilters, table, scope, parameterKinds);
  applyRequirementSubject(parameterValues, filters, definitions, table, scope, requirements?.subject ?? null);
  applyPeriod(parameterValues, filters, definitions, table, scope, requirements?.time ?? null);

  return {
    ...params,
    parameterValues,
    filters
  };
}

function applySubjectParameters(
  values: Record<string, unknown>,
  definitions: AnalyzerParameterDefinition[],
  scope: ConfirmedAnalyzerBusinessScope
): Set<ScopeValueKind> {
  const applied = new Set<ScopeValueKind>();
  for (const definition of definitions) {
    const kind = parameterScopeKind(definition);
    const value = kind
      ? scopeValueForTarget(scope, kind, definition.name, definition.dataType)
      : null;
    if (!kind || !value) continue;
    values[definition.name] = value;
    applied.add(kind);
  }
  return applied;
}

function applySubjectFilters(
  filters: Record<string, unknown>[],
  table: TableDefinition,
  scope: ConfirmedAnalyzerBusinessScope,
  parameterKinds: Set<ScopeValueKind>
): Record<string, unknown>[] {
  const output = [...filters];
  for (const field of table.fields) {
    const kind = scopeKind(field.name);
    const value = kind
      ? scopeValueForTarget(scope, kind, field.name, field.columnType ?? field.type)
      : null;
    if (!kind || !value || parameterKinds.has(kind)) continue;
    output.push({ field: field.name, operator: 'equals', value });
    parameterKinds.add(kind);
  }
  return output;
}

function applyRequirementSubject(
  values: Record<string, unknown>,
  filters: Record<string, unknown>[],
  definitions: AnalyzerParameterDefinition[],
  table: TableDefinition,
  scope: ConfirmedAnalyzerBusinessScope,
  requirement: AnalyzerScopeRequirement | null
): void {
  if (!requirement) return;
  const declared = new Map(definitions.map(item => [normalized(item.name), item]));
  for (const name of requirement.parameters.filter(item => scopeKind(item) === null)) {
    const definition = declared.get(normalized(name));
    if (!definition || values[definition.name] !== undefined) continue;
    const value = firstScopeValueForTarget(scope, definition.name, definition.dataType);
    if (!value) continue;
    values[definition.name] = value;
    return;
  }
  const fields = new Map(table.fields.map(item => [normalized(item.name), item]));
  for (const name of requirement.fields.filter(item => scopeKind(item) === null)) {
    const field = fields.get(normalized(name));
    if (!field || filters.some(item => normalized(readString(item.field)) === normalized(field.name))) continue;
    const value = firstScopeValueForTarget(scope, field.name, field.columnType ?? field.type);
    if (!value) continue;
    filters.push({ field: field.name, operator: 'equals', value });
    return;
  }
}

function applyPeriod(
  values: Record<string, unknown>,
  filters: Record<string, unknown>[],
  definitions: AnalyzerParameterDefinition[],
  table: TableDefinition,
  scope: ConfirmedAnalyzerBusinessScope,
  requirement: NonNullable<ReturnType<typeof analyzerScopeRequirementsForTable>>['time']
): void {
  if (!scope.period) return;
  const time = requirement;
  if (scope.period.mode === 'range') {
    const start = findDateParameter(definitions, time?.startParameters ?? [], 'start');
    const end = findDateParameter(definitions, time?.endParameters ?? [], 'end');
    if (start && end) {
      values[start.name] = scope.period.startDate;
      values[end.name] = normalizedEndDate(scope.period.endDate, end);
      return;
    }
  } else {
    const asOf = findDateParameter(definitions, time?.asOfParameters ?? [], 'as_of');
    if (asOf) {
      values[asOf.name] = scope.period.asOfDate;
      return;
    }
  }
  const fields = new Map(table.fields.map(item => [normalized(item.name), item.name]));
  const field = (time?.fields ?? [])
    .map(name => fields.get(normalized(name)))
    .find(Boolean)
    ?? table.fields.find(item => isDateName(item.name))?.name;
  if (!field) return;
  filters.push(scope.period.mode === 'range'
    ? { field, operator: 'between', value: [scope.period.startDate, scope.period.endDate] }
    : { field, operator: 'equals', value: scope.period.asOfDate });
}

function findDateParameter(
  definitions: AnalyzerParameterDefinition[],
  configuredNames: string[],
  role: 'start' | 'end' | 'as_of'
): AnalyzerParameterDefinition | undefined {
  const configured = new Set(configuredNames.map(normalized));
  return definitions.find(item => configured.has(normalized(item.name)) || dateRole(item) === role);
}

function normalizedEndDate(value: string, definition: AnalyzerParameterDefinition): string {
  const boundary = normalized(definition.dateBoundary ?? '');
  if (!['exclusive', 'exclusiveend', 'endexclusive'].includes(boundary)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function parameterScopeKind(definition: AnalyzerParameterDefinition): ScopeValueKind | null {
  return dateRole(definition) ? null : scopeKind(definition.name);
}

function dateRole(definition: AnalyzerParameterDefinition): 'start' | 'end' | 'as_of' | null {
  const role = normalized(definition.dateRole ?? '');
  if (role === 'start') return 'start';
  if (role === 'end') return 'end';
  if (role === 'asof') return 'as_of';
  const name = normalized(definition.name);
  if (['from', 'fromdate', 'startdate', 'datefrom', 'periodstart'].includes(name)) return 'start';
  if (['to', 'todate', 'enddate', 'dateto', 'periodend'].includes(name)) return 'end';
  return ['asof', 'asofdate', 'reportdate', 'snapshotdate', 'effectivedate'].includes(name) ? 'as_of' : null;
}

function scopeKind(value: string): ScopeValueKind | null {
  const tokens = identifierTokens(value);
  if (isDateName(value)) return null;
  if (tokens.has('subject')) return 'subject';
  if (tokens.has('entity') || tokens.has('record') || tokens.has('item')) return 'entity';
  if (tokens.has('account')) return 'account';
  if (tokens.has('location') || tokens.has('branch') || tokens.has('site') || tokens.has('warehouse')) return 'location';
  if (
    tokens.has('company')
    || tokens.has('business')
    || tokens.has('client')
    || tokens.has('customer')
    || tokens.has('organization')
    || tokens.has('organisation')
  ) return 'company';
  return null;
}

function identifierTokens(value: string): Set<string> {
  const separated = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();
  const tokens = separated.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of [...tokens]) {
    const stem = identifierStem(token);
    if (stem) tokens.push(stem);
  }
  return new Set(tokens);
}

function identifierStem(value: string): string | null {
  for (const suffix of ['identifier', 'number', 'code', 'key', 'id']) {
    if (value.endsWith(suffix) && value.length > suffix.length) {
      return value.slice(0, -suffix.length);
    }
  }
  return null;
}

function scopeValueForTarget(
  scope: ConfirmedAnalyzerBusinessScope,
  kind: ScopeValueKind,
  targetName: string,
  dataType: string | undefined
): string | null {
  const subject = scopeSubjectValues(scope, kind);
  const identifierTarget = targetUsesIdentifier(targetName) || numericType(dataType);
  const legacyNumericId = subject.label && numericIdentifierValue(subject.label)
    ? subject.label
    : null;
  const candidates = identifierTarget
    ? [subject.identifier, legacyNumericId]
    : [subject.label, subject.identifier];
  return candidates.find(value => value !== null && targetTypeAccepts(value, dataType)) ?? null;
}

function firstScopeValueForTarget(
  scope: ConfirmedAnalyzerBusinessScope,
  targetName: string,
  dataType: string | undefined
): string | null {
  const order: ScopeValueKind[] = ['subject', 'entity', 'location', 'account', 'company'];
  return order
    .map(kind => scopeValueForTarget(scope, kind, targetName, dataType))
    .find(value => value !== null) ?? null;
}

function scopeSubjectValues(
  scope: ConfirmedAnalyzerBusinessScope,
  kind: ScopeValueKind
): { identifier: string | null; label: string | null } {
  if (kind === 'subject') {
    return { identifier: scope.subjectId ?? null, label: scope.subject ?? null };
  }
  if (kind === 'entity') {
    return { identifier: scope.entityId ?? null, label: scope.entity ?? null };
  }
  if (kind === 'location') {
    return { identifier: scope.locationId ?? null, label: scope.location ?? null };
  }
  if (kind === 'account') {
    return { identifier: scope.accountId ?? null, label: scope.account ?? null };
  }
  if (kind === 'company') {
    return { identifier: scope.companyId ?? null, label: scope.company ?? null };
  }
  return { identifier: null, label: null };
}

function targetUsesIdentifier(value: string): boolean {
  const tokens = identifierTokens(value);
  return ['id', 'identifier', 'number', 'code', 'key'].some(token => tokens.has(token));
}

function targetTypeAccepts(value: string, dataType: string | undefined): boolean {
  const type = normalized(dataType ?? '');
  if (!type) return true;
  if (numericType(type)) return numericValue(value);
  if (type.includes('date') || type.includes('time') || type.includes('bool')) return false;
  return true;
}

function numericType(value: string | undefined): boolean {
  const type = normalized(value ?? '');
  return ['bigint', 'decimal', 'double', 'float', 'int', 'integer', 'number', 'numeric', 'real']
    .some(candidate => type.includes(candidate));
}

function numericValue(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value));
}

function numericIdentifierValue(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function isDateName(value: string): boolean {
  const name = normalized(value);
  return name.includes('date') || name.includes('timestamp') || name === 'day';
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : isRecord(value) ? [value] : [];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
