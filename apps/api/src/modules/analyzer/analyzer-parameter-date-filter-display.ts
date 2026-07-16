import { findDataSource, type TableDefinition } from '../data-source/foundation-store.js';
import {
  analyzerParameterDateRangeForDisplay,
  type DateRange
} from './analyzer-plan-parameter-values.js';
import { isRecord, readString } from './analyzer-plan-utils.js';

export function analyzerParameterDateRangeForAnswer(
  body: unknown,
  plan: Record<string, unknown> | null,
  params: Record<string, unknown>
): DateRange | null {
  const values = isRecord(params.parameterValues) ? params.parameterValues : null;
  if (!values) return null;
  const pair = parameterDateRangePair(values);
  if (!pair) return null;
  const table = parameterTableForAnswer(body, plan, params);
  return table
    ? analyzerParameterDateRangeForDisplay(table, pair, pair.endParameterName)
    : pair;
}

function parameterTableForAnswer(
  body: unknown,
  plan: Record<string, unknown> | null,
  params: Record<string, unknown>
): TableDefinition | null {
  const dataSourceId = isRecord(body) ? readString(body.dataSourceId) : null;
  const source = dataSourceId ? findDataSource(dataSourceId) : null;
  if (!source) return null;
  const intentDetails = isRecord(plan?.intentDetails) ? plan.intentDetails : null;
  const selectedModel = isRecord(intentDetails?.selectedModel) ? intentDetails.selectedModel : null;
  const candidates = [
    readString(params._tableName),
    readString(params.tableName),
    readString(selectedModel?.id),
    readString(selectedModel?.name)
  ].filter((value): value is string => value !== null);
  return source.tables.find(table => candidates.includes(table.id) || candidates.includes(table.name)) ?? null;
}

interface ParameterDateRangePair extends DateRange {
  endParameterName: string;
}

function parameterDateRangePair(values: Record<string, unknown>): ParameterDateRangePair | null {
  const entries: Array<[string, string]> = [
    ['fromDate', 'toDate'],
    ['from_date', 'to_date'],
    ['startDate', 'endDate'],
    ['start_date', 'end_date'],
    ['from', 'to'],
    ['start', 'end']
  ];
  for (const [fromKey, toKey] of entries) {
    const from = readString(values[fromKey]);
    const to = readString(values[toKey]);
    if (from && to) return { endParameterName: toKey, from, to };
  }
  return null;
}
