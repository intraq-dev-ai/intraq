export type PipelineStatus = 'draft' | 'ready' | 'active' | 'inactive';
export type RunStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
export type PipelineRuntime = 'server' | 'emr' | 'databricks';
export type RuntimeCheckStatus = 'passed' | 'warning' | 'failed';

export interface PipelineRecord {
  id: string;
  name: string;
  description: string;
  status: PipelineStatus;
  isActive: boolean;
  config: Record<string, unknown>;
  schedule: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  nodes: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
}

export interface PipelineRunRecord {
  id: string;
  pipelineId: string;
  status: RunStatus;
  jobId: string;
  runtime: PipelineRuntime;
  parameters: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RuntimeCheckRecord {
  id: string;
  label: string;
  status: RuntimeCheckStatus;
  message: string;
}

export interface RuntimeReadinessRecord {
  id: PipelineRuntime;
  name: string;
  isConfigured: boolean;
  status: 'connected' | 'not-configured';
  canRun: boolean;
  messages: string[];
}

export const baseTime = '2026-05-02T00:00:00.000Z';

export function buildPipeline(id: string, name: string): PipelineRecord {
  return {
    id,
    name,
    description: 'Foundation data engineering pipeline',
    status: 'ready',
    isActive: true,
    config: { domain: 'general', runtime: 'emr' },
    schedule: null,
    createdBy: 'foundation',
    createdAt: baseTime,
    updatedAt: baseTime,
    nodes: [
      { id: 'node-source', type: 'source', label: 'Source Dataset', name: 'Source Dataset', x: 48, y: 92 },
      { id: 'node-transform', type: 'transform', label: 'Validate Records', name: 'Validate Records', x: 292, y: 92 },
      { id: 'node-destination', type: 'destination', label: 'Curated Dataset', name: 'Curated Dataset', x: 536, y: 92 }
    ],
    connections: [
      { id: 'conn-source-transform', from: 'node-source', to: 'node-transform' },
      { id: 'conn-transform-destination', from: 'node-transform', to: 'node-destination' }
    ]
  };
}

export function buildRun(
  id: string,
  pipelineId: string,
  status: RunStatus,
  jobId: string,
  runtime: PipelineRuntime = 'emr'
): PipelineRunRecord {
  return {
    id,
    pipelineId,
    status,
    jobId,
    runtime,
    parameters: {},
    createdAt: baseTime,
    startedAt: baseTime,
    completedAt: status === 'completed' ? baseTime : null
  };
}

export function stableId(prefix: string, name: string): string {
  return `${prefix}-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function asStatus(value: unknown): PipelineStatus {
  return value === 'draft' || value === 'active' || value === 'inactive' || value === 'ready' ? value : 'draft';
}

export function selectedRuntime(body: Record<string, unknown>): PipelineRuntime | null {
  if (body.runtime === undefined || body.runtime === 'emr') return 'emr';
  if (body.runtime === 'server' || body.runtime === 'databricks') return body.runtime;
  return null;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function runtimeChecksFor(pipeline: PipelineRecord): RuntimeCheckRecord[] {
  return [
    {
      id: 'pipeline-active',
      label: 'Pipeline active',
      status: pipeline.isActive ? 'passed' : 'failed',
      message: pipeline.isActive ? 'Pipeline is active.' : 'Pipeline must be active before execution.'
    },
    {
      id: 'pipeline-nodes',
      label: 'Executable nodes',
      status: pipeline.nodes.length > 0 ? 'passed' : 'failed',
      message: pipeline.nodes.length > 0 ? `${pipeline.nodes.length} node(s) ready.` : 'Pipeline needs at least one node.'
    },
    {
      id: 'runtime-config',
      label: 'Runtime configuration',
      status: runtimeIsConfigured(pipeline, defaultRuntimeFor(pipeline)) ? 'passed' : 'warning',
      message: runtimeIsConfigured(pipeline, defaultRuntimeFor(pipeline))
        ? `${runtimeLabel(defaultRuntimeFor(pipeline))} is configured for this pipeline.`
        : 'No configured runtime found; foundation mode can still simulate execution.'
    }
  ];
}

export function runtimesFor(
  pipeline: PipelineRecord,
  canRun: boolean,
  defaultRuntime: PipelineRuntime
): RuntimeReadinessRecord[] {
  return (['server', 'emr', 'databricks'] as PipelineRuntime[]).map(runtime => {
    const isConfigured = runtimeIsConfigured(pipeline, runtime);
    return {
      id: runtime,
      name: runtimeLabel(runtime),
      isConfigured,
      status: isConfigured || runtime === 'server' ? 'connected' : 'not-configured',
      canRun: canRun && (isConfigured || runtime === defaultRuntime || runtime === 'server'),
      messages: isConfigured
        ? ['Runtime is configured and available.']
        : runtime === 'server'
          ? ['Server query runtime is available for API-returning workflows.']
        : [`${runtimeLabel(runtime)} is not configured for this pipeline.`]
    };
  });
}

export function defaultRuntimeFor(pipeline: PipelineRecord): PipelineRuntime {
  if (pipeline.config.runtime === 'server') return 'server';
  return pipeline.config.runtime === 'databricks' ? 'databricks' : 'emr';
}

export function runtimeIsConfigured(pipeline: PipelineRecord, runtime: PipelineRuntime): boolean {
  if (runtime === 'server') return true;
  return defaultRuntimeFor(pipeline) === runtime;
}

export function runtimeLabel(runtime: PipelineRuntime): string {
  if (runtime === 'server') return 'Server Query';
  return runtime === 'emr' ? 'AWS EMR Serverless' : 'Databricks Jobs';
}

export function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
