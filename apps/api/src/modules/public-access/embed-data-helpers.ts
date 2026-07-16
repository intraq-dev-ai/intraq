import type { DataSourceRecord, TableDefinition } from '../data-source/foundation-store.js';
import type { Dashboard } from '../dashboard/foundation-store.js';
import { summarizeDataAccessRules } from './embed-access-scope.js';
import { normalizeEmbedDataScope } from './embed-data-scope.js';
import type {
  EmbedDataAccessRule,
  EmbedDataScope,
  EmbedScopeFilter,
  EmbedToken
} from './embed-token-store.js';
import { allowedOriginMatches } from './embed-domain-security.js';
import {
  currentTenant,
  firstString,
  isNonEmptyString,
  isRecord,
  readOptionalString
} from './embed-common.js';

export function bodyWithEmbedParameterValues(
  body: Record<string, unknown>,
  token: EmbedToken,
  filters: readonly EmbedScopeFilter[],
  denyAll: boolean
): Record<string, unknown> {
  const embedParameters = embedParameterValues(token, filters, denyAll);
  if (Object.keys(embedParameters).length === 0) return body;
  const items = Array.isArray(body.items)
    ? body.items.map(item => itemWithEmbedParameterValues(item, embedParameters))
    : body.items;
  return {
    ...body,
    ...(items ? { items } : {}),
    ...(isRecord(body.chartDataRequest)
      ? { chartDataRequest: requestWithEmbedParameterValues(body.chartDataRequest, embedParameters) }
      : {}),
    ...(isRecord(body.request)
      ? { request: requestWithEmbedParameterValues(body.request, embedParameters) }
      : {}),
    parameterValues: mergedEmbedParameterValues(body, embedParameters)
  };
}

export function toEmbedDataSource(source: DataSourceRecord): Record<string, unknown> {
  const table = source.tables.find(item => item.isSelected) ?? source.tables[0];
  return {
    id: source.id,
    dataSourceId: source.id,
    name: source.name,
    type: source.type,
    tableName: table?.name,
    tenant: currentTenant(),
    tables: source.tables.map(toEmbedTable)
  };
}

export function sanitizeDashboardRenderEvent(
  value: Record<string, unknown>,
  context: { dashboardId?: string; runtime: string }
): Record<string, unknown> {
  return {
    at: readOptionalString(value.at) ?? new Date().toISOString(),
    componentType: sanitizeLogText(value.componentType, 80),
    dashboardId: readOptionalString(value.dashboardId) ?? context.dashboardId ?? '',
    dataSourceId: sanitizeLogText(value.dataSourceId, 120),
    elementId: sanitizeLogText(value.elementId, 120),
    elementName: sanitizeLogText(value.elementName, 160),
    errorType: sanitizeLogText(value.errorType, 80),
    message: sanitizeLogMessage(value.message, 500),
    renderKind: sanitizeLogText(value.renderKind, 40),
    runtime: context.runtime,
    statusCode: readStatusCode(value.statusCode),
    tableName: sanitizeLogText(value.tableName, 160)
  };
}

export function dashboardAllowedForExternalClient(dashboardId: string, actorAllowedDashboardIds?: readonly string[]): boolean {
  if (actorAllowedDashboardIds && actorAllowedDashboardIds.length > 0) {
    return actorAllowedDashboardIds.includes('*') || actorAllowedDashboardIds.includes(dashboardId);
  }
  const configured = process.env.EMBED_EXTERNAL_ALLOWED_DASHBOARDS;
  if (!isNonEmptyString(configured)) return true;
  const allowed = configured.split(',').map(item => item.trim()).filter(Boolean);
  return allowed.includes('*') || allowed.includes(dashboardId);
}

export function allowedDomainsAllowedForActor(allowedDomains: readonly string[], actorAllowedDomains?: readonly string[]): boolean {
  if (!actorAllowedDomains || actorAllowedDomains.length === 0) return true;
  return allowedDomains.every(domain => actorAllowedDomains.some(allowed => allowedOriginMatches(allowed, domain)));
}

