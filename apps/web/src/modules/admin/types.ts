export type AdminSurfaceKind = 'resource' | 'summary';
export type AdminMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AdminFieldType = 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'password';
export type AdminFieldValue = string | number | boolean;

export interface AdminRecord {
  id?: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AdminOption {
  label: string;
  value: string;
}

export interface AdminField {
  key: string;
  label: string;
  type?: AdminFieldType;
  required?: boolean;
  defaultValue?: AdminFieldValue;
  options?: AdminOption[];
}

export interface AdminColumn {
  key: string;
  label: string;
  type?: 'text' | 'status' | 'boolean' | 'date' | 'number' | 'list';
}

export interface AdminRecordAction {
  id: string;
  label: string;
  method: AdminMethod;
  path: string | ((record: AdminRecord) => string);
  payload?: Record<string, unknown> | ((record: AdminRecord) => Record<string, unknown>);
  variant?: 'primary' | 'secondary' | 'danger';
  reload?: boolean;
}

export interface AdminSurfaceLink {
  label: string;
  href: string;
}

export interface AdminBaseSurface {
  id: string;
  kind: AdminSurfaceKind;
  eyebrow: string;
  title: string;
  description: string;
}

export interface AdminResourceSurface extends AdminBaseSurface {
  kind: 'resource';
  path: string;
  idKey?: string;
  nameKey?: string;
  listKey?: string;
  columns: AdminColumn[];
  createFields: AdminField[];
  editFields?: AdminField[];
  createLabel?: string;
  createButtonLabel?: string;
  editButtonLabel?: string;
  quickLinks?: AdminSurfaceLink[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  actions?: AdminRecordAction[];
}

export interface AdminSummaryRequest {
  id: string;
  title: string;
  path: string;
  rowsKey?: string;
}

export interface AdminSummaryAction {
  id: string;
  title: string;
  description: string;
  label: string;
  method: AdminMethod;
  path: string;
  fields?: AdminField[];
  body?: Record<string, unknown>;
}

export interface AdminSummarySurface extends AdminBaseSurface {
  kind: 'summary';
  requests: AdminSummaryRequest[];
  actions?: AdminSummaryAction[];
}

export type AdminSurface = AdminResourceSurface | AdminSummarySurface;
