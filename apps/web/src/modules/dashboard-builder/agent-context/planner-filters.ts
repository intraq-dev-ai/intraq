import type { BuilderDataTable } from '../types';
import {
  candidateForField,
  type FieldCandidate,
  fieldRole,
  isRecord,
  readBoolean,
  readString,
  readStringArray,
  routingMetadata
} from './planner-metadata';

export interface FilterDraft {
  name: string;
  field: string;
  operator: string;
  value?: unknown;
  type: string;
}

export function createFilterDraft(table: BuilderDataTable | null): FilterDraft {
  const candidate = preferredFilterCandidate(table);
  if (!candidate) {
    return {
      name: 'Dashboard Filter',
      field: '',
      operator: 'equals',
      type: 'interactive'
    };
  }
  return filterDraftFromCandidate(candidate);
}

export function createRecommendedFilterDrafts(table: BuilderDataTable | null): FilterDraft[] {
  const seen = new Set<string>();
  return recommendedFilterCandidates(table)
    .filter(candidate => {
      if (!candidate.field.name || seen.has(candidate.field.name)) return false;
      seen.add(candidate.field.name);
      return true;
    })
    .map(filterDraftFromCandidate)
    .slice(0, 4);
}

function preferredFilterCandidate(table: BuilderDataTable | null): FieldCandidate | null {
  return recommendedFilterCandidates(table)[0] ?? null;
}

function recommendedFilterCandidates(table: BuilderDataTable | null): FieldCandidate[] {
  const fields = table?.fields ?? [];
  const routing = routingMetadata(table);
  const explicitNames = [
    ...filterNamesFromConfig(routing.defaultFilters),
    ...readStringArray(routing.filterFields)
  ];
  const explicit = explicitNames.flatMap(name => candidateForField(table, fields.find(field => field.name === name)));
  const primaryTimeField = readString(routing.primaryTimeField);
  const primaryTime = primaryTimeField
    ? candidateForField(table, fields.find(field => field.name === primaryTimeField))
    : [];
  const filterable = fields
    .map(field => candidateForField(table, field)[0])
    .filter((candidate): candidate is FieldCandidate => Boolean(candidate))
    .filter(candidate => candidate.role === 'filter' || readBoolean(candidate.metadata.filterable));
  const timeFields = fields
    .map(field => candidateForField(table, field)[0])
    .filter((candidate): candidate is FieldCandidate => candidate !== undefined && candidate.role === 'time');
  const dimensions = fields
    .map(field => candidateForField(table, field)[0])
    .filter((candidate): candidate is FieldCandidate => candidate !== undefined && candidate.role === 'dimension');
  return [...explicit, ...primaryTime, ...filterable, ...timeFields, ...dimensions];
}

function filterDraftFromCandidate(candidate: FieldCandidate): FilterDraft {
  const operator = readString(candidate.metadata.defaultOperator)
    ?? readString(candidate.metadata.operator)
    ?? (readString(candidate.metadata.inputType) === 'multi-select' ? 'in' : candidate.role === 'time' ? 'last' : 'equals');
  const type = readString(candidate.metadata.inputType)
    ?? readString(candidate.metadata.filterType)
    ?? (candidate.role === 'time' ? 'date-range' : operator === 'in' ? 'multi-select' : 'interactive');
  const defaultValue = candidate.role === 'time'
    ? readString(candidate.metadata.defaultRange) ?? '30 days'
    : candidate.metadata.defaultValue;
  return {
    name: fieldLabel(candidate),
    field: candidate.field.name,
    operator,
    ...(defaultValue !== undefined ? { value: defaultValue } : {}),
    type
  };
}

function fieldLabel(candidate: FieldCandidate): string {
  if (candidate.role === 'time') {
    return readString(candidate.metadata.label)
      ?? readString(candidate.metadata.businessName)
      ?? candidate.field.label
      ?? 'Date Range';
  }
  return readString(candidate.metadata.label)
    ?? readString(candidate.metadata.businessName)
    ?? candidate.field.label
    ?? toLabel(candidate.field.name);
}

function filterNamesFromConfig(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (typeof item === 'string') return [item];
      if (!isRecord(item)) return [];
      const field = readString(item.field) ?? readString(item.name);
      return field ? [field] : [];
    });
  }
  return [];
}

function toLabel(value: string): string {
  return value.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
