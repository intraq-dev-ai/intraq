import type {
  AnalyzerExecution,
  AnalyzerPlan,
  AnalyzerPlanAction,
  AnalyzerSelectedModel
} from './types';

export type AnalyzerEvidenceStatus = 'executed' | 'passed' | 'review';

export interface AnalyzerEvidenceScopeItem {
  label: string;
  text: string;
}

export interface AnalyzerAnswerEvidence {
  columns: string[];
  coverage: string;
  domain: string;
  grain: string;
  integrityNote: string;
  knowledgeReferences: string[];
  matchingRows: number | null;
  modelName: string;
  modelVersion: string;
  primaryTimeField: string;
  queryHash: string;
  resultHash: string;
  returnedRows: number | null;
  scope: AnalyzerEvidenceScopeItem[];
  semanticAssurance: string;
  sql: string;
  status: AnalyzerEvidenceStatus;
  statusDescription: string;
  statusLabel: string;
  tableName: string;
}

const BUSINESS_ACRONYMS = new Set([
  'api', 'id', 'sql', 'utc'
]);

export function buildAnalyzerAnswerEvidence(
  execution: AnalyzerExecution,
  plan: AnalyzerPlan | null = null
): AnalyzerAnswerEvidence {
  const preservedFact = verifiedFact(execution);
  const preservedSource = readRecord(preservedFact?.source);
  const preservedScope = readRecord(preservedFact?.scope);
  const preservedQuery = readRecord(preservedFact?.query);
  const preservedResult = readRecord(preservedFact?.result);
  const assurance = readRecord(preservedFact?.assurance);
  const executionContract = preservedExecutionContract(execution);
  const executedScope = executionScope(executionContract);
  const executionIntegrity = readRecord(executionContract?.integrity);
  const action = matchingAction(plan, execution);
  const selectedModel = matchingSelectedModel(plan, execution, action);
  const status = evidenceStatus(plan?.validation);
  const hasPreservedScope = preservedScope !== null;
  const scope = hasPreservedScope
    ? scopeItemsFromPreservedContract(preservedScope)
    : executedScope
      ? scopeItemsFromPreservedContract(executedScope)
    : scopeItemsFromAction(action);
  const queryHash = readString(preservedQuery?.queryHash) || readString(executionIntegrity?.queryHash);
  const resultHash = readString(preservedResult?.resultHash) || readString(executionIntegrity?.resultHash);
  const tableName = readString(preservedSource?.tableName) || execution.tableName;
  const modelName = readString(preservedSource?.dataModelName)
    || readString(execution.dataModelName)
    || readString(selectedModel?.businessName)
    || readString(selectedModel?.name)
    || tableName;
  return {
    columns: uniqueStrings((execution.columns ?? []).map(column => column.label || businessLabel(column.field))),
    coverage: coverageLabel(readString(preservedResult?.coverage)),
    domain: readString(selectedModel?.domain),
    grain: readString(selectedModel?.grain),
    integrityNote: queryHash || resultHash
      ? 'Integrity fingerprints show whether the preserved query or result changed. They do not prove the business definition is correct.'
      : '',
    knowledgeReferences: uniqueStrings(plan?.intentDetails?.knowledgeReferences.map(reference => reference.title) ?? []),
    matchingRows: readNumber(execution.totalRows) ?? readNumber(execution.rowCount),
    modelName,
    modelVersion: readString(preservedSource?.dataModelVersion),
    primaryTimeField: businessLabel(readString(selectedModel?.primaryTimeField)),
    queryHash,
    resultHash,
    returnedRows: readNumber(preservedResult?.returnedRows)
      ?? readNumber(execution.fetchedRows)
      ?? execution.rows?.length
      ?? null,
    scope,
    semanticAssurance: semanticAssuranceLabel(readString(assurance?.semantic)),
    sql: readString(preservedQuery?.sql) || readString(execution.sql) || readString(plan?.intentDetails?.sql),
    status,
    statusDescription: statusDescription(status),
    statusLabel: statusLabel(status),
    tableName
  };
}

function verifiedFact(execution: AnalyzerExecution): Record<string, unknown> | null {
  const record = execution as unknown as Record<string, unknown>;
  const fact = readRecord(record.verifiedFact);
  return fact && readNumber(fact.schemaVersion) === 1 ? fact : null;
}

function preservedExecutionContract(execution: AnalyzerExecution): Record<string, unknown> | null {
  const record = execution as unknown as Record<string, unknown>;
  const contract = readRecord(record.executionContract);
  return contract && readNumber(contract.schemaVersion) === 1 ? contract : null;
}

function executionScope(contract: Record<string, unknown> | null): Record<string, unknown> | null {
  const request = readRecord(contract?.request);
  if (!request) return null;
  const visualization = readRecord(request.visualization);
  const chartConfig = readRecord(request.chartConfig);
  return {
    filters: visualization?.filters ?? chartConfig?.filters ?? [],
    parameterValues: request.parameterValues ?? {},
    sort: visualization?.sort ?? chartConfig?.sort ?? [],
    ...(visualization?.limit !== undefined || request.limit !== undefined
      ? { limit: visualization?.limit ?? request.limit }
      : {})
  };
}

function matchingAction(plan: AnalyzerPlan | null, execution: AnalyzerExecution): AnalyzerPlanAction | null {
  const actions = plan?.actions.filter(action => action.action === 'create_table') ?? [];
  const modelId = readString(execution.dataModelId);
  return actions.find(action => {
    const actionModelId = readString(action.params._dataSourceTableId)
      || readString(action.params.dataSourceTableId);
    return Boolean(modelId && actionModelId === modelId);
  }) ?? actions.find(action => {
    const tableName = readString(action.params._tableName) || readString(action.params.tableName);
    return tableName === execution.tableName;
  }) ?? actions[0] ?? null;
}

