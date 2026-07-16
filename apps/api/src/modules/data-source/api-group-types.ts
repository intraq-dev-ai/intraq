export interface PublicApiClientIdentity {
  allowedApiGroupIds?: string[];
  allowedDataSourceIds?: string[];
  clientId: string;
  contextUserId?: string;
  tenantId?: string;
}

export interface ApiGroupRecord {
  id: string;
  tenantId?: string | null;
  slug: string;
  name: string;
  description?: string | null;
  visibility: 'private' | 'public';
  status: string;
  settings: Record<string, unknown>;
  createdBy?: string | null;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  endpoints: ApiEndpointRecord[];
  grants?: ApiGroupGrantRecord[];
  clientGrants?: ApiClientApiGroupGrantRecord[];
}

export interface ApiEndpointRecord {
  id: string;
  groupId: string;
  slug: string;
  method: string;
  name: string;
  description?: string | null;
  status: string;
  executionType: string;
  dataSourceId?: string | null;
  dataSourceTableId?: string | null;
  pipelineId?: string | null;
  parameters: unknown[];
  requestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  responseContract: Record<string, unknown>;
  security: Record<string, unknown>;
  settings: Record<string, unknown>;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

export interface ApiGroupGrantRecord {
  id: string;
  apiGroupId: string;
  targetType: string;
  targetId?: string | null;
  permission: string;
  settings: Record<string, unknown>;
}

export interface ApiClientApiGroupGrantRecord {
  id: string;
  clientId: string;
  apiGroupId: string;
  scopes: string[];
}

export interface ApiGroupSnapshotRecord {
  id: string;
  apiGroupId: string;
  snapshotNumber: number;
  name: string;
  comment?: string | null;
  snapshot: ApiGroupSnapshotPayload;
  createdBy?: string | null;
  createdAt?: string | undefined;
}

export interface ApiGroupSnapshotPayload {
  group: Omit<ApiGroupRecord, 'clientGrants' | 'endpoints' | 'grants'>;
  endpoints: ApiEndpointRecord[];
}

export interface ApiGroupBundlePayload extends ApiGroupSnapshotPayload {
  exportedAt: string;
  kind: 'api-group-bundle';
  version: 1;
}

export interface ApiGroupValidationIssue {
  code: string;
  message: string;
  path: string;
}
