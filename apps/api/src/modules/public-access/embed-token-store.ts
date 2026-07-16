export interface EmbedScopeFilter {
  column: string;
  dataSourceId?: string;
  operator: string;
  tableId?: string;
  tableName?: string;
  value?: unknown;
  values?: unknown[];
}

export interface EmbedDataScope {
  dataSourceIds?: string[];
  filters: EmbedScopeFilter[];
}

export interface EmbedDataAccessFilter {
  column: string;
  filterDataSourceId?: string;
  operator: string;
  sqlQuery?: string;
  templateValues?: Record<string, unknown>;
  type: 'dynamic' | 'simple' | 'sql';
  value?: unknown;
  values?: unknown[];
  variableDataTypes?: Record<string, string>;
}

export interface EmbedDataAccessRule {
  dataSourceId?: string;
  filters: EmbedDataAccessFilter[];
  tableId?: string;
  tableName?: string;
}

export interface EmbedAppearance {
  behavior?: {
    handshakeTimeoutMs?: number;
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

export interface EmbedToken {
  accessContext?: Record<string, unknown>;
  allowedDomains: string[];
  appearance?: EmbedAppearance;
  createdAt: number;
  createdBy?: string;
  dataAccessRules?: EmbedDataAccessRule[];
  dashboardId: string;
  dataScope?: EmbedDataScope;
  expiresAt: number;
  externalClientId?: string;
  externalCustomerId?: string;
  externalUserId?: string;
  mode?: 'dashboard-token' | 'external-portal';
  requireParentOrigin?: boolean;
  revoked: boolean;
  revokedAt?: number;
  revokedBy?: string;
  tenantId?: string;
}

export interface EmbedTokenStore {
  get(token: string): EmbedToken | null;
  revoke(token: string, actorUserId: string): boolean;
  set(token: string, tokenRecord: EmbedToken): void;
}

export class BoundedMemoryEmbedTokenStore implements EmbedTokenStore {
  private readonly tokens = new Map<string, EmbedToken>();

  constructor(private readonly maxTokens = 5000) {}

  get(token: string): EmbedToken | null {
    const found = this.tokens.get(token);
    return found ? cloneToken(found) : null;
  }

  revoke(token: string, actorUserId: string): boolean {
    this.pruneExpired();
    const found = this.tokens.get(token);
    if (!found) return false;
    this.tokens.set(token, {
      ...found,
      revoked: true,
      revokedAt: Date.now(),
      revokedBy: actorUserId
    });
    return true;
  }

  set(token: string, tokenRecord: EmbedToken): void {
    this.pruneExpired();
    while (this.tokens.size >= this.maxTokens) {
      const oldestToken = this.oldestToken();
      if (!oldestToken) break;
      this.tokens.delete(oldestToken);
    }
    this.tokens.set(token, cloneToken(tokenRecord));
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [token, record] of this.tokens.entries()) {
      if (record.expiresAt <= now) this.tokens.delete(token);
    }
  }

  private oldestToken(): string | null {
    let oldest: { createdAt: number; token: string } | null = null;
    for (const [token, record] of this.tokens.entries()) {
      if (!oldest || record.createdAt < oldest.createdAt) oldest = { token, createdAt: record.createdAt };
    }
    return oldest?.token ?? null;
  }
}

function cloneToken(token: EmbedToken): EmbedToken {
  return {
    ...token,
    ...(token.accessContext ? { accessContext: { ...token.accessContext } } : {}),
    allowedDomains: [...token.allowedDomains],
    ...(token.appearance ? {
      appearance: {
        ...(token.appearance.behavior ? { behavior: { ...token.appearance.behavior } } : {}),
        ...(typeof token.appearance.showExpand === 'boolean' ? { showExpand: token.appearance.showExpand } : {}),
        ...(typeof token.appearance.showExport === 'boolean' ? { showExport: token.appearance.showExport } : {}),
        ...(typeof token.appearance.showFilters === 'boolean' ? { showFilters: token.appearance.showFilters } : {}),
        ...(typeof token.appearance.showHeader === 'boolean' ? { showHeader: token.appearance.showHeader } : {})
      }
    } : {}),
    ...(token.dataScope ? {
      dataScope: {
        ...(token.dataScope.dataSourceIds ? { dataSourceIds: [...token.dataScope.dataSourceIds] } : {}),
        filters: token.dataScope.filters.map(filter => ({
          ...filter,
          ...(Array.isArray(filter.values) ? { values: [...filter.values] } : {})
        }))
      }
    } : {}),
    ...(token.dataAccessRules ? {
      dataAccessRules: token.dataAccessRules.map(rule => ({
        ...rule,
        filters: rule.filters.map(filter => ({
          ...filter,
          ...(filter.templateValues ? { templateValues: { ...filter.templateValues } } : {}),
          ...(Array.isArray(filter.values) ? { values: [...filter.values] } : {}),
          ...(filter.variableDataTypes ? { variableDataTypes: { ...filter.variableDataTypes } } : {})
        }))
      }))
    } : {})
  };
}
