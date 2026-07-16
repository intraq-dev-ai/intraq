const COMPANY_SCOPE_KEYS = [
  'accountId',
  'AccountId',
  'companyId',
  'CompanyId',
  'clientId',
  'customerId',
  'organizationId',
  'OrganizationId',
  'organisationId',
  'OrganisationId'
] as const;

const LOCATION_SCOPE_KEYS = [
  'locationIds',
  'LocationIds',
  'locationList',
  'LocationList',
  'branchIds',
  'BranchIds',
  'siteIds',
  'SiteIds',
  'warehouseIds',
  'WarehouseIds',
  'locationId',
  'LocationId'
] as const;

const PREVIEW_SCOPE_OWNED_KEYS = [...COMPANY_SCOPE_KEYS, ...LOCATION_SCOPE_KEYS] as const;

export type PreviewScopeFields = {
  companyId: string;
  locationIds: string;
  extraJson: string;
};

export type PreviewScopeBuildResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string };

export function previewScopeFieldsFromDataScope(scope: Record<string, unknown>): PreviewScopeFields {
  const extra = { ...scope };
  for (const key of PREVIEW_SCOPE_OWNED_KEYS) delete extra[key];

  return {
    companyId: scopeScalarText(firstScopeValue(scope, COMPANY_SCOPE_KEYS)),
    locationIds: scopeArrayText(firstScopeValue(scope, LOCATION_SCOPE_KEYS)),
    extraJson: Object.keys(extra).length > 0 ? JSON.stringify(extra, null, 2) : ''
  };
}

export function buildPreviewScopeValues(
  companyIdText: string,
  locationIdsText: string,
  extraJsonText: string
): PreviewScopeBuildResult {
  const extra = parsePreviewExtraJson(extraJsonText);
  if (!extra.ok) return extra;

  const values: Record<string, unknown> = { ...extra.values };
  const enteredLocationIds = parseDelimitedScopeValues(locationIdsText);
  const companyId = coerceScopeScalar(companyIdText.trim()) ?? enteredLocationIds[0];
  const locationIds = enteredLocationIds.length > 0
    ? enteredLocationIds
    : companyId !== undefined
      ? [companyId]
      : [];

  if (companyId !== undefined) {
    values.companyId = companyId;
    values.CompanyId = companyId;
    values.clientId = companyId;
    values.customerId = companyId;
    values.accountId = companyId;
    values.AccountId = companyId;
    values.organizationId = companyId;
    values.OrganizationId = companyId;
  }

  if (locationIds.length > 0) {
    values.locationIds = locationIds;
    values.LocationIds = locationIds;
    values.locationList = locationIds;
    values.LocationList = locationIds;
    values.branchIds = locationIds;
    values.BranchIds = locationIds;
    values.siteIds = locationIds;
    values.SiteIds = locationIds;
    values.locationId = locationIds[0];
    values.LocationId = locationIds[0];
  }

  return { ok: true, values };
}

function firstScopeValue(
  scope: Record<string, unknown>,
  keys: readonly string[]
): unknown {
  return keys.map(key => scope[key]).find(value => value !== undefined);
}

function parsePreviewExtraJson(
  extraJsonText: string
): PreviewScopeBuildResult {
  const raw = extraJsonText.trim();
  if (!raw) return { ok: true, values: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Additional values must be a JSON object.' };
    }
    return { ok: true, values: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Additional values are not valid JSON.' };
  }
}

function parseDelimitedScopeValues(value: string): unknown[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .flatMap(item => {
      const coerced = coerceScopeScalar(item);
      return coerced === undefined ? [] : [coerced];
    });
}

function coerceScopeScalar(value: string): string | number | undefined {
  if (!value) return undefined;
  if (/^-?\d+$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  return value;
}

function scopeScalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function scopeArrayText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter(item => typeof item === 'string' || typeof item === 'number')
      .map(String)
      .join(', ');
  }
  return scopeScalarText(value);
}
