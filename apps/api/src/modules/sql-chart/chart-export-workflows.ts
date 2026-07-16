import type { IntraQPrismaClient } from '@intraq/db';
import { hasExportRowTransforms } from '../data-source/export-row-transforms.js';
import type {
  ChartDataExportItem,
  WorkflowExportOutput,
  WorkflowExportResolution
} from './foundation-route-types.js';
import {
  asString,
  isRecord,
  readRecord
} from './foundation-route-utils.js';

export async function resolveWorkflowExportRequestForPrisma(
  prismaClient: IntraQPrismaClient | null,
  item: ChartDataExportItem,
  request: unknown
): Promise<WorkflowExportResolution> {
  const raw = isRecord(request) ? request : null;
  if (!raw) return { ok: true, request };
  const workflowId = asString(item.workflowId ?? raw.workflowId ?? raw.pipelineId);
  const inlineOutput = readWorkflowOutput(item.workflowOutput ?? raw.workflowOutput ?? raw.workflowTarget ?? raw.pipelineOutput);
  const inlineTransform = readWorkflowExportTransform(
    item.workflowTransform
    ?? raw.workflowTransform
    ?? raw.workflowTransforms
    ?? raw.pipelineTransform
    ?? raw.pipelineTransforms
  );
  if (!workflowId && !inlineOutput) {
    return {
      ok: true,
      request,
      ...(inlineTransform ? { rowTransform: inlineTransform } : {})
    };
  }

  const output = inlineOutput ?? await workflowOutputForId(prismaClient, workflowId ?? undefined);
  if (!output) {
    return {
      ok: false,
      statusCode: 404,
      error: `Workflow output is not configured${workflowId ? ` for workflow ${workflowId}` : ''}.`
    };
  }
  const workflowTransform = await workflowExportTransformForId(prismaClient, workflowId ?? undefined);
  const rowTransform = mergeExportTransformConfigs(workflowTransform, inlineTransform);
  return {
    ok: true,
    request: {
      ...raw,
      dataSourceId: output.dataSourceId,
      tableName: output.tableName,
      workflowId: workflowId ?? raw.workflowId,
      workflowOutput: output
    },
    ...(rowTransform ? { rowTransform } : {})
  };
}

export function mergeExportTransformConfigs(
  ...configs: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> | null {
  const records = configs.flatMap(config => {
    const record = readRecord(config);
    return Object.keys(record).length > 0 ? [record] : [];
  });
  if (records.length === 0) return null;
  const merged = records.reduce<Record<string, unknown>>((current, next) => mergeExportTransformConfig(current, next), {});
  return Object.keys(merged).length > 0 ? merged : null;
}

export function readWorkflowOutput(value: unknown): WorkflowExportOutput | null {
  const record = readRecord(value);
  const dataSourceId = asString(record.dataSourceId ?? record.sourceId);
  const tableName = asString(record.tableName ?? record.dataSource ?? record.outputTableName);
  return dataSourceId && tableName ? { dataSourceId, tableName } : null;
}

function readWorkflowExportTransform(value: unknown): Record<string, unknown> | null {
  const record = readRecord(value);
  if (Object.keys(record).length === 0) return null;
  const candidates = [
    record.exportTransform,
    record.exportTransforms,
    record.exportRowTransform,
    record.exportRowTransforms,
    record.rowTransform,
    record.rowTransforms,
    record.outputTransform,
    record.outputTransforms,
    record.pipelineTransform,
    record.pipelineTransforms,
    record.transform,
    record.transforms,
    readRecord(record.export).transform,
    readRecord(record.export).transforms,
    readRecord(record.export).rowTransform,
    readRecord(record.export).rowTransforms,
    record.export,
    record
  ].flatMap(candidate => {
    if (Array.isArray(candidate)) return candidate;
    return candidate ? [candidate] : [];
  });
  const configs = candidates.map(readRecord).filter(candidate => hasExportRowTransforms(candidate));
  return mergeExportTransformConfigs(...configs);
}

async function workflowOutputForId(
  prismaClient: IntraQPrismaClient | null,
  workflowId: string | undefined
): Promise<WorkflowExportOutput | null> {
  if (!workflowId || !prismaClient) return null;
  const pipeline = await prismaClient.pipeline.findUnique({
    where: { id: workflowId },
    include: { nodes: true }
  }).catch(() => null);
  const nodes = Array.isArray(pipeline?.nodes) ? pipeline.nodes : [];
  for (const node of nodes) {
    const config = isRecord(node.config) ? node.config : {};
    const key = `${asString(config.component) ?? ''} ${node.label ?? ''} ${node.nodeType ?? ''}`.toLowerCase();
    if (!key.includes('api-data-model') && !key.includes('api data model')) continue;
    const output = readWorkflowOutput(config);
    if (output) return output;
  }
  const configOutput = isRecord(pipeline?.config)
    ? readWorkflowOutput(readRecord(pipeline.config).output ?? readRecord(pipeline.config).workflowOutput)
    : null;
  return configOutput ?? null;
}

async function workflowExportTransformForId(
  prismaClient: IntraQPrismaClient | null,
  workflowId: string | undefined
): Promise<Record<string, unknown> | null> {
  if (!workflowId || !prismaClient) return null;
  const pipeline = await prismaClient.pipeline.findUnique({
    where: { id: workflowId },
    include: { nodes: true }
  }).catch(() => null);
  const transformConfigs: Array<Record<string, unknown>> = [];
  if (isRecord(pipeline?.config)) {
    const transform = workflowTransformFromConfig(readRecord(pipeline.config));
    if (transform) transformConfigs.push(transform);
  }
  const nodes = Array.isArray(pipeline?.nodes) ? pipeline.nodes : [];
  for (const node of nodes) {
    const config = isRecord(node.config) ? node.config : {};
    const transform = workflowTransformFromConfig(config);
    if (transform) transformConfigs.push(transform);
  }
  return mergeExportTransformConfigs(...transformConfigs);
}

function workflowTransformFromConfig(config: Record<string, unknown>): Record<string, unknown> | null {
  const key = `${asString(config.component) ?? ''} ${asString(config.kind) ?? ''} ${asString(config.type) ?? ''}`.toLowerCase();
  const direct = readWorkflowExportTransform(config);
  if (direct) return direct;
  if (key.includes('transform') || key.includes('mapper') || key.includes('projection')) {
    return hasExportRowTransforms(config) ? config : null;
  }
  return null;
}

function mergeExportTransformConfig(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...left, ...right };
  for (const key of ['appendRows', 'rowsToAppend', 'summaryRows', 'footerRows', 'generateRows', 'generatedRows', 'derivedRows', 'rowsFromGroups', 'groupRows']) {
    const leftItems = Array.isArray(left[key]) ? left[key] as unknown[] : [];
    const rightItems = Array.isArray(right[key]) ? right[key] as unknown[] : [];
    if (leftItems.length || rightItems.length) output[key] = [...leftItems, ...rightItems];
  }
  const leftCsv = readRecord(left.csv);
  const rightCsv = readRecord(right.csv);
  if (Object.keys(leftCsv).length || Object.keys(rightCsv).length) output.csv = { ...leftCsv, ...rightCsv };
  return output;
}
