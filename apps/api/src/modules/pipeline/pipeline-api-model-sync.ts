import type { IntraQPrismaClient } from '@intraq/db';
import {
  asRecord,
  asRecords,
  asString,
  isRecord,
  type PipelineRecord
} from './foundation-store.js';
import {
  normalizePipelineConnection,
  normalizePipelineNode,
  numberValue,
  toInputJson,
  type NormalizedPipelineConnection,
  type NormalizedPipelineNode
} from './pipeline-record-mappers.js';

export async function syncPipelineApiDataModelConfig(
  db: IntraQPrismaClient,
  pipeline: PipelineRecord
): Promise<void> {
  const nodes = pipeline.nodes.map(node => normalizePipelineNode(node));
  const connections = pipeline.connections
    .map(connection => normalizePipelineConnection(connection))
    .filter((connection): connection is NormalizedPipelineConnection => Boolean(connection));
  const outputNode = nodes.find(node => componentKey(node).includes('api-data-model') || componentKey(node).includes('api data model'));
  if (!outputNode) return;

  const dataSourceId = asString(outputNode.config.dataSourceId);
  const tableName = asString(outputNode.config.tableName);
  if (!dataSourceId || !tableName) return;

  const segments = nodes
    .filter(node => componentKey(node).includes('source-segment') || componentKey(node).includes('source segment'))
    .map(sourceSegmentFromNode)
    .filter(isRecord);
  if (!segments.length) return;

  const mergeNode = nodes.find(node => componentKey(node).includes('merge-rows') || componentKey(node).includes('merge rows'));
  const mergeConfig = asRecord(mergeNode?.config);
  const table = await db.dataSourceTable.findFirst({
    where: {
      dataSourceId,
      OR: [{ id: tableName }, { name: tableName }]
    },
    select: { id: true, settings: true }
  });
  if (!table) return;

  const settings = asRecord(table.settings);
  const apiSettings = asRecord(settings.api ?? settings.request);
  const upstreamIds = upstreamNodeIds(outputNode.id, connections);
  const exportTransformNode = nodes.find(node => upstreamIds.has(node.id) && (componentKey(node).includes('row-transform') || componentKey(node).includes('export transform')));
  const exportTransform = exportTransformFromNode(exportTransformNode);
  const steps = workflowStepsFromNodes(nodes, connections, upstreamIds);
  const composite = compactRecord({
    continueOnError: mergeConfig.continueOnError !== false,
    dedupeBy: readStringList(mergeConfig.dedupeBy),
    outputNodeId: outputDataNodeId(outputNode.id, nodes, connections),
    segments,
    sortBy: asString(mergeConfig.sortBy),
    sortDirection: asString(mergeConfig.sortDirection) === 'desc' ? 'desc' : 'asc',
    steps
  });
  const nextSettings = applyExportTransformToSettings(settings, apiSettings, exportTransform);
  const nextApiSettings = asRecord(nextSettings.api ?? nextSettings.request);

  await db.dataSourceTable.update({
    where: { id: table.id },
    data: {
      settings: toInputJson({
        ...nextSettings,
        api: {
          ...nextApiSettings,
          composite
        }
      })
    }
  });
}

function workflowStepsFromNodes(
  nodes: NormalizedPipelineNode[],
  connections: NormalizedPipelineConnection[],
  upstreamIds: Set<string>
): Array<Record<string, unknown>> {
  const transformNodes = nodes.filter(node => upstreamIds.has(node.id) && isApiWorkflowStepNode(node));
  const pending = new Map(transformNodes.map(node => [node.id, node]));
  const completed = new Set(nodes.filter(node => !pending.has(node.id)).map(node => node.id));
  const steps: Array<Record<string, unknown>> = [];

  while (pending.size > 0) {
    let progressed = false;
    for (const node of [...pending.values()]) {
      const inputIds = inputNodeIds(node.id, connections);
      if (inputIds.some(id => pending.has(id) && !completed.has(id))) continue;
      const step = workflowStepFromNode(node, inputIds);
      if (step) steps.push(step);
      pending.delete(node.id);
      completed.add(node.id);
      progressed = true;
    }
    if (!progressed) {
      for (const node of pending.values()) {
        const step = workflowStepFromNode(node, inputNodeIds(node.id, connections));
        if (step) steps.push(step);
      }
      break;
    }
  }
  return steps;
}

function isApiWorkflowStepNode(node: NormalizedPipelineNode): boolean {
  const key = componentKey(node);
  return key.includes('merge-rows')
    || key.includes('merge rows')
    || key.includes('join-records')
    || key.includes('join records')
    || key.includes('join-dimensions')
    || key.includes('join dimensions');
}

function workflowStepFromNode(node: NormalizedPipelineNode, inputIds: string[]): Record<string, unknown> | null {
  const key = componentKey(node);
  if (key.includes('merge-rows') || key.includes('merge rows')) return mergeStepFromNode(node, inputIds);
  if (key.includes('join-records') || key.includes('join records') || key.includes('join-dimensions') || key.includes('join dimensions')) {
    return joinStepFromNode(node, inputIds);
  }
  return null;
}

function mergeStepFromNode(node: NormalizedPipelineNode, inputIds: string[]): Record<string, unknown> {
  const config = asRecord(node.config);
  return compactRecord({
    id: node.id,
    type: 'merge',
    inputIds,
    continueOnError: config.continueOnError !== false,
    dedupeBy: readStringList(config.dedupeBy),
    name: node.name,
    sortBy: asString(config.sortBy),
    sortDirection: asString(config.sortDirection) === 'desc' ? 'desc' : 'asc'
  });
}

