import type { IncomingMessage } from 'node:http';
import { readJsonBody } from '../../http.js';
import {
  asNonNegativeInteger,
  asPositiveInteger,
  csvStringArray,
  isRecord,
  readJsonStringArray,
  readRecord,
  readString,
  stringArray
} from './foundation-route-utils.js';
import type { TableDefinition } from './foundation-store.js';

type PublicApiWorkflowOptions = {
  defaultLimit?: number;
  includePaginationProbe?: boolean;
  maxLimit?: number;
  offset?: number;
  page?: number;
  pageSize?: number;
  parameterValues?: Record<string, unknown>;
  selectFields?: string[];
};

type RowsData = {
  columns: string[];
  rowCount: number;
  rows: Array<Record<string, unknown>>;
};

export async function readPublicApiWorkflowOptions(
  req: IncomingMessage,
  url: URL
): Promise<PublicApiWorkflowOptions> {
  const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
  const record = isRecord(body) ? body : {};
  const queryLimit = asPositiveInteger(url.searchParams.get('limit'));
  const queryPageSize = asPositiveInteger(url.searchParams.get('pageSize')) ?? asPositiveInteger(url.searchParams.get('take'));
  const bodyLimit = asPositiveInteger(record.limit) ?? asPositiveInteger(record.defaultLimit);
  const bodyPageSize = asPositiveInteger(record.pageSize) ?? asPositiveInteger(record.take);
  const requestedLimit = bodyLimit ?? queryLimit;
  const requestedPageSize = bodyPageSize ?? queryPageSize ?? requestedLimit ?? 100;
  const requestedMaxLimit = asPositiveInteger(record.maxLimit) ?? asPositiveInteger(url.searchParams.get('maxLimit'));
  const requestedOffset = asNonNegativeInteger(record.offset)
    ?? asNonNegativeInteger(record.skip)
    ?? asNonNegativeInteger(url.searchParams.get('offset'))
    ?? asNonNegativeInteger(url.searchParams.get('skip'));
  const requestedPage = asPositiveInteger(record.page) ?? asPositiveInteger(url.searchParams.get('page'));
  const selectFields = stringArray(record.selectFields).length > 0
    ? stringArray(record.selectFields)
    : csvStringArray(url.searchParams.get('selectFields'));
  const parameterValues = {
    ...parameterValuesFromQuery(url),
    ...parameterValuesFromBody(record),
    ...readRecord(record.parameters),
    ...readRecord(record.parameterValues)
  };
  return {
    defaultLimit: requestedPageSize,
    includePaginationProbe: true,
    maxLimit: requestedMaxLimit ?? requestedPageSize,
    pageSize: requestedPageSize,
    ...(requestedOffset !== undefined ? { offset: requestedOffset } : {}),
    ...(requestedPage !== undefined ? { page: requestedPage } : {}),
    ...(Object.keys(parameterValues).length > 0 ? { parameterValues } : {}),
    ...(selectFields.length > 0 ? { selectFields } : {})
  };
}

export function apiWorkflowContractPayload(table: TableDefinition, data: RowsData): Record<string, unknown> | null {
  const contractName = readApiWorkflowResponseContract(table);
  if (!isLegacyResponseContract(contractName)) return null;
  return legacyResponseContractPayload(table, data);
}

function readApiWorkflowResponseContract(table: TableDefinition): string | null {
  const settings = readRecord(table.settings);
  const api = readRecord(settings.api);
  const contract = readRecord(settings.contract);
  return readString(
    settings.responseContract
      ?? settings.responseContractType
      ?? settings.legacyResponseContract
      ?? contract.type
      ?? api.responseContract
      ?? api.contract
  )?.toLowerCase() ?? null;
}

function isLegacyResponseContract(contractName: string | null): boolean {
  return contractName === 'legacy-response' || contractName === 'legacy-report' || contractName === 'external-report';
}

function legacyResponseContractPayload(table: TableDefinition, data: RowsData): Record<string, unknown> {
  const settings = readRecord(table.settings);
  const legacyResponseContract = readRecord(settings.legacyResponseContract ?? settings.reportingContract ?? settings.contract);
  const overridePayload = legacyResponsePayloadOverride(legacyResponseContract, data);
  if (overridePayload) return overridePayload;
  const configuredPayload = configuredLegacyResponsePayload(legacyResponseContract, data);
  if (configuredPayload) return configuredPayload;
  const assertions = readRecord(legacyResponseContract.assertions ?? legacyResponseContract);
  const successPath = readString(assertions.successPath) ?? 'Successed';
  const requiredPaths = readJsonStringArray(assertions.requiredPaths);
  const arrayPaths = readJsonStringArray(assertions.arrayPaths);
  const objectPaths = readJsonStringArray(assertions.objectPaths);
  const numericPaths = readJsonStringArray(assertions.numericPaths);
  const payload: Record<string, unknown> = {};
  const dataNeedsObject = [...requiredPaths, ...arrayPaths, ...objectPaths, ...numericPaths]
    .some(item => /^Data\./i.test(item));

  setPath(payload, successPath, true);
  if (readPath(payload, 'Data') === undefined) {
    payload.Data = dataNeedsObject ? {} : data.rows;
  }

  for (const path of requiredPaths) {
    if (readPath(payload, path) !== undefined) continue;
    setPath(payload, path, defaultLegacyContractValue(path, data));
  }
  for (const path of arrayPaths) {
    if (!Array.isArray(readPath(payload, path))) setPath(payload, path, legacyContractArrayValue(path, data));
  }
  for (const path of objectPaths) {
    if (!isRecord(readPath(payload, path))) setPath(payload, path, {});
  }
  for (const path of numericPaths) {
    if (typeof readPath(payload, path) !== 'number') setPath(payload, path, data.rowCount);
  }

  return payload;
}

