import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  isRecord,
  readString,
  uniqueStrings
} from './analyzer-plan-utils.js';
import {
  analyzerFieldMetadata,
  analyzerFieldIsDimension,
  analyzerFieldIsMeasure,
  analyzerFieldTokens,
  analyzerTokensFromText,
  analyzerTokensFromUnknown
} from './analyzer-plan-field-matching.js';
import {
  analyzerFieldIsVisible,
  analyzerVisibleFieldNames
} from './analyzer-plan-field-visibility.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

type AnalyzerActionStep = AnalyzerActionPlanResponse['actions'][number];

export function removeUnrequestedDetailColumns(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  question: string
): AnalyzerActionStep[] {
  const createTableIndex = actions.findIndex(action => action.action === 'create_table');
  const createTableAction = createTableIndex >= 0 ? actions[createTableIndex] : null;
  const columns = Array.isArray(createTableAction?.params.columns) ? createTableAction.params.columns : [];
  if (!createTableAction || columns.length === 0) return actions;

  const hasMeasureColumn = columns.some(column => {
    const fieldName = readColumnField(column);
    const field = table.fields.find(item => item.name === fieldName);
    return field ? analyzerFieldIsMeasure(table, field) : readString(column.summarize) !== 'none';
  });
  const primaryTimeFields = new Set(primaryTimeFieldNamesForTable(table));
  const hasTemporalIntent = hasTemporalQuestionIntent(question);

  const filteredColumns = columns.filter(column => {
    const fieldName = readColumnField(column);
    const field = table.fields.find(item => item.name === fieldName);
    if (!field) return true;
    if (!analyzerFieldIsVisible(table, field)) return false;
    if (analyzerFieldIsMeasure(table, field)) return true;
    if (questionMentionsFieldForAnswerColumn(question, table, field)) return true;
    if (hasTemporalIntent && primaryTimeFields.has(field.name)) return true;
    if (analyzerFieldIsIdentifier(table, field)) return false;
    if (hasMeasureColumn && analyzerFieldIsDimension(table, field)) return false;
    return true;
  });
  if (filteredColumns.length === columns.length || filteredColumns.length === 0) return actions;
  return actions.map((action, actionIndex) => actionIndex === createTableIndex ? {
    action: createTableAction.action,
    params: {
      ...createTableAction.params,
      columns: filteredColumns
    }
  } : action);
}

export function questionMentionsFieldForAnswerColumn(
  question: string,
  table: TableDefinition,
  field: TableDefinition['fields'][number]
): boolean {
  if (!analyzerFieldIsVisible(table, field)) return false;
  const questionTokens = new Set(analyzerTokensFromText(question));
  const strongTokens = analyzerFieldTokens(table, field)
    .filter(token => !LOW_INFORMATION_FIELD_MATCH_TOKENS.has(token));
  if (strongTokens.some(token => questionTokens.has(token))) return true;

  const fieldNameTokens = analyzerTokensFromText(field.name);
  return fieldNameTokens.length > 1 && fieldNameTokens.every(token => questionTokens.has(token));
}

export function primaryTimeFieldNamesForTable(table: TableDefinition): string[] {
  const ai = isRecord(table.dictionary.ai) ? table.dictionary.ai : {};
  const routing = isRecord(ai.routing)
    ? ai.routing
    : isRecord(table.dictionary.routing)
      ? table.dictionary.routing
      : {};
  return uniqueStrings([
    readString(table.settings?.primaryTimeField),
    readString(table.dictionary.primaryTimeField),
    readString(ai.primaryTimeField),
    readString(routing.primaryTimeField)
  ].filter((fieldName): fieldName is string => fieldName !== null)).filter(fieldName => hasField(table, fieldName));
}

export function hasTemporalQuestionIntent(question: string): boolean {
  const tokens = new Set(analyzerTokensFromText(question));
  return ['date', 'day', 'daily', 'week', 'weekly', 'month', 'monthly', 'period', 'trend', 'drop']
    .some(candidate => tokens.has(candidate));
}

function readColumnField(value: unknown): string {
  const record = typeof value === 'string' ? { field: value } : isRecord(value) ? value : null;
  return readString(record?.field) ?? readString(record?.name) ?? '';
}

function analyzerFieldIsIdentifier(table: TableDefinition, field: TableDefinition['fields'][number]): boolean {
  const metadata = analyzerFieldMetadata(table, field.name);
  const roleValues = [
    field.role,
    field.columnType,
    field.semanticRole,
    metadata.role,
    metadata.columnType,
    metadata.semanticRole,
    metadata.metricType
  ].map(value => readString(value)?.toLowerCase()).filter(isPresent);
  if (roleValues.some(value => ['foreign_key', 'identifier', 'join key', 'join_key', 'primary_key'].includes(value))) return true;
  const tokens = analyzerTokensFromUnknown([
    field.name,
    field.description,
    field.dictionaryDescription,
    metadata.name,
    metadata.businessName,
    metadata.label,
    metadata.description,
    metadata.dictionaryDescription,
    metadata.businessDefinition
  ]);
  return tokens.includes('identifier') || tokens.includes('id') && !tokens.includes('paid');
}

const LOW_INFORMATION_FIELD_MATCH_TOKENS = new Set([
  'a',
  'an',
  'and',
  'are',
  'by',
  'can',
  'count',
  'date',
  'day',
  'for',
  'from',
  'give',
  'id',
  'identifier',
  'last',
  'me',
  'month',
  'my',
  'name',
  'of',
  'on',
  'or',
  'please',
  'record',
  'report',
  'sale',
  'source',
  'status',
  'the',
  'to',
  'total',
  'transaction',
  'type',
  'value',
  'week',
  'what',
  'with',
  'year',
  'you'
]);

function isPresent<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}

function hasField(table: TableDefinition, fieldName: string): boolean {
  return analyzerVisibleFieldNames(table).has(fieldName);
}
