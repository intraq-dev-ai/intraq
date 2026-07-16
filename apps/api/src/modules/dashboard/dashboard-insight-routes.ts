import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import { agentUnavailableDetails } from '../../product-agent-routes-agent-provider.js';
import type { DashboardAccessScope, DashboardElement, DashboardRuntimeStore } from './foundation-store.js';
import {
  DashboardInsightAgentUnavailableError,
  DashboardInsightSummaryService,
  type DashboardInsightEvidence
} from './dashboard-insight-summary.js';

const ROUTE_PATTERN = /^\/api\/dashboards\/([^/]+)\/elements\/([^/]+)\/ai-summary$/;
const DATA_ELEMENT_TYPES = new Set(['area', 'bar', 'card', 'chart', 'column', 'line', 'matrix', 'pie', 'stacked', 'table']);
const INVALID = Symbol('invalid-dashboard-insight-value');

export class DashboardInsightRoutes {
  constructor(
    private readonly store: DashboardRuntimeStore,
    private readonly summaries: DashboardInsightSummaryService
  ) {}

  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    scope?: DashboardAccessScope
  ): Promise<boolean> {
    const match = ROUTE_PATTERN.exec(url.pathname);
    if (!match?.[1] || !match[2]) return false;
    if (req.method !== 'POST') return false;

    const dashboardId = decodePathPart(match[1]);
    const elementId = decodePathPart(match[2]);
    if (!dashboardId || !elementId) {
      sendBadRequest(res, 'Dashboard and summary element IDs are required.');
      return true;
    }
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'Dashboard insight request body must be a JSON object.');
      return true;
    }
    const filterState = readFilterState(body.filters);
    const runtimeParameterValues = readRuntimeParameterValues(body.runtimeParameterValues);
    if (filterState === INVALID || runtimeParameterValues === INVALID) {
      sendBadRequest(res, 'Dashboard insight filters and runtime parameters are invalid.');
      return true;
    }

    const dashboard = await this.store.getDashboard(dashboardId, scope);
    if (!dashboard) {
      sendJson(res, 404, fail('Dashboard not found'));
      return true;
    }
    const element = dashboard.elements.find(item => item.id === elementId);
    if (!isAiSummaryElement(element)) {
      sendBadRequest(res, 'The requested element is not an AI-generated text summary.');
      return true;
    }
    const evidence = readEvidence(body.evidence, dashboard.elements);
    if (evidence === INVALID) {
      sendBadRequest(res, 'Dashboard insight evidence is invalid.');
      return true;
    }

    try {
      sendOk(res, await this.summaries.resolve({
        dashboard,
        element,
        ...(evidence ? { evidence } : {}),
        filterState,
        ...(runtimeParameterValues ? { runtimeParameterValues } : {}),
        tenantId: scope?.tenantId ?? null,
        userId: scope?.userId ?? 'anonymous'
      }));
    } catch (error) {
      if (error instanceof DashboardInsightAgentUnavailableError) {
        sendJson(res, 503, fail(error.message, agentUnavailableDetails(error.agentProvider)));
        return true;
      }
      throw error;
    }
    return true;
  }
}

function isAiSummaryElement(element: DashboardElement | undefined): element is DashboardElement {
  return Boolean(
    element
    && element.type === 'text'
    && element.config.aiGenerated === true
    && readText(element.config.generationPrompt, 2_000)
  );
}

function readFilterState(value: unknown): unknown[] | typeof INVALID {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) return INVALID;
  const filters: unknown[] = [];
  for (const item of value) {
    if (!isRecord(item)) return INVALID;
    const filter = boundedRecord(item, 3, 30, 500);
    if (filter === INVALID) return INVALID;
    filters.push(filter);
  }
  return filters;
}

function readRuntimeParameterValues(value: unknown): Record<string, unknown> | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return INVALID;
  const result = boundedRecord(value, 2, 30, 500);
  return result === INVALID ? INVALID : result;
}

function readEvidence(
  value: unknown,
  elements: DashboardElement[]
): DashboardInsightEvidence[] | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) return INVALID;
  const elementsById = new Map(elements.map(element => [element.id, element]));
  const evidence: DashboardInsightEvidence[] = [];
  for (const item of value) {
    if (!isRecord(item)) return INVALID;
    const elementId = readText(item.elementId, 180);
    const element = elementId ? elementsById.get(elementId) : undefined;
    if (!element || element.isVisible === false || !DATA_ELEMENT_TYPES.has(normalizedType(element.type))) return INVALID;
    if (!Array.isArray(item.values) || item.values.length === 0 || item.values.length > 5) return INVALID;
    const values: DashboardInsightEvidence['values'] = [];
    for (const row of item.values) {
      const parsed = readEvidenceRow(row);
      if (parsed === INVALID) return INVALID;
      values.push(parsed);
    }
    const format = evidenceFormat(element);
    evidence.push({
      elementId: elementId as string,
      ...(format ? { format } : {}),
      name: element.name,
      type: normalizedType(element.type),
      values
    });
  }
  return evidence;
}

function readEvidenceRow(value: unknown): DashboardInsightEvidence['values'][number] | typeof INVALID {
  if (!isRecord(value) || Object.keys(value).length > 16) return INVALID;
  const result: DashboardInsightEvidence['values'][number] = {};
  for (const [key, raw] of Object.entries(value)) {
    const field = readText(key, 120);
    if (!field) return INVALID;
    if (raw === null || typeof raw === 'boolean') {
      result[field] = raw;
      continue;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      result[field] = raw;
      continue;
    }
    const text = readText(raw, 240);
    if (!text) return INVALID;
    result[field] = text;
  }
  return Object.keys(result).length > 0 ? result : INVALID;
}

function evidenceFormat(element: DashboardElement): string | undefined {
  const valueField = readText(element.config.valueField ?? element.config.field, 120);
  const formats = isRecord(element.config.fieldFormats) ? element.config.fieldFormats : {};
  return readText(element.config.formatType, 40)
    ?? (valueField ? readText(formats[valueField], 40) : undefined);
}

function boundedRecord(
  value: Record<string, unknown>,
  depth: number,
  maxKeys: number,
  maxStringLength: number
): Record<string, unknown> | typeof INVALID {
  if (Object.keys(value).length > maxKeys) return INVALID;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const cleanKey = readText(key, 120);
    if (!cleanKey) return INVALID;
    const cleanValue = boundedValue(item, depth, maxKeys, maxStringLength);
    if (cleanValue === INVALID) return INVALID;
    result[cleanKey] = cleanValue;
  }
  return result;
}

function boundedValue(
  value: unknown,
  depth: number,
  maxKeys: number,
  maxStringLength: number
): unknown | typeof INVALID {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : INVALID;
  if (typeof value === 'string') return value.length <= maxStringLength ? value : INVALID;
  if (depth <= 0) return INVALID;
  if (Array.isArray(value)) {
    if (value.length > 50) return INVALID;
    const values = value.map(item => boundedValue(item, depth - 1, maxKeys, maxStringLength));
    return values.includes(INVALID) ? INVALID : values;
  }
  return isRecord(value) ? boundedRecord(value, depth - 1, maxKeys, maxStringLength) : INVALID;
}

function normalizedType(value: string): string {
  return value.trim().toLowerCase();
}

function decodePathPart(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function readText(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= maxLength
    ? value.trim()
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
