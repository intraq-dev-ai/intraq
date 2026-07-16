import type { DataSourceRecord, TableDefinition } from './foundation-store.js';
import { findDataSource } from './foundation-store.js';
import {
  executeLiveDataSourceSqlQuery,
  isLiveSqlDataSource
} from './live-sql-query-engine.js';
import { executeDataSourceSqlQuery } from './sql-query-engine.js';
import {
  type ApiRuntimeResult,
  type ApiTemplateVariableLookupConfig
} from './api-runtime-types.js';
import {
  boundedNumber,
  compactTemplateValues,
  firstPath,
  readApiRequestTimeoutMs,
  readPath,
  readRecord,
  readString
} from './api-runtime-utils.js';

export async function apiRequestTemplateValuesResult(
  source: DataSourceRecord,
  table: TableDefinition,
  parameterValues: Record<string, unknown> | undefined
): Promise<ApiRuntimeResult<Record<string, unknown>>> {
  const sourceDefaults = readRecord(source.config.defaults);
  const tableDefaults = readRecord(table.settings?.defaults);
  const runtimeValues = normalizeApiRuntimeParameterValues(parameterValues);
  const credentialValues = apiCredentialTemplateValues(source.config);
  const protectedBaseValues = {
    ...sourceDefaults,
    ...tableDefaults,
    ...runtimeValues,
    ...credentialValues
  };
  const lookupConfig = readTemplateVariableLookupConfig(source, table);
  if (!lookupConfig) return { ok: true, data: protectedBaseValues };
  const lookupTemplateValues = {
    ...sourceDefaults,
    ...credentialValues,
    ...tableDefaults,
    ...runtimeValues
  };
  const lookup = await resolveTemplateVariableLookup(lookupConfig, lookupTemplateValues);
  if (!lookup.ok) return lookup;
  return {
    ok: true,
    data: {
      ...protectedBaseValues,
      ...normalizedCredentialLookupValues(lookup.data)
    }
  };
}

function normalizeApiRuntimeParameterValues(parameterValues: Record<string, unknown> | undefined): Record<string, unknown> {
  const normalized = { ...(parameterValues ?? {}) };
  const selectedDate = firstPath(normalized, ['selectedDate', 'SelectedDate', 'selectedDay', 'SelectedDay']);
  if (selectedDate !== undefined && selectedDate !== null && selectedDate !== '') {
    setMissingTemplateValue(normalized, 'selectedDate', selectedDate);
    setMissingTemplateValue(normalized, 'SelectedDate', selectedDate);
  }
  mirrorTemplateAliases(normalized, ['accountId', 'AccountId', 'companyId', 'CompanyId', 'clientId', 'ClientId', 'customerId', 'CustomerId', 'locationId', 'LocationId']);
  mirrorTemplateAliases(normalized, ['accountIds', 'AccountIds', 'companyIds', 'CompanyIds', 'clientIds', 'ClientIds', 'customerIds', 'CustomerIds', 'locationIds', 'LocationIds', 'locationList', 'LocationList']);
  mirrorTemplateAliases(normalized, ['rangeType', 'RangeType']);
  mirrorTemplateAliases(normalized, ['cashRegisterGroup', 'CashRegisterGroup', 'registerGroup', 'RegisterGroup']);
  mirrorTemplateAliases(normalized, ['uid', 'Uid', 'userId', 'UserId']);
  mirrorTemplateAliases(normalized, ['couponId', 'CouponId']);
  mirrorTemplateAliases(normalized, ['discountReason', 'DiscountReason']);
  mirrorTemplateAliases(normalized, ['itemDiscountReason', 'ItemDiscountReason']);
  mirrorTemplateAliases(normalized, ['invoiceNumber', 'InvoiceNumber']);
  mirrorTemplateAliases(normalized, ['fromDate', 'FromDate', 'startDate', 'StartDate', 'startDateTime', 'StartDateTime', 'selectedStartDate', 'SelectedStartDate']);
  mirrorTemplateAliases(normalized, ['toDate', 'ToDate', 'endDate', 'EndDate', 'endDateTime', 'EndDateTime', 'selectedEndDate', 'SelectedEndDate']);
  for (const aliases of [
    ['products', 'Products'],
    ['categories', 'Categories'],
    ['categoryGroups', 'CategoryGroups'],
    ['tags', 'Tags'],
    ['locationIds', 'LocationIds', 'locationList', 'LocationList', 'clientIds', 'ClientIds', 'companyIds', 'CompanyIds']
  ]) {
    const value = normalizeTemplateArrayValue(firstPath(normalized, aliases));
    if (value) aliases.forEach(alias => { normalized[alias] = value; });
  }
  return normalized;
}

function setMissingTemplateValue(target: Record<string, unknown>, key: string, value: unknown): void {
  if (target[key] === undefined || target[key] === null || target[key] === '') target[key] = value;
}

function mirrorTemplateAliases(target: Record<string, unknown>, aliases: string[]): void {
  const value = firstPath(target, aliases);
  if (value === undefined || value === null || value === '') return;
  for (const alias of aliases) setMissingTemplateValue(target, alias, value);
}

