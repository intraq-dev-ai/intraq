import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  isRecord,
  readString,
  uniqueStrings
} from './analyzer-plan-utils.js';
import {
  analyzerFieldIsDimension,
  analyzerFieldIsMeasure,
  analyzerFieldTokens,
  analyzerTokensFromText
} from './analyzer-plan-field-matching.js';
import {
  analyzerVisibleFieldNames,
  analyzerVisibleFields
} from './analyzer-plan-field-visibility.js';
import {
  derivedColumnMatchesQuestion,
  derivedColumnSourceFields,
  derivedColumnTokens,
  derivedColumnsForTable
} from './analyzer-plan-derived-columns.js';
import {
  hasTemporalQuestionIntent,
  primaryTimeFieldNamesForTable,
  questionMentionsFieldForAnswerColumn,
  removeUnrequestedDetailColumns
} from './analyzer-plan-answer-column-normalizer.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

type AnalyzerActionStep = AnalyzerActionPlanResponse['actions'][number];

export function normalizeAnalyzerActionStepsForBuild(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  question: string
): AnalyzerActionStep[] {
  let derivedActions = normalizeCalculatedFieldExpressions(actions, table, question);
  derivedActions = ensureMetadataDerivedColumnActions(derivedActions, table, question);
  derivedActions = ensureKnownCalculatedColumnsHaveActions(derivedActions, table);
  derivedActions = removeUnrequestedDetailColumns(derivedActions, table, question);
  const createTableIndex = derivedActions.findIndex(action => action.action === 'create_table');
  const createTableAction = createTableIndex >= 0 ? derivedActions[createTableIndex] : null;
  if (createTableAction && !createTableNeedsSourceColumns(createTableAction, table)) {
    return replaceAction(
      derivedActions,
      createTableIndex,
      addMissingQuestionColumns(createTableAction, derivedActions, table, question)
    );
  }

  const columns = sourceColumnsForPlan(derivedActions, table, question);
  if (columns.length === 0) return derivedActions;
  const normalizedCreateTable: AnalyzerActionStep = {
    action: 'create_table',
    params: {
      ...(createTableAction?.params ?? {}),
      columns
    }
  };
  if (createTableIndex < 0) return [normalizedCreateTable, ...derivedActions];
  return replaceAction(derivedActions, createTableIndex, normalizedCreateTable);
}

function normalizeCalculatedFieldExpressions(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  question: string
): AnalyzerActionStep[] {
  return actions.map(action => {
    if (action.action !== 'add_calculated_field') return action;
    const expression = readString(action.params.expression)
      ?? readString(action.params.formula)
      ?? readString(action.params.calculation);
    const metadataColumn = metadataDerivedColumnForCalculatedAction(action, table, question);
    const normalizedExpression = metadataColumn?.formula ?? normalizedExpressionFor(expression, table);
    const currentName = readString(action.params.name)
      ?? readString(action.params.field)
      ?? readString(action.params.key);
    const canonicalName = metadataColumn?.name ?? currentName;
    return normalizedExpression || canonicalName ? {
      action: action.action,
      params: {
        ...action.params,
        ...(canonicalName ? { name: canonicalName } : {}),
        ...(normalizedExpression ? { expression: normalizedExpression } : {})
      }
    } : action;
  });
}

function metadataDerivedColumnForCalculatedAction(
  action: AnalyzerActionStep,
  table: TableDefinition,
  question: string
) {
  const columns = derivedColumnsForTable(table);
  const expression = readString(action.params.expression)
    ?? readString(action.params.formula)
    ?? readString(action.params.calculation);
  const expressionMatches = expression ? columns.filter(column => {
    const sourceFields = derivedColumnSourceFields(table, column);
    return sourceFields.length > 0 && expressionIncludesFields(expression, sourceFields);
  }) : [];
  if (expressionMatches.length > 0) {
    const questionMatch = bestDerivedColumnMatchForQuestion(expressionMatches, question);
    if (questionMatch) return questionMatch;
  }
  const name = readString(action.params.name)
    ?? readString(action.params.field)
    ?? readString(action.params.key);
  if (name) {
    const nameMatch = columns.find(column => column.name === name || derivedColumnMatchesQuestion(column, name));
    if (nameMatch) return nameMatch;
  }
  if (!expression) return null;
  return expressionMatches.length === 1 ? expressionMatches[0] ?? null : null;
}

