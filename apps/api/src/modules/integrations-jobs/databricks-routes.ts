import type { IncomingMessage, ServerResponse } from 'node:http';
import { uuidv7 } from '@intraq/contracts';
import { sendCompatBadRequest, sendCompatJson, sendCompatNotFound, readCompatRecord } from './compat-http.js';
import type { DatabricksJob, IntegrationsJobsStore } from './store.js';
import { asRecord, decodePart, fixedNow, isNonEmptyString, isRecord } from './shared.js';

export class DatabricksJobsCompatRoutes {
  constructor(private readonly store: IntegrationsJobsStore) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/databricks-jobs/list') {
      this.listJobs(res, url);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/databricks-jobs/create-persistent') {
      await this.createPersistentJob(req, res);
      return true;
    }

    const runMatch = /^\/api\/databricks-jobs\/([^/]+)\/run$/.exec(url.pathname);
    if (req.method === 'POST' && runMatch?.[1]) {
      await this.runJob(req, res, decodePart(runMatch[1]));
      return true;
    }

    const jobMatch = /^\/api\/databricks-jobs\/([^/]+)$/.exec(url.pathname);
    if (jobMatch?.[1]) {
      await this.handleJob(req, res, decodePart(jobMatch[1]));
      return true;
    }

    return false;
  }

  private listJobs(res: ServerResponse, url: URL): void {
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '25', 10);
    const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 25;
    const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    const jobs = this.store.databricksJobs.slice(safeOffset, safeOffset + safeLimit);

    sendCompatJson(res, 200, {
      success: true,
      data: {
        jobs,
        hasMore: safeOffset + safeLimit < this.store.databricksJobs.length,
        nextPageToken: safeOffset + safeLimit < this.store.databricksJobs.length ? String(safeOffset + safeLimit) : null
      }
    });
  }

  private async createPersistentJob(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readCompatRecord(req);
    if (!body || !isNonEmptyString(body.pipelineId)) {
      sendCompatBadRequest(res, 'pipelineId is required to create a persistent Databricks job.');
      return;
    }

    const existing = this.store.databricksJobs.find(job => job.pipelineId === body.pipelineId);
    const jobName = isNonEmptyString(body.jobName) ? body.jobName.trim() : `${body.pipelineId.trim()}-job`;
    const job = existing ?? this.createJob(body.pipelineId.trim(), jobName);
    job.pipelineName = jobName.replace(/-job$/i, '');
    job.settings = {
      ...job.settings,
      name: jobName,
      schedule: body.schedule ?? null,
      email_notifications: body.emailNotifications ?? null,
      max_concurrent_runs: body.maxConcurrentRuns ?? 1,
      timeout_seconds: body.timeoutSeconds ?? 3600
    };
    job.updatedAt = fixedNow;

    sendCompatJson(res, 200, {
      success: true,
      message: existing ? 'Persistent Databricks job updated successfully' : 'Persistent Databricks job created successfully',
      data: {
        jobId: Number(job.jobId),
        jobUrl: job.jobUrl,
        pipelineName: job.pipelineName,
        schedule: body.schedule ?? null,
        isUpdate: Boolean(existing)
      }
    });
  }

  private async handleJob(req: IncomingMessage, res: ServerResponse, jobId: string): Promise<void> {
    if (!isNumericId(jobId)) {
      sendCompatBadRequest(res, 'jobId must be numeric.');
      return;
    }

    const job = this.findJob(jobId);
    if (!job) {
      sendCompatNotFound(res, 'Databricks job not found');
      return;
    }

    if (req.method === 'GET') {
      sendCompatJson(res, 200, { success: true, data: job });
      return;
    }
    if (req.method === 'PUT') {
      await this.updateJob(req, res, job);
      return;
    }
    if (req.method === 'DELETE') {
      this.store.databricksJobs = this.store.databricksJobs.filter(candidate => candidate.jobId !== jobId);
      sendCompatJson(res, 200, { success: true, message: 'Job deleted successfully' });
      return;
    }

    return sendCompatJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  private async runJob(req: IncomingMessage, res: ServerResponse, jobId: string): Promise<void> {
    if (!isNumericId(jobId)) {
      sendCompatBadRequest(res, 'jobId must be numeric.');
      return;
    }
    const job = this.findJob(jobId);
    if (!job) {
      sendCompatNotFound(res, 'Databricks job not found');
      return;
    }

    const body = await readCompatRecord(req);
    if (!body) {
      sendCompatBadRequest(res, 'Request body must be a JSON object.');
      return;
    }
    const runId = `run-${jobId}-${this.store.nextDatabricksRunId++}`;
    job.lastRunId = runId;
    sendCompatJson(res, 200, {
      success: true,
      message: 'Job triggered successfully',
      data: { runId, jobId: Number(jobId), parameters: asRecord(body.parameters) }
    });
  }

  private async updateJob(req: IncomingMessage, res: ServerResponse, job: DatabricksJob): Promise<void> {
    const body = await readCompatRecord(req);
    const jobSettings = body && 'jobSettings' in body ? body.jobSettings : body;
    if (!body || !isRecord(jobSettings) || Object.keys(jobSettings).length === 0) {
      sendCompatBadRequest(res, 'jobSettings must be a JSON object.');
      return;
    }

    job.settings = { ...job.settings, ...jobSettings };
    job.updatedAt = fixedNow;
    sendCompatJson(res, 200, { success: true, message: 'Job updated successfully' });
  }

  private createJob(pipelineId: string, jobName: string): DatabricksJob {
    const jobId = String(this.store.nextDatabricksJobId++);
    const job: DatabricksJob = {
      id: uuidv7(),
      jobId,
      job_id: Number(jobId),
      pipelineId,
      pipelineName: jobName.replace(/-job$/i, ''),
      jobUrl: `https://databricks.example.local/#job/${jobId}`,
      settings: {
        name: jobName,
        tags: { Project: 'intraq', PipelineId: pipelineId },
        new_cluster: { custom_tags: { Project: 'intraq' } }
      },
      created_time: 1_777_680_000_000 + Number(jobId),
      updatedAt: fixedNow,
      lastRunId: null
    };
    this.store.databricksJobs.unshift(job);
    return job;
  }

  private findJob(jobId: string): DatabricksJob | undefined {
    return this.store.databricksJobs.find(job => job.jobId === jobId);
  }
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}