function normalizeTemplateArrayValue(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.includes(',')) {
    return value.split(',').map(item => item.trim()).filter(Boolean).map(item => {
      const numberValue = Number(item);
      return Number.isFinite(numberValue) && String(numberValue) === item ? numberValue : item;
    });
  }
  return null;
}

function normalizedCredentialLookupValues(values: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...values };
  mirrorCredentialKey(normalized, 'clientId', 'ClientId', 'client_id');
  mirrorCredentialKey(normalized, 'clientSecret', 'ClientSecret', 'client_secret');
  return normalized;
}

function mirrorCredentialKey(target: Record<string, unknown>, canonical: string, pascal: string, snake: string): void {
  const value = target[canonical] ?? target[pascal] ?? target[snake];
  if (value === undefined || value === null || value === '') return;
  if (target[canonical] === undefined || target[canonical] === null || target[canonical] === '') target[canonical] = value;
  if (target[pascal] === undefined || target[pascal] === null || target[pascal] === '') target[pascal] = value;
  if (target[snake] === undefined || target[snake] === null || target[snake] === '') target[snake] = value;
}

function readTemplateVariableLookupConfig(
  source: DataSourceRecord,
  table: TableDefinition
): ApiTemplateVariableLookupConfig | null {
  const tableApi = readRecord(table.settings?.api ?? table.settings?.request);
  const raw = readRecord(
    tableApi.templateVariableLookup
      ?? tableApi.credentialLookup
      ?? tableApi.authVariableLookup
      ?? source.config.templateVariableLookup
      ?? source.config.credentialLookup
      ?? source.config.authVariableLookup
  );
  if (Object.keys(raw).length === 0 || raw.enabled === false || raw.disabled === true) return null;
  const dataSourceId = readString(raw.dataSourceId ?? raw.sourceId ?? raw.lookupDataSourceId);
  const query = readString(raw.query ?? raw.sqlQuery ?? raw.sql);
  if (!dataSourceId || !query) return null;
  return {
    dataSourceId,
    query,
    timeoutMs: boundedNumber(raw.timeoutMs, readApiRequestTimeoutMs(source.config), 120_000)
  };
}

async function resolveTemplateVariableLookup(
  config: ApiTemplateVariableLookupConfig,
  templateValues: Record<string, unknown>
): Promise<ApiRuntimeResult<Record<string, unknown>>> {
  const source = findDataSource(config.dataSourceId);
  if (!source) return { ok: false, statusCode: 404, error: 'API template variable lookup data source was not found' };
  const query = applySqlLiteralTemplate(config.query, templateValues);
  if (!query.ok) return query;
  const result = isLiveSqlDataSource(source)
    ? await executeLiveDataSourceSqlQuery({
      source,
      query: query.data,
      queryTimeoutMs: config.timeoutMs,
      defaultLimit: 1,
      maxLimit: 1,
      preLimited: true
    })
    : executeDataSourceSqlQuery({
      dataSourceId: source.id,
      query: query.data,
      defaultLimit: 1,
      maxLimit: 1
    });
  if (!result.ok) {
    return {
      ok: false,
      statusCode: result.statusCode as 400 | 401 | 403 | 404 | 502 | 504,
      error: `API template variable lookup failed: ${result.error}`
    };
  }
  const row = result.data.rows[0];
  if (!row) return { ok: false, statusCode: 404, error: 'API template variable lookup returned no rows' };
  return { ok: true, data: { ...row } };
}

export function applySqlLiteralTemplate(
  value: string,
  templateValues: Record<string, unknown>
): ApiRuntimeResult<string> {
  try {
    return {
      ok: true,
      data: value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
        const replacement = readPath(templateValues, key);
        if (replacement === undefined || replacement === null || replacement === '') {
          throw new Error(`Missing API parameter value: ${key}`);
        }
        if (Array.isArray(replacement)) return replacement.map(sqlLiteral).join(', ');
        return sqlLiteral(replacement);
      })
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      error: error instanceof Error ? error.message : 'Missing API parameter value'
    };
  }
}

function apiCredentialTemplateValues(config: Record<string, unknown>): Record<string, unknown> {
  const defaults = readRecord(config.defaults);
  const authVariables = {
    ...readRecord(config.credentials),
    ...readRecord(config.secrets),
    ...readRecord(config.authVariables)
  };
  const clientId = credentialValue(config.clientId ?? authVariables.clientId ?? defaults.clientId);
  const clientSecret = credentialValue(config.clientSecret ?? authVariables.clientSecret ?? defaults.clientSecret);
  return compactTemplateValues({
    ...authVariables,
    ...(clientId !== undefined ? { clientId, client_id: clientId } : {}),
    ...(clientSecret !== undefined ? { clientSecret, client_secret: clientSecret } : {})
  });
}

function credentialValue(value: unknown): unknown {
  return value !== undefined && value !== null && value !== '' ? value : undefined;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}