export function dataScopeAllowedForActor(scope: EmbedDataScope | undefined, actorAllowedDataSourceIds?: readonly string[]): boolean {
  if (!actorAllowedDataSourceIds || actorAllowedDataSourceIds.length === 0 || actorAllowedDataSourceIds.includes('*')) return true;
  return (scope?.dataSourceIds ?? []).every(id => actorAllowedDataSourceIds.includes(id));
}

export function dataScopeWithActorAllowList(scope: EmbedDataScope | undefined, actorAllowedDataSourceIds?: readonly string[]): EmbedDataScope | undefined {
  if (!actorAllowedDataSourceIds || actorAllowedDataSourceIds.length === 0 || actorAllowedDataSourceIds.includes('*')) return scope;
  return normalizeEmbedDataScope({
    dataSourceIds: scope?.dataSourceIds?.length ? scope.dataSourceIds : actorAllowedDataSourceIds,
    filters: scope?.filters ?? []
  });
}

export function dashboardElementSourceId(element: Dashboard['elements'][number]): string | undefined {
  const config = element.config;
  const dataRef = recordValue(config, 'dataRef') ?? recordValue(recordValue(config, 'visualization'), 'dataRef');
  return firstString(
    element.dataSourceId,
    config.dataSourceId,
    config.sourceId,
    dataRef?.sourceId,
    dataRef?.dataSourceId
  );
}

export function dashboardElementTableKey(element: Dashboard['elements'][number]): string | undefined {
  const config = element.config;
  const dataRef = recordValue(config, 'dataRef') ?? recordValue(recordValue(config, 'visualization'), 'dataRef');
  return firstString(
    config.dataSourceTableId,
    config.tableId,
    config.tableName,
    dataRef?.tableId,
    dataRef?.tableName,
    dataRef?.dataSourceTableId
  );
}

export function addTableKeys(output: Set<string>, tableId: string, sourceId?: string, tableName?: string): void {
  if (isNonEmptyString(tableId)) {
    output.add(tableId.trim());
    if (sourceId) output.add(`${sourceId}:${tableId.trim()}`);
  }
  if (isNonEmptyString(tableName)) {
    output.add(tableName.trim());
    if (sourceId) output.add(`${sourceId}:${tableName.trim()}`);
  }
}

export function publicEmbedAccessContextPatch(value: unknown): { accessContext?: Record<string, unknown>; context?: Record<string, unknown> } {
  const context = sanitizePublicEmbedAccessContext(embedAccessContextWithCommonAliases(value));
  return context && Object.keys(context).length > 0
    ? { accessContext: context, context }
    : {};
}

export function embedAccessContextWithCommonAliases(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const context = { ...value };
  if (context.locationList === undefined) {
    if (Array.isArray(context.locationIds)) context.locationList = context.locationIds;
    else if (context.locationId !== undefined && context.locationId !== null && context.locationId !== '') context.locationList = [context.locationId];
  }
  if (context.companyId === undefined && context.clientId !== undefined) context.companyId = context.clientId;
  if (context.companyIds === undefined && Array.isArray(context.clientIds)) context.companyIds = context.clientIds;
  return context;
}

export function summarizeDataScope(scope: EmbedDataScope | undefined, accessRules?: readonly EmbedDataAccessRule[]): Record<string, unknown> {
  return {
    dataSourceIds: scope?.dataSourceIds ?? [],
    filterCount: scope?.filters.length ?? 0,
    ...summarizeDataAccessRules(accessRules)
  };
}

function itemWithEmbedParameterValues(item: unknown, embedParameters: Record<string, unknown>): unknown {
  if (!isRecord(item)) return item;
  return {
    ...item,
    ...(isRecord(item.chartDataRequest)
      ? { chartDataRequest: requestWithEmbedParameterValues(item.chartDataRequest, embedParameters) }
      : {}),
    ...(isRecord(item.request)
      ? { request: requestWithEmbedParameterValues(item.request, embedParameters) }
      : {})
  };
}

function requestWithEmbedParameterValues(
  request: Record<string, unknown>,
  embedParameters: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...request,
    parameterValues: mergedEmbedParameterValues(request, embedParameters)
  };
}

