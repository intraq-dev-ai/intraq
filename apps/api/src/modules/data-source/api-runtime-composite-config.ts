import type { DataSourceRecord, TableDefinition } from './foundation-store.js';
import {
  type ApiRuntimeResult,
  type CompositeApiConfig,
  type CompositeApiJoinConditionConfig,
  type CompositeApiJoinStepConfig,
  type CompositeApiSegmentConfig,
  type CompositeApiSqlFragmentConfig,
  type CompositeApiStepConfig,
  type CompositeApiTransformStepConfig
} from './api-runtime-types.js';
import {
  boundedNumber,
  isRecord,
  readRecord,
  readString,
  readStringArray
} from './api-runtime-utils.js';

export function readCompositeApiConfig(source: DataSourceRecord, table: TableDefinition): ApiRuntimeResult<CompositeApiConfig | null> {
  const tableSettings = readRecord(table.settings);
  const tableApi = readRecord(tableSettings.api ?? tableSettings.request);
  const raw = readRecord(
    tableSettings.composite
      ?? tableSettings.workflow
      ?? tableSettings.dataWorkflow
      ?? tableApi.composite
      ?? tableApi.workflow
      ?? tableApi.dataWorkflow
      ?? source.config.composite
      ?? source.config.workflow
      ?? source.config.dataWorkflow
  );
  if (Object.keys(raw).length === 0 || raw.enabled === false || raw.disabled === true) return { ok: true, data: null };
  const segments = readCompositeApiSegments(raw.segments ?? raw.sources ?? raw.inputs ?? raw.children);
  if (segments.length === 0) {
    return raw.enabled === true
      ? { ok: false, statusCode: 400, error: 'Composite API data source requires at least one segment' }
      : { ok: true, data: null };
  }
  const sortDirection = (readString(raw.sortDirection ?? raw.direction) ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  return {
    ok: true,
    data: {
      continueOnError: raw.continueOnError === true,
      dedupeBy: readStringArray(raw.dedupeBy ?? raw.uniqueBy ?? raw.distinctBy),
      ...(readString(raw.outputNodeId ?? raw.outputStepId ?? raw.output) ? { outputNodeId: readString(raw.outputNodeId ?? raw.outputStepId ?? raw.output) as string } : {}),
      segments,
      ...(readString(raw.sortBy ?? raw.orderBy) ? { sortBy: readString(raw.sortBy ?? raw.orderBy) as string } : {}),
      sortDirection,
      steps: readCompositeApiSteps(raw.steps ?? raw.transforms ?? raw.workflowSteps)
    }
  };
}

function readCompositeApiSegments(value: unknown): CompositeApiSegmentConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const dataSourceId = readString(item.dataSourceId ?? item.sourceId ?? item.lookupDataSourceId);
    if (!dataSourceId) return [];
    const name = readString(item.name ?? item.label);
    const tableName = readString(item.tableName ?? item.table ?? item.modelName);
    const query = readString(item.query ?? item.sqlQuery ?? item.sql);
    const when = readString(item.when ?? item.range ?? item.partition);
    const condition = readString(item.condition ?? item.if ?? item.whenExpression ?? item.expression);
    const sourceLabelField = readString(item.sourceLabelField ?? item.sourceColumn ?? item.segmentColumn);
    const timeoutMs = boundedNumber(item.timeoutMs ?? item.queryTimeoutMs, 0, 120_000);
    const segment: CompositeApiSegmentConfig = {
      dataSourceId,
      fieldMap: readFieldMap(item.fieldMap ?? item.fieldMappings ?? item.columns ?? item.columnMap),
      ...(readString(item.id ?? item.nodeId ?? item.key) ? { id: readString(item.id ?? item.nodeId ?? item.key) as string } : {}),
      parameterValues: readRecord(item.parameterValues ?? item.parameters ?? item.defaults),
      queryFragments: readCompositeSqlFragments(item.queryFragments ?? item.sqlFragments ?? item.fragments ?? item.clauses)
    };
    if (name) segment.name = name;
    if (tableName) segment.tableName = tableName;
    if (query) segment.query = query;
    if (when) segment.when = when;
    if (condition) segment.condition = condition;
    if (sourceLabelField) segment.sourceLabelField = sourceLabelField;
    if (timeoutMs > 0) segment.timeoutMs = timeoutMs;
    return [segment];
  });
}

