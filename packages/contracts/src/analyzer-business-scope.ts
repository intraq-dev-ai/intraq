export type AnalyzerBusinessScopePeriod =
  | {
    mode: 'range';
    startDate: string;
    endDate: string;
  }
  | {
    mode: 'as-of';
    asOfDate: string;
  };

export interface AnalyzerGenericBusinessScope {
  account?: string;
  accountId?: string;
  company?: string;
  companyId?: string;
  entity?: string;
  entityId?: string;
  location?: string;
  locationId?: string;
  period?: AnalyzerBusinessScopePeriod;
  subject?: string;
  subjectId?: string;
}

export type AnalyzerBusinessScope = AnalyzerGenericBusinessScope;

export type ConfirmedAnalyzerBusinessScope = AnalyzerBusinessScope & {
  schemaVersion: 1;
  revision: number;
  confirmedAt: string;
  previousConversationId?: string;
};

export interface AnalyzerBusinessScopeUpdateRequest {
  expectedRevision: number;
  scope: AnalyzerBusinessScope;
}