function mergedEmbedParameterValues(
  source: Record<string, unknown>,
  embedParameters: Record<string, unknown>
): Record<string, unknown> {
  const currentParameters = isRecord(source.parameterValues)
    ? source.parameterValues
    : isRecord(source.parameters)
      ? source.parameters
      : {};
  const currentEmbed = isRecord(currentParameters.embed) ? currentParameters.embed : {};
  const secureEmbed = isRecord(embedParameters.embed) ? embedParameters.embed : {};
  return {
    ...currentParameters,
    ...embedParameters,
    embed: {
      ...currentEmbed,
      ...secureEmbed
    }
  };
}

function embedParameterValues(
  token: EmbedToken,
  filters: readonly EmbedScopeFilter[],
  denyAll: boolean
): Record<string, unknown> {
  const context = embedAccessContextWithCommonAliases(token.accessContext);
  const filterValues = embedFilterParameterValues(filters);
  const embed = {
    ...(Object.keys(context).length > 0 ? { accessContext: context, context } : {}),
    dashboardId: token.dashboardId,
    denyAll,
    ...(token.externalClientId ? { externalClientId: token.externalClientId } : {}),
    ...(token.externalCustomerId ? { externalCustomerId: token.externalCustomerId } : {}),
    ...(token.externalUserId ? { externalUserId: token.externalUserId } : {}),
    ...(Object.keys(filterValues.filters).length > 0 ? { filters: filterValues.filters, filterValues: filterValues.values } : {}),
    ...(token.tenantId ? { tenantId: token.tenantId } : {})
  };
  return {
    ...context,
    embed
  };
}

function embedFilterParameterValues(filters: readonly EmbedScopeFilter[]): {
  filters: Record<string, { operator: string; value?: unknown; values: unknown[] }>;
  values: Record<string, unknown[]>;
} {
  const filtersByColumn: Record<string, { operator: string; value?: unknown; values: unknown[] }> = {};
  const valuesByColumn: Record<string, unknown[]> = {};
  for (const filter of filters) {
    const values = filter.values ?? (filter.value !== undefined ? [filter.value] : []);
    const entry = {
      operator: filter.operator,
      ...(values.length > 0 ? { value: values[0] } : {}),
      values
    };
    for (const key of filterParameterKeys(filter.column)) {
      filtersByColumn[key] = entry;
      valuesByColumn[key] = values;
    }
  }
  return { filters: filtersByColumn, values: valuesByColumn };
}

function filterParameterKeys(column: string): string[] {
  const trimmed = column.trim();
  if (!trimmed) return [];
  const normalized = trimmed.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return [...new Set([trimmed, normalized].filter(Boolean))];
}

function toEmbedTable(table: TableDefinition): Record<string, unknown> {
  return {
    id: table.id,
    name: table.name,
    isSelected: table.isSelected,
    defaultFilters: null,
    additionalFilters: null,
    fields: table.fields.map(field => ({
      name: field.name,
      type: field.type,
      description: field.description || field.dictionaryDescription
    }))
  };
}

function sanitizeLogText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function sanitizeLogMessage(value: unknown, maxLength: number): string {
  return sanitizeLogText(value, maxLength)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/token=([^&\s]+)/gi, 'token=[redacted]');
}

function readStatusCode(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 100 && numberValue <= 599 ? numberValue : undefined;
}

function recordValue(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  return isRecord(item) ? item : undefined;
}

function sanitizePublicEmbedAccessContext(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const sanitized = sanitizePublicEmbedValue(value);
  return isRecord(sanitized) ? sanitized : null;
}

function sanitizePublicEmbedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePublicEmbedValue).filter(item => item !== undefined);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (isSensitiveEmbedContextKey(key)) return [];
    const sanitized = sanitizePublicEmbedValue(item);
    return sanitized === undefined ? [] : [[key, sanitized]];
  }));
}

function isSensitiveEmbedContextKey(key: string): boolean {
  return /(?:secret|password|token|authorization|api[_-]?key|credential|private[_-]?key)/i.test(key);
}