function readCompositeSqlFragments(value: unknown): CompositeApiSqlFragmentConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const sql = readString(item.sql ?? item.query ?? item.clause ?? item.fragment);
    if (!sql) return [];
    const slot = readString(item.slot ?? item.target ?? item.section ?? item.insertAt) ?? 'append';
    return [{
      ...(readString(item.condition ?? item.if ?? item.whenExpression ?? item.expression) ? { condition: readString(item.condition ?? item.if ?? item.whenExpression ?? item.expression) as string } : {}),
      ...(readString(item.id ?? item.key) ? { id: readString(item.id ?? item.key) as string } : {}),
      ...(readString(item.name ?? item.label) ? { name: readString(item.name ?? item.label) as string } : {}),
      slot,
      sql
    }];
  });
}

function readCompositeApiSteps(value: unknown): CompositeApiStepConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CompositeApiStepConfig[] => {
    if (!isRecord(item)) return [];
    const id = readString(item.id ?? item.nodeId ?? item.key);
    if (!id) return [];
    const type = readString(item.type ?? item.component)?.toLowerCase().replace(/[\s_-]+/g, '');
    if (type === 'merge' || type === 'mergerows') {
      const sortDirection = (readString(item.sortDirection ?? item.direction) ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
      return [{
        continueOnError: item.continueOnError !== false,
        dedupeBy: readStringArray(item.dedupeBy ?? item.uniqueBy ?? item.distinctBy),
        id,
        inputIds: readStringArray(item.inputIds ?? item.inputs ?? item.sources),
        ...(readString(item.name ?? item.label) ? { name: readString(item.name ?? item.label) as string } : {}),
        ...(readString(item.sortBy ?? item.orderBy) ? { sortBy: readString(item.sortBy ?? item.orderBy) as string } : {}),
        sortDirection,
        type: 'merge' as const
      }];
    }
    if (type === 'join' || type === 'joinrecords' || type === 'joindimensions' || type === 'lookup') {
      const inputIds = readStringArray(item.inputIds ?? item.inputs ?? item.sources);
      const joinTypeRaw = (readString(item.joinType ?? item.typeName ?? item.mode) ?? 'left').toLowerCase().replace(/[\s_-]+join$/, '').replace(/[\s_-]+/g, '');
      const joinType = ['inner', 'left', 'right', 'full', 'cross'].includes(joinTypeRaw) ? joinTypeRaw as CompositeApiJoinStepConfig['joinType'] : 'left';
      return [{
        conditions: readCompositeJoinConditions(item.conditions ?? item.joinConditions ?? item.on),
        id,
        inputIds,
        joinType,
        ...(readString(item.leftNodeId ?? item.leftInputId ?? item.left) ? { leftNodeId: readString(item.leftNodeId ?? item.leftInputId ?? item.left) as string } : {}),
        ...(readString(item.leftPrefix) ? { leftPrefix: readString(item.leftPrefix) as string } : {}),
        ...(readString(item.name ?? item.label) ? { name: readString(item.name ?? item.label) as string } : {}),
        rightFieldMap: readFieldMap(item.rightFieldMap ?? item.fieldMap ?? item.fieldMappings ?? item.columns ?? item.columnMap),
        rightFields: readStringArray(item.rightFields ?? item.selectedRightFields),
        ...(readString(item.rightNodeId ?? item.rightInputId ?? item.right) ? { rightNodeId: readString(item.rightNodeId ?? item.rightInputId ?? item.right) as string } : {}),
        ...(readString(item.rightPrefix) ? { rightPrefix: readString(item.rightPrefix) as string } : {}),
        selectedLeftFields: readStringArray(item.selectedLeftFields ?? item.leftFields),
        strategy: readString(item.strategy) ?? 'auto',
        type: 'join' as const
      }];
    }
    const transform = readCompositeTransformStep(item, id, type);
    return transform ? [transform] : [];
  });
}

