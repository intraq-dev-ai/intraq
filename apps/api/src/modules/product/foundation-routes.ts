import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { sendJson, sendOk } from '../../http.js';

const pipelines: Array<{ id: string; name: string; status: string; source: string }> = [];

export class ProductFoundationRoutes {
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/dashboard-suggestions') {
      sendOk(res, {
        suggestions: [
          'Model-driven performance overview',
          'Metadata metric trend analysis',
          'Dimension and segment comparison'
        ]
      });
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/pipelines') {
      sendOk(res, { pipelines });
      return true;
    }

    const pipelineRunsMatch = /^\/api\/pipelines\/([^/]+)\/runs$/.exec(url.pathname);
    if (req.method === 'GET' && pipelineRunsMatch?.[1]) {
      this.sendPipelineRuns(res, decodeURIComponent(pipelineRunsMatch[1]));
      return true;
    }

    return false;
  }

  private sendPipelineRuns(res: ServerResponse, pipelineId: string): void {
    if (!pipelines.some(pipeline => pipeline.id === pipelineId)) {
      sendDomainNotFound(res, 'Pipeline not found');
      return;
    }
    sendOk(res, { runs: [{ id: `${pipelineId}-run-1`, status: 'completed', rowCount: 1280 }] });
  }
}

export function createProductFoundationRoutes(): ProductFoundationRoutes {
  return new ProductFoundationRoutes();
}

function sendDomainNotFound(res: ServerResponse, message: string): void {
  sendJson(res, 404, fail(message));
}
