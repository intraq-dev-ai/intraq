export type DashboardEmbedExpiry = '15m' | '1h' | '24h' | '7d' | '30d';

export interface GenerateDashboardEmbedTokenRequest {
  allowedDomains: string[];
  appearance?: DashboardEmbedAppearance;
  dashboardId: string;
  expiresIn: DashboardEmbedExpiry | string;
}

export interface DashboardEmbedAppearance {
  behavior?: {
    hideMultiSelectSummary?: boolean;
    multiSelectCloseOnSelect?: boolean;
    singleSelectClearable?: boolean;
    singleSelectSearchable?: boolean;
  };
  showExpand?: boolean;
  showExport?: boolean;
  showFilters?: boolean;
  showHeader?: boolean;
}

export interface DashboardEmbedToken {
  allowedDomains: string[];
  embedUrl: string;
  expiresAt?: string;
  expiresIn: string;
  token: string;
}

export interface DashboardEmbedDetails extends DashboardEmbedToken {
  embedCode: string;
}

export interface RevokeDashboardEmbedTokenResult {
  message: string;
  success: true;
}

interface JsonRequestOptions {
  body?: Record<string, unknown>;
  method?: 'GET' | 'POST';
}

export async function generateDashboardEmbedToken(
  request: GenerateDashboardEmbedTokenRequest
): Promise<DashboardEmbedToken> {
  const payload = await requestJson('/api/embed/generate-token', {
    method: 'POST',
    body: {
      dashboardId: request.dashboardId,
      allowedDomains: request.allowedDomains,
      expiresIn: request.expiresIn,
      ...(request.appearance ? { appearance: request.appearance } : {})
    }
  });

  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(readErrorMessage(payload) ?? 'Embed token response was not valid.');
  }

  const token = readString(payload.token);
  const embedUrl = readString(payload.embedUrl);
  if (!token || !embedUrl) throw new Error('Embed token response was missing token details.');

  const result: DashboardEmbedToken = {
    token,
    embedUrl,
    ...(readString(payload.expiresAt) ? { expiresAt: readString(payload.expiresAt) as string } : {}),
    expiresIn: readString(payload.expiresIn) ?? request.expiresIn,
    allowedDomains: readStringArray(payload.allowedDomains)
  };
  return result;
}

export async function revokeDashboardEmbedToken(token: string): Promise<RevokeDashboardEmbedTokenResult> {
  const payload = await requestJson('/api/embed/revoke-token', {
    method: 'POST',
    body: { token }
  });

  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(readErrorMessage(payload) ?? 'Embed token revoke response was not valid.');
  }

  return {
    success: true,
    message: readString(payload.message) ?? 'Token revoked successfully'
  };
}

export function buildDashboardEmbedDetails(
  token: DashboardEmbedToken,
  dashboardName: string
): DashboardEmbedDetails {
  return {
    ...token,
    embedCode: buildDashboardEmbedCode(token.embedUrl, dashboardName)
  };
}

export function buildDashboardEmbedCode(
  embedUrl: string,
  dashboardName: string,
  options: { includeTitle?: boolean } = {}
): string {
  const title = dashboardName.trim() || 'Embedded Dashboard';
  const attributes = [
    `<iframe src="${escapeHtmlAttribute(embedUrl)}"`,
    'loading="lazy"',
    'style="width:100%;min-height:720px;border:0;"',
    'allowfullscreen></iframe>'
  ];
  if (options.includeTitle !== false) attributes.splice(1, 0, `title="${escapeHtmlAttribute(title)}"`);
  return attributes.join(' ');
}

export function withoutDashboardEmbedPresentationParams(embedUrl: string): string {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(embedUrl, baseUrl);
    for (const key of ['header', 'filters', 'expand', 'export']) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return embedUrl;
  }
}

export function parseDashboardEmbedAllowedDomains(value: string): string[] {
  const seen = new Set<string>();
  const domains: string[] = [];
  for (const entry of value.split(/[\n,]+/)) {
    const domain = normalizeAllowedDomain(entry);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }
  return domains;
}

async function requestJson(path: string, options: JsonRequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = storedAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const init: RequestInit = { method: options.method ?? 'GET', headers };

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await readResponseJson(path, response);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload) ?? `Request to ${path} failed with status ${response.status}.`);
  }
  if (isRecord(payload) && payload.success === false) {
    throw new Error(readErrorMessage(payload) ?? `Request to ${path} failed.`);
  }
  return payload;
}

async function readResponseJson(path: string, response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function readErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return readString(payload.error) ?? readString(payload.message);
}

function normalizeDashboardEmbedAppearance(value: unknown): DashboardEmbedAppearance | undefined {
  if (!isRecord(value)) return undefined;
  const appearance: DashboardEmbedAppearance = {};
  if (isRecord(value.behavior)) {
    const behavior: NonNullable<DashboardEmbedAppearance['behavior']> = {};
    if (typeof value.behavior.hideMultiSelectSummary === 'boolean') behavior.hideMultiSelectSummary = value.behavior.hideMultiSelectSummary;
    if (typeof value.behavior.multiSelectCloseOnSelect === 'boolean') behavior.multiSelectCloseOnSelect = value.behavior.multiSelectCloseOnSelect;
    if (typeof value.behavior.singleSelectClearable === 'boolean') behavior.singleSelectClearable = value.behavior.singleSelectClearable;
    if (typeof value.behavior.singleSelectSearchable === 'boolean') behavior.singleSelectSearchable = value.behavior.singleSelectSearchable;
    if (Object.keys(behavior).length > 0) appearance.behavior = behavior;
  }
  if (typeof value.showExpand === 'boolean') appearance.showExpand = value.showExpand;
  if (typeof value.showExport === 'boolean') appearance.showExport = value.showExport;
  if (typeof value.showFilters === 'boolean') appearance.showFilters = value.showFilters;
  if (typeof value.showHeader === 'boolean') appearance.showHeader = value.showHeader;
  return Object.keys(appearance).length > 0 ? appearance : undefined;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString).filter(isPresent) : [];
}

function storedAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('auth_token')
    ?? window.localStorage.getItem('token')
    ?? window.localStorage.getItem('accessToken')
    ?? '';
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeAllowedDomain(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === '*') return '*';
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  try {
    const parsed = new URL(withoutTrailingSlash.includes('://') ? withoutTrailingSlash : `https://${withoutTrailingSlash}`);
    return parsed.hostname.toLowerCase();
  } catch {
    const fallback = withoutTrailingSlash.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
    return fallback || null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