function joinStepFromNode(node: NormalizedPipelineNode, inputIds: string[]): Record<string, unknown> {
  const config = asRecord(node.config);
  const configuredConditions = asRecords(config.conditions).map(condition => compactRecord({
    leftField: asString(condition.leftField ?? condition.left ?? condition.sourceField),
    operator: asString(condition.operator ?? condition.op) ?? '=',
    rightField: asString(condition.rightField ?? condition.right ?? condition.lookupField)
  })).filter(condition => condition.leftField && condition.rightField);
  return compactRecord({
    id: node.id,
    type: 'join',
    conditions: configuredConditions,
    inputIds,
    joinType: asString(config.joinType ?? config.type) ?? 'left',
    leftNodeId: asString(config.leftNodeId ?? config.leftInputId) ?? inputIds[0],
    leftPrefix: asString(config.leftPrefix),
    name: node.name,
    rightFieldMap: readRecordSetting(config.rightFieldMap ?? config.fieldMap ?? config.fieldMappings),
    rightFields: readStringList(config.rightFields ?? config.selectedRightFields),
    rightNodeId: asString(config.rightNodeId ?? config.rightInputId) ?? inputIds[1],
    rightPrefix: asString(config.rightPrefix),
    selectedLeftFields: readStringList(config.leftFields ?? config.selectedLeftFields),
    strategy: asString(config.strategy) ?? 'auto'
  });
}

function inputNodeIds(nodeId: string, connections: NormalizedPipelineConnection[]): string[] {
  return connections.filter(connection => connection.to === nodeId).map(connection => connection.from);
}

function outputDataNodeId(
  outputNodeId: string,
  nodes: NormalizedPipelineNode[],
  connections: NormalizedPipelineConnection[]
): string | undefined {
  let current = inputNodeIds(outputNodeId, connections)[0];
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = nodes.find(candidate => candidate.id === current);
    if (!node || !(componentKey(node).includes('row-transform') || componentKey(node).includes('export transform'))) return current;
    current = inputNodeIds(node.id, connections)[0];
  }
  return current;
}

function upstreamNodeIds(targetId: string, connections: NormalizedPipelineConnection[]): Set<string> {
  const upstream = new Set<string>();
  const queue = [targetId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const connection of connections) {
      if (connection.to !== current || upstream.has(connection.from)) continue;
      upstream.add(connection.from);
      queue.push(connection.from);
    }
  }
  return upstream;
}

function exportTransformFromNode(node: NormalizedPipelineNode | undefined): Record<string, unknown> {
  if (!node) return {};
  const config = asRecord(node.config);
  return readRecordSetting(config.exportTransform ?? config.rowTransform ?? config.rowTransforms ?? config.transform ?? config.transforms);
}

function applyExportTransformToSettings(
  settings: Record<string, unknown>,
  apiSettings: Record<string, unknown>,
  exportTransform: Record<string, unknown>
): Record<string, unknown> {
  if (Object.keys(exportTransform).length === 0) return settings;
  const target = exportSettingsTarget(settings, apiSettings);
  if (target === 'api.export') {
    return {
      ...settings,
      api: {
        ...apiSettings,
        export: compactRecord({
          ...readRecordSetting(apiSettings.export),
          ...exportTransform
        })
      }
    };
  }
  const key = target ?? 'export';
  return {
    ...settings,
    [key]: compactRecord({
      ...readRecordSetting(settings[key]),
      ...exportTransform
    })
  };
}

function exportSettingsTarget(settings: Record<string, unknown>, apiSettings: Record<string, unknown>): 'export' | 'exports' | 'apiExport' | 'download' | 'api.export' | null {
  for (const key of ['export', 'exports', 'apiExport', 'download'] as const) {
    if (Object.keys(readRecordSetting(settings[key])).length > 0) return key;
  }
  return Object.keys(readRecordSetting(apiSettings.export)).length > 0 ? 'api.export' : null;
}

function sourceSegmentFromNode(node: NormalizedPipelineNode): Record<string, unknown> | null {
  const config = asRecord(node.config);
  const dataSourceId = asString(config.dataSourceId);
  if (!dataSourceId) return null;
  const timeoutMs = numberValue(config.timeoutMs, 0);
  return compactRecord({
    id: node.id,
    dataSourceId,
    fieldMap: readRecordSetting(config.fieldMap ?? config.fieldMappings ?? config.columns ?? config.columnMap),
    name: node.name || asString(config.name) || asString(config.label),
    parameterValues: readRecordSetting(config.parameterValues ?? config.parameters ?? config.defaults),
    query: asString(config.query ?? config.sqlQuery ?? config.sql),
    sourceLabelField: asString(config.sourceLabelField ?? config.sourceColumn ?? config.segmentColumn),
    tableName: asString(config.tableName ?? config.table ?? config.modelName),
    ...(timeoutMs > 0 ? { timeoutMs } : {}),
    when: asString(config.when ?? config.range ?? config.partition)
  });
}

function componentKey(node: NormalizedPipelineNode): string {
  return `${asString(node.config.component) ?? ''} ${node.label ?? ''} ${node.name ?? ''}`.toLowerCase();
}

function readRecordSetting(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === undefined || item === null || item === '') return false;
    if (Array.isArray(item)) return item.length > 0;
    if (isRecord(item)) return Object.keys(item).length > 0;
    return true;
  }));
}
