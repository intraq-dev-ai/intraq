import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, uuidv7 } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import { isNonEmptyString, isRecord, type Item } from './foundation-route-utils.js';

export async function handleMemoryCollection(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  basePath: string,
  items: Item[],
  label: string
): Promise<boolean> {
  if (url.pathname === basePath) {
    if (req.method === 'GET') sendOk(res, items);
    else if (req.method === 'POST') await createMemoryItem(req, res, items, label);
    else sendJson(res, 405, fail('Method not allowed'));
    return true;
  }
  const match = new RegExp(`^${basePath}/([^/]+)$`).exec(url.pathname);
  if (!match?.[1]) return false;
  const id = decodeURIComponent(match[1]);
  const item = items.find(candidate => candidate.id === id);
  if (!item) {
    sendJson(res, 404, fail(`${label} not found`));
    return true;
  }
  if (req.method === 'GET') sendOk(res, item);
  else if (req.method === 'PUT') await updateMemoryItem(req, res, item);
  else if (req.method === 'DELETE') {
    items.splice(items.indexOf(item), 1);
    sendOk(res, { message: `${label} deleted successfully` });
  } else {
    sendJson(res, 405, fail('Method not allowed'));
  }
  return true;
}

export async function createMemoryItem(
  req: IncomingMessage,
  res: ServerResponse,
  items: Item[],
  _label: string
): Promise<void> {
  const body = await readJsonBody(req);
  if (!isRecord(body) || !isNonEmptyString(body.name)) {
    sendBadRequest(res, 'name is required');
    return;
  }
  const item = { id: uuidv7(), name: body.name.trim(), ...body };
  items.unshift(item);
  sendOk(res, item);
}

export async function updateMemoryItem(req: IncomingMessage, res: ServerResponse, item: Item): Promise<void> {
  const body = await readJsonBody(req);
  Object.assign(item, isRecord(body) ? body : {}, { id: item.id });
  sendOk(res, item);
}

export function setMemoryDefault(res: ServerResponse, items: Item[], id: string, missingMessage: string): void {
  const selected = items.find(item => item.id === id);
  if (!selected) {
    sendJson(res, 404, fail(missingMessage));
    return;
  }
  for (const item of items) item.isDefault = item.id === id;
  sendOk(res, selected);
}