function legacyResponsePayloadOverride(
  legacyResponseContract: Record<string, unknown>,
  data: { rows: Array<Record<string, unknown>> }
): Record<string, unknown> | null {
  const mode = normalizedShape(
    legacyResponseContract.payloadMode
      ?? legacyResponseContract.payloadType
      ?? legacyResponseContract.dataMode
      ?? legacyResponseContract.outputShape
  );
  if (mode !== 'firstrowpayload' && mode !== 'payload') return null;
  const payloadColumn = readString(legacyResponseContract.payloadColumn ?? legacyResponseContract.payloadField) ?? 'payload';
  const row = data.rows[0];
  if (!row || row[payloadColumn] === undefined || row[payloadColumn] === null) return null;
  const parsed = parseJsonValue(row[payloadColumn]);
  return isRecord(parsed) ? parsed : null;
}

function configuredLegacyResponsePayload(
  legacyResponseContract: Record<string, unknown>,
  data: { rowCount: number; rows: Array<Record<string, unknown>> }
): Record<string, unknown> | null {
  const shape = normalizedShape(
    legacyResponseContract.outputShape
      ?? legacyResponseContract.responseShape
      ?? legacyResponseContract.resultShape
      ?? legacyResponseContract.shape
  );
  if (!shape) return null;
  if (shape === 'kendo' || shape === 'kendodatasource' || shape === 'datasourceresult') {
    return rowsEnvelopePayload(legacyResponseContract, data, {
      dataPath: 'Data',
      totalPath: 'Total',
      successPath: '',
      errorPath: ''
    });
  }
  if (shape === 'listserviceresponse' || shape === 'listresponse' || shape === 'wrappedlist') {
    return rowsEnvelopePayload(legacyResponseContract, data, {
      dataPath: 'Data',
      totalPath: 'TotalCount',
      successPath: 'IsSuccess',
      errorPath: 'ErrorMessage'
    });
  }
  if (shape === 'rowsenvelope' || shape === 'customenvelope') {
    return rowsEnvelopePayload(legacyResponseContract, data, {
      dataPath: 'Data',
      totalPath: '',
      successPath: 'Successed',
      errorPath: 'ErrorMessage'
    });
  }
  return null;
}

function rowsEnvelopePayload(
  responseContract: Record<string, unknown>,
  data: { rowCount: number; rows: Array<Record<string, unknown>> },
  defaults: { dataPath: string; errorPath: string; successPath: string; totalPath: string }
): Record<string, unknown> {
  const assertions = readRecord(responseContract.assertions ?? responseContract);
  const payload: Record<string, unknown> = {};
  const successPath = readString(responseContract.successPath ?? assertions.successPath) ?? defaults.successPath;
  const dataPath = readString(responseContract.dataPath ?? responseContract.rowsPath) ?? defaults.dataPath;
  const totalPath = readString(responseContract.totalPath ?? responseContract.totalCountPath ?? responseContract.countPath) ?? defaults.totalPath;
  const errorPath = readString(responseContract.errorPath ?? responseContract.messagePath) ?? defaults.errorPath;
  const successValue = responseContract.successValue === false ? false : true;
  if (successPath) setPath(payload, successPath, successValue);
  if (errorPath) setPath(payload, errorPath, null);
  if (dataPath) setPath(payload, dataPath, data.rows);
  if (totalPath) setPath(payload, totalPath, data.rowCount);
  return payload;
}

function normalizedShape(value: unknown): string {
  return (readString(value) ?? '').toLowerCase().replace(/[\s_-]+/g, '');
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function defaultLegacyContractValue(path: string, data: RowsData): unknown {
  const lower = path.toLowerCase();
  if (lower.endsWith('.data') || lower === 'data' || lower.includes('summaries') || lower.includes('list')) return data.rows;
  if (lower.includes('total') || lower.includes('count')) return data.rowCount;
  if (lower.includes('range') || lower.includes('label') || lower.includes('name')) return [];
  return {};
}

function legacyContractArrayValue(path: string, data: RowsData): unknown[] {
  const lower = path.toLowerCase();
  if (lower.endsWith('.data') || lower === 'data' || lower.includes('summaries') || lower.includes('list')) return data.rows;
  if (lower.includes('label') || lower.includes('range') || lower.includes('name')) {
    const firstColumn = data.columns[0];
    return firstColumn ? data.rows.map(row => row[firstColumn]).filter(value => value !== undefined) : [];
  }
  return [];
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return;
  let current: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    if (!isRecord(current[part])) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function readPath(source: unknown, path: string): unknown {
  let current = source;
  for (const part of path.split('.').map(item => item.trim()).filter(Boolean)) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function parameterValuesFromQuery(url: URL): Record<string, string> {
  const reserved = new Set(['limit', 'maxLimit', 'offset', 'page', 'pageSize', 'selectFields', 'skip', 'take']);
  return Object.fromEntries([...url.searchParams.entries()].filter(([key]) => !reserved.has(key)));
}

function parameterValuesFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const reserved = new Set([
    'dashboardFilters',
    'defaultLimit',
    'limit',
    'maxLimit',
    'offset',
    'page',
    'pageSize',
    'parameterValues',
    'parameters',
    'selectFields',
    'skip',
    'take'
  ]);
  return Object.fromEntries(Object.entries(body).filter(([key]) => !reserved.has(key)));
}
