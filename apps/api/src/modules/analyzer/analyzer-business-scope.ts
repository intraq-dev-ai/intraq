import type {
  AnalyzerBusinessScope,
  AnalyzerBusinessScopePeriod,
  AnalyzerBusinessScopeUpdateRequest,
  ConfirmedAnalyzerBusinessScope
} from '@intraq/contracts';

const MAX_SCOPE_VALUE_LENGTH = 160;
const SCOPE_METADATA_KEYS = new Set([
  'schemaVersion',
  'revision',
  'confirmedAt',
  'previousConversationId'
]);
const GENERIC_SCOPE_KEYS = new Set([
  'account',
  'accountId',
  'company',
  'companyId',
  'entity',
  'entityId',
  'location',
  'locationId',
  'subject',
  'subjectId',
  'period'
]);

export interface AnalyzerBusinessScopeParseResult {
  request: AnalyzerBusinessScopeUpdateRequest | null;
  error: string | null;
}

export function parseAnalyzerBusinessScopeUpdate(input: unknown): AnalyzerBusinessScopeParseResult {
  if (!isExactRecord(input, ['expectedRevision', 'scope'])) {
    return invalid('Request must contain only expectedRevision and scope.');
  }
  if (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 0) {
    return invalid('expectedRevision must be a non-negative integer.');
  }
  const parsedScope = parseScope(input.scope);
  if (!parsedScope.scope) return invalid(parsedScope.error);
  return {
    request: {
      expectedRevision: input.expectedRevision as number,
      scope: parsedScope.scope
    },
    error: null
  };
}

export function parseConfirmedAnalyzerBusinessScope(input: unknown): ConfirmedAnalyzerBusinessScope | null {
  if (!isRecord(input)) return null;
  if (!hasOnlyKeys(input, new Set([...GENERIC_SCOPE_KEYS, ...SCOPE_METADATA_KEYS]))) return null;
  if (input.schemaVersion !== 1 || !isPositiveInteger(input.revision)) return null;
  if (!isIsoTimestamp(input.confirmedAt)) return null;
  if (input.previousConversationId !== undefined && !isBoundedText(input.previousConversationId)) return null;
  const parsed = parseScope(Object.fromEntries(
    Object.entries(input).filter(([key]) => !SCOPE_METADATA_KEYS.has(key))
  ));
  if (!parsed.scope) return null;
  return {
    ...parsed.scope,
    schemaVersion: 1,
    revision: input.revision,
    confirmedAt: input.confirmedAt,
    ...(typeof input.previousConversationId === 'string'
      ? { previousConversationId: input.previousConversationId.trim() }
      : {})
  };
}

export function analyzerBusinessScopesEqual(
  left: AnalyzerBusinessScope,
  right: AnalyzerBusinessScope
): boolean {
  return JSON.stringify(scopeOnly(left)) === JSON.stringify(scopeOnly(right));
}

function scopeOnly(scope: AnalyzerBusinessScope): AnalyzerBusinessScope {
  const record = scope as unknown as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !SCOPE_METADATA_KEYS.has(key))
  ) as unknown as AnalyzerBusinessScope;
}

export function confirmedAnalyzerBusinessScope(
  scope: AnalyzerBusinessScope,
  revision: number,
  confirmedAt: string,
  previousConversationId?: string
): ConfirmedAnalyzerBusinessScope {
  return {
    ...scope,
    schemaVersion: 1,
    revision,
    confirmedAt,
    ...(previousConversationId ? { previousConversationId } : {})
  };
}

function parseScope(input: unknown): { scope: AnalyzerBusinessScope | null; error: string } {
  if (!isRecord(input)) {
    return { scope: null, error: 'scope must be an object.' };
  }
  if (!hasOnlyKeys(input, GENERIC_SCOPE_KEYS)) {
    return { scope: null, error: 'Scope contains unsupported or security-sensitive fields.' };
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === 'period') continue;
    if (value !== undefined && !isBoundedText(value)) {
      return { scope: null, error: `${key} must be a non-empty value of at most ${MAX_SCOPE_VALUE_LENGTH} characters.` };
    }
  }
  const period = parsePeriod(input.period);
  if (!period) {
    if (input.period === undefined) {
      return { scope: null, error: 'period is required for every confirmed Analyzer business scope.' };
    }
    return { scope: null, error: 'period must be a valid ISO date range or as-of date.' };
  }
  const account = normalizedText(input.account);
  const accountId = normalizedText(input.accountId);
  const company = normalizedText(input.company);
  const companyId = normalizedText(input.companyId);
  const entity = normalizedText(input.entity);
  const entityId = normalizedText(input.entityId);
  const location = normalizedText(input.location);
  const locationId = normalizedText(input.locationId);
  const subject = normalizedText(input.subject);
  const subjectId = normalizedText(input.subjectId);
  if (!account && !accountId && !company && !companyId && !entity && !entityId && !location && !locationId && !subject && !subjectId) {
    return { scope: null, error: 'scope requires a subject, entity, location, account, company, or source-system ID.' };
  }
  return {
    scope: {
      ...(account ? { account } : {}),
      ...(accountId ? { accountId } : {}),
      ...(company ? { company } : {}),
      ...(companyId ? { companyId } : {}),
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
      ...(location ? { location } : {}),
      ...(locationId ? { locationId } : {}),
      ...(subject ? { subject } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(period ? { period } : {})
    },
    error: ''
  };
}

function parsePeriod(input: unknown): AnalyzerBusinessScopePeriod | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input) || (input.mode !== 'range' && input.mode !== 'as-of')) return undefined;
  if (input.mode === 'range') {
    if (!isExactRecord(input, ['mode', 'startDate', 'endDate'])) return undefined;
    if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate) || input.startDate > input.endDate) return undefined;
    return { mode: 'range', startDate: input.startDate, endDate: input.endDate };
  }
  if (!isExactRecord(input, ['mode', 'asOfDate']) || !isIsoDate(input.asOfDate)) return undefined;
  return { mode: 'as-of', asOfDate: input.asOfDate };
}

function normalizedText(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function isBoundedText(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= MAX_SCOPE_VALUE_LENGTH
    && !/[\u0000-\u001F\u007F]/.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isExactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, new Set(keys)) && keys.every(key => key in value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
  return Object.keys(value).every(key => keys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(error: string): AnalyzerBusinessScopeParseResult {
  return { request: null, error };
}
