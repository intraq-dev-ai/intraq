import { uuidv7 } from '@intraq/contracts';
import type { Prisma } from '@intraq/db';
import {
  asRecord,
  asStatus,
  asString,
  isRecord,
  type PipelineRecord,
  type PipelineRunRecord
} from './foundation-store.js';

export interface DbPipelineNodeRow {
  config: unknown;
  id: string;
  label: string;
  nodeType: string;
  position: unknown;
}

export interface DbPipelineConnectionRow {
  fromNodeId: string;
  id: string;
  toNodeId: string;
}

export interface DbPipelineRunRow {
  completedAt: Date | null;
  createdAt: Date;
  id: string;
  jobId: string | null;
  parameters: unknown;
  pipelineId: string;
  startedAt: Date | null;
  status: string;
}

export interface DbPipelineRow {
  config: unknown;
  connections: DbPipelineConnectionRow[];
  createdAt: Date;
  createdBy: string | null;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  nodes: DbPipelineNodeRow[];
  runs?: DbPipelineRunRow[];
  schedule: string | null;
  status: string;
  updatedAt: Date;
}

type PipelineNodeKind = 'source' | 'transform' | 'destination';

export interface NormalizedPipelineNode {
  [key: string]: unknown;
  config: Record<string, unknown>;
  id: string;
  label: string;
  name: string;
  type: PipelineNodeKind;
  x: number;
  y: number;
}

export interface NormalizedPipelineConnection {
  [key: string]: unknown;
  from: string;
  id: string;
  to: string;
}

export function toPipelineRecord(row: DbPipelineRow): PipelineRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    status: asStatus(row.status),
    isActive: row.isActive,
    config: asRecord(row.config),
    schedule: scheduleFromDb(row.schedule),
    createdBy: row.createdBy ?? 'system',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    nodes: [...row.nodes].sort(byCreatedOrder).map(toPipelineNodeRecord),
    connections: row.connections.map(connection => ({
      id: connection.id,
      from: connection.fromNodeId,
      to: connection.toNodeId
    })),
    runCount: row.runs?.length ?? 0,
    lastRun: row.runs?.[0] ? toPipelineRunRecord(row.runs[0]) : null
  } as PipelineRecord & { runCount: number; lastRun: PipelineRunRecord | null };
}

function toPipelineNodeRecord(node: DbPipelineNodeRow): NormalizedPipelineNode {
  const config = asRecord(node.config);
  const position = asRecord(node.position);
  return normalizePipelineNode({
    id: node.id,
    type: pipelineNodeType(node.nodeType),
    label: node.label,
    name: asString(config.name) ?? node.label,
    x: numberValue(position.x, 0),
    y: numberValue(position.y, 0),
    config
  });
}

export function normalizePipelineNode(node: Record<string, unknown>): NormalizedPipelineNode {
  const label = asString(node.label) ?? asString(node.name) ?? pipelineNodeType(node.type).replace(/-/g, ' ');
  return {
    id: asString(node.id) ?? uuidv7(),
    type: pipelineNodeType(node.type),
    label,
    name: asString(node.name) ?? label,
    x: numberValue(node.x, 0),
    y: numberValue(node.y, 0),
    config: asRecord(node.config)
  };
}

export function normalizePipelineConnection(connection: Record<string, unknown>): NormalizedPipelineConnection | null {
  const from = asString(connection.from) ?? asString(connection.fromNodeId);
  const to = asString(connection.to) ?? asString(connection.toNodeId);
  if (!from || !to) return null;
  return { id: asString(connection.id) ?? uuidv7(), from, to };
}

export function toPipelineRunRecord(run: DbPipelineRunRow): PipelineRunRecord {
  return {
    id: run.id,
    pipelineId: run.pipelineId,
    status: runStatus(run.status),
    jobId: run.jobId ?? '',
    runtime: 'server',
    parameters: asRecord(run.parameters),
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null
  };
}

function pipelineNodeType(value: unknown): PipelineNodeKind {
  return value === 'source' || value === 'transform' || value === 'destination' ? value : 'transform';
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function sanitizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)]));
}

function runStatus(value: unknown): PipelineRunRecord['status'] {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'cancelled' || value === 'failed'
    ? value
    : 'queued';
}

export function scheduleString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isRecord(value) && Object.keys(value).length > 0) return JSON.stringify(value);
  return null;
}

function scheduleFromDb(value: string | null): PipelineRecord['schedule'] {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : { expression: value };
  } catch {
    return { expression: value };
  }
}

export function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function byCreatedOrder(left: DbPipelineNodeRow, right: DbPipelineNodeRow): number {
  return left.id.localeCompare(right.id);
}