function bestDerivedColumnMatchForQuestion(
  columns: ReturnType<typeof derivedColumnsForTable>,
  question: string
) {
  const questionTokens = new Set(analyzerTokensFromText(question));
  const matches = columns
    .filter(column => derivedColumnMatchesQuestion(column, question))
    .map((column, index) => ({
      column,
      index,
      score: derivedColumnQuestionScore(column, questionTokens)
    }))
    .filter(match => match.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return matches.length > 0 && matches[0]?.score !== matches[1]?.score ? matches[0]?.column ?? null : null;
}

function ensureMetadataDerivedColumnActions(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  question: string
): AnalyzerActionStep[] {
  let next = actions;
  const createColumns = readColumnFields(actions.find(action => action.action === 'create_table')?.params.columns);
  for (const column of derivedColumnsForTable(table)) {
    const sourceFields = derivedColumnSourceFields(table, column);
    if (sourceFields.length === 0) continue;
    const mentioned = derivedColumnMatchesQuestion(column, question) || createColumns.includes(column.name);
    if (!mentioned) continue;
    if (next.some(action => calculatedActionMatches(action, column.name, sourceFields))) continue;
    if (hasQuestionPreferredSiblingDerivedAction(next, table, column, question)) continue;
    next = [...next, {
      action: 'add_calculated_field',
      params: {
        expression: column.formula,
        name: column.name
      }
    }];
  }
  return next;
}

function hasQuestionPreferredSiblingDerivedAction(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  column: ReturnType<typeof derivedColumnsForTable>[number],
  question: string
): boolean {
  const questionTokens = new Set(analyzerTokensFromText(question));
  const columnScore = derivedColumnQuestionScore(column, questionTokens);
  if (columnScore === 0) return false;
  const columnSourceFields = derivedColumnSourceFields(table, column);
  return calculatedFieldNames(actions).some(fieldName => {
    if (fieldName === column.name) return false;
    const sibling = derivedColumnsForTable(table).find(item => item.name === fieldName);
    if (!sibling) return false;
    return sameStringSet(derivedColumnSourceFields(table, sibling), columnSourceFields)
      && derivedColumnQuestionScore(sibling, questionTokens) >= columnScore;
  });
}

function derivedColumnQuestionScore(
  column: ReturnType<typeof derivedColumnsForTable>[number],
  questionTokens: Set<string>
): number {
  return uniqueStrings(derivedColumnTokens(column)).filter(token => questionTokens.has(token)).length;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(item => rightSet.has(item));
}

function ensureKnownCalculatedColumnsHaveActions(
  actions: AnalyzerActionStep[],
  table: TableDefinition
): AnalyzerActionStep[] {
  const createTable = actions.find(action => action.action === 'create_table');
  const columns = readColumnFields(createTable?.params.columns);
  let next = actions;
  for (const column of derivedColumnsForTable(table)) {
    if (!columns.includes(column.name)) continue;
    const sourceFields = derivedColumnSourceFields(table, column);
    if (next.some(action => calculatedActionMatches(action, column.name, sourceFields))) continue;
    next = [...next, {
      action: 'add_calculated_field',
      params: { expression: column.formula, name: column.name }
    }];
  }
  return next;
}

function addMissingQuestionColumns(
  action: AnalyzerActionStep,
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  question: string
): AnalyzerActionStep {
  const existing = new Set(readColumnFields(action.params.columns));
  const missingColumns = sourceColumnsForPlan(actions, table, question).filter(column => !existing.has(column.field));
  if (missingColumns.length === 0) return action;
  const missingDimensions = missingColumns.filter(column => readString(column.summarize) === 'none');
  const missingMeasures = missingColumns.filter(column => readString(column.summarize) !== 'none');
  const columns = Array.isArray(action.params.columns) ? [...action.params.columns] : [];
  return {
    action: action.action,
    params: {
      ...action.params,
      columns: [
        ...missingDimensions,
        ...columns,
        ...missingMeasures
      ]
    }
  };
}

function createTableNeedsSourceColumns(action: AnalyzerActionStep, table: TableDefinition): boolean {
  const validFields = analyzerVisibleFieldNames(table);
  const columns = readColumnFields(action.params.columns);
  return columns.length === 0 || columns.every(field => !validFields.has(field));
}

function sourceColumnsForPlan(
  actions: AnalyzerActionStep[],
  table: TableDefinition,
  question: string
): Array<Record<string, unknown> & { field: string }> {
  const expressionFields = expressionSourceFields(actions, table);
  const measureFields = uniqueStrings([
    ...expressionFields,
    ...measureFieldsForQuestion(table, question)
  ]);
  const calculatedFields = metadataCalculatedFieldNames(actions, table);
  if (measureFields.length === 0 && calculatedFields.length === 0) return [];
  return uniqueStrings([
    ...dimensionFieldsForQuestion(table, question),
    ...measureFields,
    ...calculatedFields
  ]).map(fieldName => {
    const field = table.fields.find(item => item.name === fieldName);
    return {
      field: fieldName,
      summarize: field ? summarizeForField(field) : summarizeForCalculatedField(fieldName)
    };
  });
}

function expressionSourceFields(actions: AnalyzerActionStep[], table: TableDefinition): string[] {
  const expressions = actions.flatMap(action => {
    if (action.action !== 'add_calculated_field') return [];
    const expression = readString(action.params.expression)
      ?? readString(action.params.formula)
      ?? readString(action.params.calculation);
    return expression ? [expression.toLowerCase()] : [];
  });
  if (expressions.length === 0) return [];
  return analyzerVisibleFields(table)
    .filter(field => expressions.some(expression => expression.includes(field.name.toLowerCase())))
    .map(field => field.name);
}

function calculatedActionMatches(
  action: AnalyzerActionStep,
  fieldName: string,
  _sourceFields: string[]
): boolean {
  if (action.action !== 'add_calculated_field') return false;
  const name = readString(action.params.name)
    ?? readString(action.params.field)
    ?? readString(action.params.key);
  return name === fieldName;
}

function dimensionFieldsForQuestion(table: TableDefinition, question: string): string[] {
  const tokens = new Set(analyzerTokensFromText(question));
  const mentionedDimensions = analyzerVisibleFields(table)
    .filter(field => analyzerFieldIsDimension(table, field))
    .filter(field => questionMentionsFieldForAnswerColumn(question, table, field))
    .map(field => field.name);

  if (hasTemporalQuestionIntent(question)) {
    mentionedDimensions.push(...primaryTimeFieldNamesForTable(table));
  } else if (
    hasField(table, 'business_date')
    && hasAnyToken(tokens, ['date', 'day', 'daily', 'week', 'month', 'period', 'trend', 'drop'])
  ) {
    mentionedDimensions.push('business_date');
  }
  return uniqueStrings(mentionedDimensions);
}

function measureFieldsForQuestion(table: TableDefinition, question: string): string[] {
  const questionTokens = new Set(analyzerTokensFromText(question));
  return analyzerVisibleFields(table)
    .filter(field => analyzerFieldIsMeasure(table, field))
    .filter(field => analyzerFieldTokens(table, field).some(token => questionTokens.has(token)))
    .map(field => field.name);
}

function normalizedExpressionFor(expression: string | null, table: TableDefinition): string | null {
  if (!expression) return null;
  const column = derivedColumnsForTable(table).find(item => {
    const sourceFields = derivedColumnSourceFields(table, item);
    return sourceFields.length > 0 && expressionIncludesFields(expression, sourceFields);
  });
  return column?.formula ?? null;
}

function expressionIncludesFields(expression: string, fields: string[]): boolean {
  const lowered = expression.toLowerCase();
  return fields.every(field => lowered.includes(field.toLowerCase()));
}

function calculatedFieldNames(actions: AnalyzerActionStep[]): string[] {
  return actions.flatMap(action => {
    if (action.action !== 'add_calculated_field') return [];
    const name = readString(action.params.name)
      ?? readString(action.params.field)
      ?? readString(action.params.key);
    return name ? [name] : [];
  });
}

function metadataCalculatedFieldNames(actions: AnalyzerActionStep[], table: TableDefinition): string[] {
  const metadataNames = new Set(derivedColumnsForTable(table).map(column => column.name));
  return calculatedFieldNames(actions).filter(fieldName => metadataNames.has(fieldName));
}

function summarizeForCalculatedField(fieldName: string): string {
  const lowered = fieldName.toLowerCase();
  if (lowered.includes('average') || lowered.includes('avg') || lowered.includes('percent') || lowered.includes('rate')) {
    return 'avg';
  }
  if (lowered.includes('margin') && !lowered.includes('dollar')) return 'avg';
  return 'sum';
}

function replaceAction(
  actions: AnalyzerActionStep[],
  index: number,
  replacement: AnalyzerActionStep
): AnalyzerActionStep[] {
  return actions.map((action, actionIndex) => actionIndex === index ? replacement : action);
}

function summarizeForField(field: TableDefinition['fields'][number]): string {
  if (field.type === 'date' || field.type === 'string') return 'none';
  const name = field.name.toLowerCase();
  const description = `${field.description} ${field.dictionaryDescription}`.toLowerCase();
  if (name.includes('percent') || name.includes('margin') || description.includes('rate')) return 'avg';
  return 'sum';
}

function readColumnFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const field = readColumnField(item);
    return field ? [field] : [];
  });
}

function readColumnField(value: unknown): string {
  const record = typeof value === 'string' ? { field: value } : isRecord(value) ? value : null;
  return readString(record?.field) ?? readString(record?.name) ?? '';
}

function hasField(table: TableDefinition, fieldName: string): boolean {
  return analyzerVisibleFieldNames(table).has(fieldName);
}

function hasAnyToken(tokens: Set<string>, candidates: string[]): boolean {
  return candidates.some(candidate => tokens.has(candidate));
}
