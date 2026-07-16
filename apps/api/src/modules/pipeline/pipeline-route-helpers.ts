import type { ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { sendBadRequest, sendJson, sendOk } from '../../http.js';
import type { PipelineRecord } from './foundation-store.js';

export function pipelineScript(pipeline: PipelineRecord): string {
  const nodes = pipeline.nodes.map(node => `# node ${String(node.id)}: ${String(node.name ?? node.label ?? node.type)}`);
  return [`# Generated pipeline: ${pipeline.name}`, ...nodes, `print("running ${pipeline.id}")`].join('\n');
}

export function sendNotFound(res: ServerResponse, message: string): true {
  sendJson(res, 404, fail(message));
  return true;
}

export function sendOkTrue(res: ServerResponse, data: unknown): true {
  sendOk(res, data);
  return true;
}

export function sendBadRequestTrue(res: ServerResponse, message: string): true {
  sendBadRequest(res, message);
  return true;
}

export function decodePart(value: string): string {
  return decodeURIComponent(value);
}