function matchingSelectedModel(
  plan: AnalyzerPlan | null,
  execution: AnalyzerExecution,
  action: AnalyzerPlanAction | null
): AnalyzerSelectedModel | null {
  const models = plan?.intentDetails?.selectedModels ?? [];
  const modelId = readString(execution.dataModelId)
    || readString(action?.params._dataSourceTableId)
    || readString(action?.params.dataSourceTableId);
  const tableName = execution.tableName;
  return models.find(model => model.id === modelId || model.name === tableName)
    ?? plan?.intentDetails?.selectedModel
    ?? null;
}

function scopeItemsFromAction(action: AnalyzerPlanAction | null): AnalyzerEvidenceScopeItem[] {
  return uniqueScopeItems([
    ...filterScopeItems(action?.params.filters),
    ...filterScopeItems(action?.params.filter),
    ...parameterScopeItems(action?.params.parameterValues)
  ]);
}

function scopeItemsFromPreservedContract(scope: Record<string, unknown>): AnalyzerEvidenceScopeItem[] {
  const items = [
    ...filterScopeItems(scope.filters),
    ...parameterScopeItems(scope.parameterValues)
  ];
  const timeZone = readString(scope.timeZone);
  const limit = readNumber(scope.limit);
  if (timeZone) items.push({ label: 'Time Zone', text: `Time Zone is ${timeZone}` });
  if (limit !== null) items.push({ label: 'Row Limit', text: `Row Limit is ${limit}` });
  for (const sort of readRecordArray(scope.sort)) {
    const field = filterLabel(sort);
    const direction = readString(sort.direction) || readString(sort.order);
    if (field) items.push({ label: 'Sort', text: `Sort by ${field}${direction ? ` ${direction.toUpperCase()}` : ''}` });
  }
  return uniqueScopeItems(items);
}

function filterScopeItems(value: unknown): AnalyzerEvidenceScopeItem[] {
  return readRecordArray(value).flatMap(filter => {
    const label = filterLabel(filter);
    const renderedValue = renderValue(filter.value ?? filter.values);
    if (!label) return [];
    const operator = operatorLabel(readString(filter.operator));
    return [{
      label,
      text: `${label} ${operator}${renderedValue ? ` ${renderedValue}` : ''}`.trim()
    }];
  });
}

function parameterScopeItems(value: unknown): AnalyzerEvidenceScopeItem[] {
  const parameters = readRecord(value);
  if (!parameters) return [];
  return Object.entries(parameters).flatMap(([field, parameterValue]) => {
    const renderedValue = renderValue(parameterValue);
    if (!renderedValue) return [];
    const label = businessLabel(field);
    return [{ label, text: `${label} is ${renderedValue}` }];
  });
}

function filterLabel(filter: Record<string, unknown>): string {
  return readString(filter.businessName)
    || readString(filter.label)
    || businessLabel(readString(filter.field) || readString(filter.name) || readString(filter.column));
}

function evidenceStatus(value: unknown): AnalyzerEvidenceStatus {
  const validation = readRecord(value);
  if (!validation) return 'executed';
  const checks = readRecordArray(validation.checks);
  const status = readString(validation.status).toLowerCase();
  if (status === 'failed' || status === 'warning' || checks.some(check => ['failed', 'warning'].includes(readString(check.status)))) {
    return 'review';
  }
  if (status === 'passed' || validation.valid === true || checks.some(check => readString(check.status) === 'passed')) {
    return 'passed';
  }
  return 'executed';
}

function statusLabel(status: AnalyzerEvidenceStatus): string {
  if (status === 'passed') return 'Plan checks passed';
  if (status === 'review') return 'Needs review';
  return 'Query executed';
}

function statusDescription(status: AnalyzerEvidenceStatus): string {
  if (status === 'passed') return 'The plan passed schema and execution-scope checks before the query ran.';
  if (status === 'review') return 'Plan checks returned a warning or incomplete evidence. Review the applied scope and SQL.';
  return 'The query ran, but plan-check evidence was not preserved with this result.';
}

function operatorLabel(value: string): string {
  const labels: Record<string, string> = {
    between: 'between', contains: 'contains', ends_with: 'ends with', gt: '>', gte: '>=', in: 'in',
    lt: '<', lte: '<=', neq: 'is not', not_equals: 'is not', not_in: 'not in', one_of: 'in',
    starts_with: 'starts with'
  };
  return labels[value.trim().toLowerCase()] ?? 'is';
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) {
    const values = value.map(renderValue).filter(Boolean);
    return values.length === 2 ? `${values[0]} and ${values[1]}` : values.join(', ');
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return '';
}

function coverageLabel(value: string): string {
  const labels: Record<string, string> = {
    complete: 'Complete result', requested_limit: 'Requested row limit', safety_limited: 'Safety row limit', unknown: 'Unknown'
  };
  return labels[value] ?? '';
}

function semanticAssuranceLabel(value: string): string {
  if (value === 'approved') return 'Approved semantic model';
  return value ? 'Semantic status unknown' : '';
}

function businessLabel(value: string): string {
  return value.trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => BUSINESS_ACRONYMS.has(part.toLowerCase()) ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function uniqueScopeItems(items: AnalyzerEvidenceScopeItem[]): AnalyzerEvidenceScopeItem[] {
  return [...new Map(items.map(item => [item.text, item])).values()];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  const record = readRecord(value);
  return record ? [record] : [];
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
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