function readCompositeTransformStep(
  item: Record<string, unknown>,
  id: string,
  normalizedType: string | undefined
): CompositeApiTransformStepConfig | null {
  const rawOperation = readString(item.operation ?? item.action ?? item.mode);
  const operation = normalizeTransformOperation(rawOperation ?? normalizedType);
  if (!operation) return null;
  const sortDirection = (readString(item.sortDirection ?? item.direction) ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const limit = boundedNumber(item.limit ?? item.take ?? item.top, 0, 50_000);
  return {
    addFields: readRecord(item.addFields ?? item.fieldsToAdd ?? item.computedFields ?? item.values),
    fieldMap: readFieldMap(item.fieldMap ?? item.fieldMappings ?? item.columns ?? item.columnMap),
    id,
    inputIds: readStringArray(item.inputIds ?? item.inputs ?? item.sources),
    operation,
    selectedFields: readStringArray(item.selectedFields ?? item.fields ?? item.columns),
    sortDirection,
    type: 'transform',
    ...(readString(item.condition ?? item.if ?? item.whenExpression ?? item.expression) ? { condition: readString(item.condition ?? item.if ?? item.whenExpression ?? item.expression) as string } : {}),
    ...(readString(item.inputId ?? item.input ?? item.source) ? { inputId: readString(item.inputId ?? item.input ?? item.source) as string } : {}),
    ...(limit > 0 ? { limit } : {}),
    ...(readString(item.name ?? item.label) ? { name: readString(item.name ?? item.label) as string } : {}),
    ...(readString(item.sortBy ?? item.orderBy) ? { sortBy: readString(item.sortBy ?? item.orderBy) as string } : {}),
    ...(readString(item.where ?? item.filter ?? item.rowCondition) ? { where: readString(item.where ?? item.filter ?? item.rowCondition) as string } : {})
  };
}

function normalizeTransformOperation(value: string | undefined): CompositeApiTransformStepConfig['operation'] | null {
  const normalized = value?.toLowerCase().replace(/[\s_-]+/g, '') ?? '';
  if (normalized === 'transform') return 'map';
  if (normalized === 'select' || normalized === 'project' || normalized === 'pickfields') return 'project';
  if (normalized === 'filter' || normalized === 'where') return 'filter';
  if (normalized === 'map' || normalized === 'addfields' || normalized === 'derive') return 'map';
  if (normalized === 'sort' || normalized === 'orderby') return 'sort';
  if (normalized === 'limit' || normalized === 'take' || normalized === 'top') return 'limit';
  return null;
}

function readCompositeJoinConditions(value: unknown): CompositeApiJoinConditionConfig[] {
  const items = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  return items.flatMap(item => {
    if (!isRecord(item)) return [];
    const leftField = readString(item.leftField ?? item.left ?? item.sourceField ?? item.field);
    const rightField = readString(item.rightField ?? item.right ?? item.lookupField ?? item.targetField);
    if (!leftField || !rightField) return [];
    return [{
      leftField,
      operator: readString(item.operator ?? item.op) ?? '=',
      rightField
    }];
  });
}

function readFieldMap(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.flatMap(item => {
      if (!isRecord(item)) return [];
      const source = readString(item.source ?? item.from ?? item.field ?? item.path ?? item.name);
      const target = readString(item.target ?? item.to ?? item.column ?? item.alias ?? item.output);
      return source && target ? [[source, target]] : [];
    }));
  }
  const raw = readRecord(value);
  return Object.fromEntries(Object.entries(raw).flatMap(([key, item]) => {
    const target = readString(item) ?? (isRecord(item) ? readString(item.target ?? item.to ?? item.column ?? item.alias ?? item.output) : undefined);
    return target ? [[key, target]] : [];
  }));
}
