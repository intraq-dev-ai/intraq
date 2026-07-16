import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, uuidv7 } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendCreated, sendJson, sendOk } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import {
  asRecord,
  asRecords,
  asStatus,
  asString,
  baseTime,
  buildRun,
  clone,
  defaultRuntimeFor,
  isNonEmptyString,
  isRecord,
  readPositiveInteger,
  runtimeChecksFor,
  runtimesFor,
  selectedRuntime,
  type PipelineRecord,
  type PipelineRunRecord
} from './foundation-store.js';
import {
  createDbPipeline,
  findDbPipeline,
  pipelineScopeWhere,
  updateDbPipelineRecord
} from './pipeline-db-store.js';
import {
  toInputJson,
  toPipelineRecord,
  toPipelineRunRecord
} from './pipeline-record-mappers.js';
import {
  decodePart,
  pipelineScript,
  sendBadRequestTrue,
  sendNotFound,
  sendOkTrue
} from './pipeline-route-helpers.js';

export class PipelineFoundationRoutes {
  private pipelines: PipelineRecord[] = [];
  private runs: PipelineRunRecord[] = [];

  constructor(private readonly prismaClient: IntraQPrismaClient | null = null) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/pipelines') return this.listPipelines(req, res, url);
    if (req.method === 'POST' && url.pathname === '/api/pipelines') return this.createPipeline(req, res);
    if (req.method === 'POST' && url.pathname === '/api/pipelines/sync-credentials') return this.syncCredentials(req, res);
    if (await this.handleRunRoute(req, res, url)) return true;

    const action = /^\/api\/pipelines\/([^/]+)\/(duplicate|run|runs|runtime-checks|generate-code|publish-to-databricks)$/.exec(url.pathname);
    if (action?.[1] && action[2]) return this.handlePipelineAction(req, res, decodePart(action[1]), action[2], url);

