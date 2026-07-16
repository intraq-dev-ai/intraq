export interface PublicAccessTenant {
  id: string;
  name: string;
}

export interface PublicAccessUser {
  id: string;
  tenantId: string;
}

export interface EmbedDashboardLayout {
  i?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface EmbedDashboardElement {
  id: string;
  type: string;
  title: string;
  chartType?: string;
  isVisible?: boolean;
  order?: number;
  dataSourceId?: string;
  config: Record<string, unknown>;
  layout: EmbedDashboardLayout;
}

export interface EmbedDashboardFilter {
  id: string;
  field: string;
  config: Record<string, unknown>;
  label: string;
  name?: string;
  operator?: string;
  type?: string;
  value?: unknown;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface EmbedDashboard {
  id: string;
  name: string;
  category?: string;
  config: Record<string, unknown>;
  elements: EmbedDashboardElement[];
  filters: EmbedDashboardFilter[];
  isEmbedded: boolean;
  settings?: Record<string, unknown>;
}

export interface EmbedField {
  name: string;
  type: string;
  description: string;
}

export interface EmbedDataTable {
  id: string;
  name: string;
  fields: EmbedField[];
  isSelected: boolean;
}

export interface EmbedDataSource {
  id: string;
  dataSourceId: string;
  name: string;
  tables: EmbedDataTable[];
  type?: string;
  tableName?: string;
}

export interface EmbedDataSourcePreview {
  sourceId: string;
  tableName: string;
  fields: EmbedField[];
  rows: Array<Record<string, unknown>>;
  total: number;
  hasData: boolean;
}

export interface EmbeddedDashboardPayload {
  accessContext?: Record<string, unknown> | null;
  appearance?: EmbedAppearance | null;
  dashboard: EmbedDashboard;
  tenant: PublicAccessTenant | null;
  user: PublicAccessUser | null;
}

export interface EmbedDashboardFilterValue {
  filterId: string;
  field: string;
  type: string;
  value: string;
  startDate?: string;
  endDate?: string;
}

export interface EmbedAppearanceBehavior {
  handshakeTimeoutMs?: number;
  hideMultiSelectSummary?: boolean;
  multiSelectCloseOnSelect?: boolean;
  singleSelectClearable?: boolean;
  singleSelectSearchable?: boolean;
}

export interface EmbedAppearance {
  behavior?: EmbedAppearanceBehavior;
  showExpand?: boolean;
  showExport?: boolean;
  showFilters?: boolean;
  showHeader?: boolean;
}

export interface PublicChartDataset {
  label: string;
  values: number[];
  color?: string;
}
