import { findExecutableAnalyzerActions, readActionTableName } from './intent';
import type {
  AnalyzerAnswer,
  AnalyzerExecution,
  AnalyzerPlan,
  AnalyzerPlanAction,
  AnalyzerSelectedModel
} from './types';

export function buildAnalyzerRunTraceMetadata(input: {
  answer: AnalyzerAnswer | null;
  dataSourceId: string;
  executions: AnalyzerExecution[];
  plan: AnalyzerPlan;
}): Record<string, unknown> {
  const knowledgeReferences = uniqueStrings(
    (input.answer?.knowledgeReferences ?? input.plan.intentDetails?.knowledgeReferences ?? [])
      .map(reference => reference.title)
  );
  const sources = input.executions.map(execution =>
    compactAnswerSource(input.plan, execution, input.dataSourceId, knowledgeReferences)
  );
  return {
    answerBasis: {
      executionCount: sources.length,
      knowledgeReferences,
      sources
    }
  };
}

function compactAnswerSource(
  plan: AnalyzerPlan,
  execution: AnalyzerExecution,
  defaultDataSourceId: string,
  knowledgeReferences: string[]
): Record<string, unknown> {
  const action = matchingAction(plan, execution);
  const selectedModel = matchingSelectedModel(plan, execution, action);
  const title = readString(execution.title)
    || readString(execution.dataModelName)
    || readString(selectedModel?.businessName)
    || readString(selectedModel?.name)
    || execution.tableName;
  const columns = uniqueStrings((execution.columns ?? [])
    .map(column => readString(column.label) || column.field)
    .slice(0, 12));
  const filters = uniqueStrings([
    ...filterSummaries(action?.params.filters),
    ...filterSummaries(action?.params.filter),
    ...parameterValueSummaries(action?.params.parameterValues)
  ]);
  const rowCount = readNumber(execution.totalRows) ?? readNumber(execution.rowCount);
  const fetchedRows = readNumber(execution.fetchedRows) ?? execution.rows?.length ?? null;
  const exactPlace = buildExactPlace(title, execution.tableName, columns);
  const source: Record<string, unknown> = {
    title,
    tableName: execution.tableName,
    dataSourceId: readString(execution.dataSourceId) || defaultDataSourceId,
    exactPlace,
    columns,
    filters,
    knowledgeReferences,
    rowCount,
    fetchedRows
  };
  const executionContract = execution.executionContract;
  if (executionContract) {
    source.executionId = executionContract.executionId;
    source.runId = executionContract.origin.runId;
    source.evidenceLevel = executionContract.evidenceLevel;
    source.requestFingerprint = executionContract.requestFingerprint;
    source.resultFingerprint = executionContract.resultFingerprint;
    if (executionContract.integrity?.modelHash) source.modelHash = executionContract.integrity.modelHash;
  }
  const modelId = readString(execution.dataModelId) || readString(selectedModel?.id);
  const modelName = readString(execution.dataModelName)
    || readString(selectedModel?.businessName)
    || readString(selectedModel?.name);
  const sql = compactSql(readString(execution.sql));
  if (modelId) source.dataModelId = modelId;
  if (modelName) source.dataModelName = modelName;
  if (sql) source.sql = sql;
  return source;
}

function matchingAction(plan: AnalyzerPlan, execution: AnalyzerExecution): AnalyzerPlanAction | null {
  const executionTable = execution.tableName.trim();
  const executionModelId = readString(execution.dataModelId);
  const actions = findExecutableAnalyzerActions(plan);
  return actions.find(action => {
    const actionModelId = readString(action.params._dataSourceTableId) || readString(action.params.dataSourceTableId);
    return !!executionModelId && !!actionModelId && executionModelId === actionModelId;
  }) ?? actions.find(action => readActionTableName(action) === executionTable) ?? actions[0] ?? null;
}

function matchingSelectedModel(
  plan: AnalyzerPlan,
  execution: AnalyzerExecution,
  action: AnalyzerPlanAction | null
): AnalyzerSelectedModel | null {
  const models = plan.intentDetails?.selectedModels ?? [];
  const executionModelId = readString(execution.dataModelId);
  const actionModelId = readString(action?.params._dataSourceTableId) || readString(action?.params.dataSourceTableId);
  const tableName = execution.tableName.trim();
  return models.find(model =>
    (!!executionModelId && model.id === executionModelId)
    || (!!actionModelId && model.id === actionModelId)
    || model.name === tableName
  ) ?? plan.intentDetails?.selectedModel ?? null;
}

function filterSummaries(value: unknown): string[] {
  const filters = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  return filters.flatMap(filter => {
    if (!isRecord(filter)) return [];
    const field = businessLabel(
      readString(filter.field)
      || readString(filter.name)
      || readString(filter.column)
    );
    if (!field) return [];
    const operator = operatorLabel(readString(filter.operator));
    const filterValue = filter.value ?? filter.values;
    const renderedValue = renderValue(filterValue);
    return [`${field} ${operator}${renderedValue ? ` ${renderedValue}` : ''}`.trim()];
  });
}

function parameterValueSummaries(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([field, parameterValue]) => {
    const renderedValue = renderValue(parameterValue);
    if (!renderedValue) return [];
    return [`${businessLabel(field)} is ${renderedValue}`];
  });
}

function operatorLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'between':
      return 'between';
    case 'in':
    case 'one_of':
      return 'in';
    case 'not_in':
      return 'not in';
    case 'contains':
      return 'contains';
    case 'starts_with':
      return 'starts with';
    case 'ends_with':
      return 'ends with';
    case 'gt':
    case '>':
      return '>';
    case 'gte':
    case '>=':
      return '>=';
    case 'lt':
    case '<':
      return '<';
    case 'lte':
    case '<=':
      return '<=';
    case 'neq':
    case 'not_equals':
      return 'is not';
    case 'equals':
    case '=':
    default:
      return 'is';
  }
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) {
    const rendered = value.map(item => renderValue(item)).filter(Boolean);
    if (rendered.length === 0) return '';
    if (rendered.length === 2) return `${rendered[0]} and ${rendered[1]}`;
    return rendered.join(', ');
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return '';
}

function buildExactPlace(title: string, tableName: string, columns: string[]): string {
  const columnText = columns.slice(0, 6).join(', ');
  if (columnText) return `${title} (${tableName}) > ${columnText}`;
  return `${title} (${tableName})`;
}

function compactSql(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= 500 ? normalized : `${normalized.slice(0, 499)}…`;
}

function businessLabel(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