    const pipelineMatch = /^\/api\/pipelines\/([^/]+)$/.exec(url.pathname);
    if (pipelineMatch?.[1]) return this.handlePipeline(req, res, decodePart(pipelineMatch[1]));
    return false;
  }

  private async handleRunRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const legacyLogs = /^\/api\/pipeline-runs\/([^/]+)\/logs$/.exec(url.pathname);
    if (req.method === 'GET' && legacyLogs?.[1]) {
      return this.prismaClient ? this.sendDbRunLogs(res, decodePart(legacyLogs[1])) : this.sendRunLogs(res, decodePart(legacyLogs[1]));
    }

    const legacyCancel = /^\/api\/pipeline-runs\/([^/]+)\/cancel$/.exec(url.pathname);
    if ((req.method === 'POST' || req.method === 'PUT') && legacyCancel?.[1]) {
      return this.prismaClient ? this.cancelDbRun(res, decodePart(legacyCancel[1])) : this.cancelRun(res, decodePart(legacyCancel[1]));
    }

    const legacyRun = /^\/api\/pipeline-runs\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && legacyRun?.[1]) {
      return this.prismaClient ? this.sendDbRun(res, decodePart(legacyRun[1])) : this.sendRun(res, decodePart(legacyRun[1]));
    }

    const runLogs = /^\/api\/pipelines\/runs\/([^/]+)\/logs$/.exec(url.pathname);
    if (req.method === 'GET' && runLogs?.[1]) {
      return this.prismaClient ? this.sendDbRunLogs(res, decodePart(runLogs[1])) : this.sendRunLogs(res, decodePart(runLogs[1]));
    }

    const runCancel = /^\/api\/pipelines\/runs\/([^/]+)\/cancel$/.exec(url.pathname);
    if (req.method === 'PUT' && runCancel?.[1]) {
      return this.prismaClient ? this.cancelDbRun(res, decodePart(runCancel[1])) : this.cancelRun(res, decodePart(runCancel[1]));
    }

    const run = /^\/api\/pipelines\/runs\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && run?.[1]) {
      return this.prismaClient ? this.sendDbRun(res, decodePart(run[1])) : this.sendRun(res, decodePart(run[1]));
    }
    return false;
  }

  private async listPipelines(req: IncomingMessage, res: ServerResponse, url: URL): Promise<true> {
    if (this.prismaClient) {
      const status = url.searchParams.get('status');
      const isActive = url.searchParams.get('isActive');
      const pipelines = await this.prismaClient.pipeline.findMany({
        where: {
          ...pipelineScopeWhere(req),
          ...(status ? { status } : {}),
          ...(isActive === null ? {} : { isActive: isActive === 'true' })
        },
        include: {
          connections: true,
          nodes: true,
          runs: { orderBy: { createdAt: 'desc' }, take: 1 }
        },
        orderBy: { updatedAt: 'desc' }
      });
      sendOk(res, pipelines.map(toPipelineRecord));
      return true;
    }
    const status = url.searchParams.get('status');
    const isActive = url.searchParams.get('isActive');
    const pipelines = this.pipelines
      .filter(pipeline => !status || pipeline.status === status)
      .filter(pipeline => isActive === null || pipeline.isActive === (isActive === 'true'))
      .map(pipeline => ({ ...pipeline, runCount: this.runsForPipeline(pipeline.id).length, lastRun: this.runsForPipeline(pipeline.id)[0] ?? null }));
    sendOk(res, pipelines);
    return true;
  }

  private async createPipeline(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.name)) {
      sendBadRequest(res, 'name is required for pipeline creation.');
      return true;
    }
    if (this.prismaClient) {
      const pipeline = await createDbPipeline(this.prismaClient, req, this.pipelineFromBody(body, uuidv7(), new Date().toISOString()));
      sendCreated(res, pipeline);
      return true;
    }
    const pipeline = this.pipelineFromBody(body, uuidv7(), baseTime);
    this.pipelines = [pipeline, ...this.pipelines];
    sendCreated(res, pipeline);
    return true;
  }

  private async handlePipeline(req: IncomingMessage, res: ServerResponse, id: string): Promise<boolean> {
    if (this.prismaClient) {
      const pipeline = await findDbPipeline(this.prismaClient, req, id);
      if (!pipeline) return sendNotFound(res, 'Pipeline not found');
      if (req.method === 'GET') return sendOkTrue(res, toPipelineRecord(pipeline));
      if (req.method === 'PUT') return this.updateDbPipeline(req, res, pipeline.id);
      if (req.method === 'DELETE') {
        await this.prismaClient.pipeline.delete({ where: { id: pipeline.id } });
        return sendOkTrue(res, { message: 'Pipeline deleted successfully' });
      }
      return false;
    }
    const pipeline = this.findPipeline(id);
    if (!pipeline) return sendNotFound(res, 'Pipeline not found');
    if (req.method === 'GET') return sendOkTrue(res, pipeline);
    if (req.method === 'PUT') return this.updatePipeline(req, res, pipeline);
    if (req.method === 'DELETE') {
      this.pipelines = this.pipelines.filter(item => item.id !== id);
      this.runs = this.runs.filter(run => run.pipelineId !== id);
      return sendOkTrue(res, { message: 'Pipeline deleted successfully' });
    }
    return false;
  }

  private async updatePipeline(req: IncomingMessage, res: ServerResponse, pipeline: PipelineRecord): Promise<true> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || ('name' in body && !isNonEmptyString(body.name))) {
      sendBadRequest(res, 'Request body must be a JSON object with a valid name when provided.');
      return true;
    }
    Object.assign(pipeline, this.pipelinePatch(body), { updatedAt: baseTime });
    sendOk(res, pipeline);
    return true;
  }

  private async updateDbPipeline(req: IncomingMessage, res: ServerResponse, id: string): Promise<true> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || ('name' in body && !isNonEmptyString(body.name))) {
      sendBadRequest(res, 'Request body must be a JSON object with a valid name when provided.');
      return true;
    }
    const existing = await findDbPipeline(this.prismaClient as IntraQPrismaClient, req, id);
    if (!existing) return sendNotFound(res, 'Pipeline not found');
    const patch = this.pipelinePatch(body);
    const updated = await updateDbPipelineRecord(this.prismaClient as IntraQPrismaClient, id, {
      ...toPipelineRecord(existing),
      ...patch,
      id,
      nodes: body.nodes === undefined ? toPipelineRecord(existing).nodes : asRecords(body.nodes) as PipelineRecord['nodes'],
      connections: body.connections === undefined ? toPipelineRecord(existing).connections : asRecords(body.connections) as PipelineRecord['connections']
    });
    sendOk(res, updated);
    return true;
  }

  private async handlePipelineAction(req: IncomingMessage, res: ServerResponse, id: string, action: string, url: URL): Promise<boolean> {
    if (this.prismaClient) return this.handleDbPipelineAction(req, res, id, action, url);
    const pipeline = this.findPipeline(id);
    if (!pipeline) return sendNotFound(res, 'Pipeline not found');
    if (req.method === 'POST' && action === 'duplicate') return this.duplicatePipeline(req, res, pipeline);
    if (req.method === 'POST' && action === 'run') return this.runPipeline(req, res, pipeline);
    if (req.method === 'GET' && action === 'runs') return this.listRuns(res, pipeline.id, url);
    if (req.method === 'GET' && action === 'runtime-checks') return this.sendRuntimeChecks(res, pipeline);
    if (req.method === 'GET' && action === 'generate-code') return this.generateCode(res, pipeline);
    if (req.method === 'POST' && action === 'publish-to-databricks') return this.publishToDatabricks(req, res, pipeline);
    return false;
  }

  private async handleDbPipelineAction(req: IncomingMessage, res: ServerResponse, id: string, action: string, url: URL): Promise<boolean> {
    const db = this.prismaClient as IntraQPrismaClient;
    const pipeline = await findDbPipeline(db, req, id);
    if (!pipeline) return sendNotFound(res, 'Pipeline not found');
    const record = toPipelineRecord(pipeline);
    if (req.method === 'POST' && action === 'duplicate') {
      const body = await readJsonBody(req);
      if (body !== null && !isRecord(body)) {
        sendBadRequest(res, 'Request body must be a JSON object.');
        return true;
      }
      const name = isRecord(body) && isNonEmptyString(body.name) ? body.name.trim() : `${record.name} (Copy)`;
      const duplicate = await createDbPipeline(db, req, { ...clone(record), id: uuidv7(), name, status: 'draft' });
      sendCreated(res, duplicate);
      return true;
    }
    if (req.method === 'POST' && action === 'run') return this.runDbPipeline(req, res, record);
    if (req.method === 'GET' && action === 'runs') return this.listDbRuns(res, record.id, url);
    if (req.method === 'GET' && action === 'runtime-checks') return this.sendRuntimeChecks(res, record);
    if (req.method === 'GET' && action === 'generate-code') return this.generateCode(res, record);
    if (req.method === 'POST' && action === 'publish-to-databricks') {
      const body = await readJsonBody(req);
      if (body !== null && !isRecord(body)) return sendBadRequestTrue(res, 'Request body must be a JSON object.');
      if (record.nodes.length === 0) {
        sendJson(res, 400, fail('Pipeline must contain nodes before publishing.'));
        return true;
      }
      const jobName = isRecord(body) && isNonEmptyString(body.jobName) ? body.jobName.trim() : `${record.name}-job`;
      await db.pipeline.update({
        where: { id: record.id },
        data: {
          config: { ...record.config, runtime: 'databricks', databricksJobName: jobName },
          status: 'active'
        }
      });
      return sendOkTrue(res, { pipelineId: record.id, jobId: `databricks-${record.id}`, jobName, status: 'published', message: 'Pipeline published to Databricks' });
    }
    return false;
  }

  private async duplicatePipeline(req: IncomingMessage, res: ServerResponse, pipeline: PipelineRecord): Promise<true> {
    const body = await readJsonBody(req);
    if (body !== null && !isRecord(body)) {
      sendBadRequest(res, 'Request body must be a JSON object.');
      return true;
    }
    const name = isRecord(body) && isNonEmptyString(body.name) ? body.name.trim() : `${pipeline.name} (Copy)`;
    const duplicate = { ...clone(pipeline), id: uuidv7(), name, status: 'draft' as const };
    this.pipelines = [duplicate, ...this.pipelines];
    sendCreated(res, duplicate);
    return true;
  }

  private async runPipeline(req: IncomingMessage, res: ServerResponse, pipeline: PipelineRecord): Promise<true> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) return sendBadRequestTrue(res, 'Request body must be a JSON object.');
    const runtime = selectedRuntime(body);
    if (!runtime) return sendBadRequestTrue(res, 'Invalid runtime. Must be "server", "emr", or "databricks".');
    if (!pipeline.isActive || pipeline.nodes.length === 0) {
      sendJson(res, 400, fail('Pipeline must be active and contain nodes before execution.'));
      return true;
    }
    const run = buildRun(uuidv7(), pipeline.id, 'running', `job-${uuidv7()}`, runtime);
    run.parameters = isRecord(body.parameters) ? body.parameters : {};
    this.runs = [run, ...this.runs];
    return sendOkTrue(res, { runId: run.id, jobId: run.jobId, status: run.status, pipelineId: pipeline.id, runtime });
  }

  private async runDbPipeline(req: IncomingMessage, res: ServerResponse, pipeline: PipelineRecord): Promise<true> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) return sendBadRequestTrue(res, 'Request body must be a JSON object.');
    const runtime = selectedRuntime(body);
    if (!runtime) return sendBadRequestTrue(res, 'Invalid runtime. Must be "server", "emr", or "databricks".');
    if (!pipeline.isActive || pipeline.nodes.length === 0) {
      sendJson(res, 400, fail('Pipeline must be active and contain nodes before execution.'));
      return true;
    }
    const run = await (this.prismaClient as IntraQPrismaClient).pipelineRun.create({
      data: {
        id: uuidv7(),
        pipelineId: pipeline.id,
        status: 'running',
        jobId: `job-${uuidv7()}`,
        startedAt: new Date(),
        parameters: toInputJson(isRecord(body.parameters) ? body.parameters : {}),
        createdBy: getRequestSecurityContext(req)?.userId ?? null
      }
    });
    return sendOkTrue(res, { runId: run.id, jobId: run.jobId, status: run.status, pipelineId: pipeline.id, runtime });
  }

  private listRuns(res: ServerResponse, pipelineId: string, url: URL): true {
    const limit = readPositiveInteger(url.searchParams.get('limit'), 20);
    const runs = this.runsForPipeline(pipelineId);
    return sendOkTrue(res, { runs: runs.slice(0, limit), total: runs.length, limit, offset: 0 });
  }

  private async listDbRuns(res: ServerResponse, pipelineId: string, url: URL): Promise<true> {
    const limit = readPositiveInteger(url.searchParams.get('limit'), 20);
    const runs = await (this.prismaClient as IntraQPrismaClient).pipelineRun.findMany({
      where: { pipelineId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return sendOkTrue(res, {
      runs: runs.map(toPipelineRunRecord),
      total: runs.length,
      limit,
      offset: 0
    });
  }

  private sendRuntimeChecks(res: ServerResponse, pipeline: PipelineRecord): true {
    const checks = runtimeChecksFor(pipeline);
    const canRun = checks.every(check => check.status !== 'failed');
    const defaultRuntime = defaultRuntimeFor(pipeline);
    return sendOkTrue(res, {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      status: pipeline.status,
      isActive: pipeline.isActive,
      nodeCount: pipeline.nodes.length,
      connectionCount: pipeline.connections.length,
      canRun,
      defaultRuntime,
      checks,
      runtimes: runtimesFor(pipeline, canRun, defaultRuntime)
    });
  }

  private sendRun(res: ServerResponse, runId: string): true {
    const run = this.findRun(runId);
    return run ? sendOkTrue(res, { ...run, pipeline: this.findPipeline(run.pipelineId) }) : sendNotFound(res, 'Pipeline run not found');
  }

  private async sendDbRun(res: ServerResponse, runId: string): Promise<true> {
    const run = await (this.prismaClient as IntraQPrismaClient).pipelineRun.findUnique({
      where: { id: runId },
      include: {
        pipeline: {
          include: { connections: true, nodes: true, runs: { orderBy: { createdAt: 'desc' }, take: 1 } }
        }
      }
    });
    return run ? sendOkTrue(res, { ...toPipelineRunRecord(run), pipeline: toPipelineRecord(run.pipeline) }) : sendNotFound(res, 'Pipeline run not found');
  }

  private cancelRun(res: ServerResponse, runId: string): true {
    const run = this.findRun(runId);
    if (!run) return sendNotFound(res, 'Pipeline run not found');
    if (!['queued', 'running'].includes(run.status)) {
      sendJson(res, 400, fail('Cannot cancel a pipeline that is not running or queued.'));
      return true;
    }
    Object.assign(run, { status: 'cancelled' as const, completedAt: baseTime });
    return sendOkTrue(res, { id: run.id, status: run.status, message: 'Pipeline run cancelled successfully' });
  }

  private async cancelDbRun(res: ServerResponse, runId: string): Promise<true> {
    const run = await (this.prismaClient as IntraQPrismaClient).pipelineRun.findUnique({ where: { id: runId } });
    if (!run) return sendNotFound(res, 'Pipeline run not found');
    if (!['queued', 'running'].includes(run.status)) {
      sendJson(res, 400, fail('Cannot cancel a pipeline that is not running or queued.'));
      return true;
    }
    const updated = await (this.prismaClient as IntraQPrismaClient).pipelineRun.update({
      where: { id: runId },
      data: { completedAt: new Date(), status: 'cancelled' }
    });
    return sendOkTrue(res, { id: updated.id, status: updated.status, message: 'Pipeline run cancelled successfully' });
  }

  private sendRunLogs(res: ServerResponse, runId: string): true {
    const run = this.findRun(runId);
    if (!run) return sendNotFound(res, 'Pipeline run not found');
    return sendOkTrue(res, { runId, jobId: run.jobId, logs: [`[${runId}] Loading source data`, `[${runId}] Pipeline ${run.status}`], retrievedAt: baseTime });
  }

  private async sendDbRunLogs(res: ServerResponse, runId: string): Promise<true> {
    const run = await (this.prismaClient as IntraQPrismaClient).pipelineRun.findUnique({ where: { id: runId } });
    if (!run) return sendNotFound(res, 'Pipeline run not found');
    const logs = Array.isArray(run.logs) ? run.logs : [`[${runId}] Loading source data`, `[${runId}] Pipeline ${run.status}`];
    return sendOkTrue(res, { runId, jobId: run.jobId, logs, retrievedAt: new Date().toISOString() });
  }

  private generateCode(res: ServerResponse, pipeline: PipelineRecord): true {
    if (pipeline.nodes.length === 0) {
      sendJson(res, 400, fail('Pipeline has no nodes.'));
      return true;
    }
    const code = pipelineScript(pipeline);
    return sendOkTrue(res, { pipelineId: pipeline.id, pipelineName: pipeline.name, nodeCount: pipeline.nodes.length, connectionCount: pipeline.connections.length, generatedAt: baseTime, code, codeStats: { lines: code.split('\n').length, characters: code.length } });
  }

  private async publishToDatabricks(req: IncomingMessage, res: ServerResponse, pipeline: PipelineRecord): Promise<true> {
    const body = await readJsonBody(req);
    if (body !== null && !isRecord(body)) return sendBadRequestTrue(res, 'Request body must be a JSON object.');
    if (pipeline.nodes.length === 0) {
      sendJson(res, 400, fail('Pipeline must contain nodes before publishing.'));
      return true;
    }
    const jobName = isRecord(body) && isNonEmptyString(body.jobName) ? body.jobName.trim() : `${pipeline.name}-job`;
    pipeline.status = 'active';
    pipeline.config = { ...pipeline.config, runtime: 'databricks', databricksJobName: jobName };
    return sendOkTrue(res, { pipelineId: pipeline.id, jobId: `databricks-${pipeline.id}`, jobName, status: 'published', message: 'Pipeline published to Databricks' });
  }

  private async syncCredentials(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) return sendBadRequestTrue(res, 'Request body must be a JSON object.');
    if (this.prismaClient) {
      const total = await this.prismaClient.pipeline.count({ where: pipelineScopeWhere(req) });
      return sendOkTrue(res, { summary: { total, synced: total, failed: 0 }, syncedAt: new Date().toISOString() });
    }
    return sendOkTrue(res, { summary: { total: this.pipelines.length, synced: this.pipelines.length, failed: 0 }, syncedAt: baseTime });
  }

  private pipelineFromBody(body: Record<string, unknown>, id: string, timestamp: string): PipelineRecord {
    return { id, name: String(body.name).trim(), description: asString(body.description) ?? '', status: asStatus(body.status), isActive: body.isActive === undefined ? true : body.isActive === true, config: asRecord(body.config), schedule: isRecord(body.schedule) ? body.schedule : null, createdBy: asString(body.createdBy) ?? 'foundation', createdAt: timestamp, updatedAt: timestamp, nodes: asRecords(body.nodes), connections: asRecords(body.connections) };
  }

  private pipelinePatch(body: Record<string, unknown>): Partial<PipelineRecord> {
    return { ...(isNonEmptyString(body.name) ? { name: body.name.trim() } : {}), ...(body.description !== undefined ? { description: asString(body.description) ?? '' } : {}), ...(body.status !== undefined ? { status: asStatus(body.status) } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive === true } : {}), ...(body.config !== undefined ? { config: asRecord(body.config) } : {}), ...(body.schedule !== undefined ? { schedule: isRecord(body.schedule) ? body.schedule : null } : {}), ...(body.nodes !== undefined ? { nodes: asRecords(body.nodes) } : {}), ...(body.connections !== undefined ? { connections: asRecords(body.connections) } : {}) };
  }

  private findPipeline(id: string): PipelineRecord | undefined {
    return this.pipelines.find(pipeline => pipeline.id === id);
  }

  private findRun(id: string): PipelineRunRecord | undefined {
    return this.runs.find(run => run.id === id);
  }

  private runsForPipeline(id: string): PipelineRunRecord[] {
    return this.runs.filter(run => run.pipelineId === id);
  }
}

export function createPipelineFoundationRoutes(client: IntraQPrismaClient | null = null): PipelineFoundationRoutes {
  return new PipelineFoundationRoutes(client);
}
