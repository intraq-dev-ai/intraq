export type VisualizationKind = 'bar' | 'line' | 'pie' | 'table' | 'card' | 'matrix' | 'filter' | 'text';

export type FieldRole = 'dimension' | 'measure' | 'time' | 'filter';

export type VisualizationCapability =
  | 'cartesian'
  | 'categorical'
  | 'single-value'
  | 'tabular'
  | 'legend'
  | 'tooltip'
  | 'cross-filter'
  | 'drilldown';

export interface FieldEncoding {
  field: string;
  label: string;
  role: FieldRole;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct' | 'none';
  format?: 'currency' | 'number' | 'percentage' | 'date' | 'duration';
}

export interface VisualizationDataRef {
  sourceId?: string;
  tableId?: string;
  tableName?: string;
  queryId?: string;
}

export interface VisualizationFilterIntent {
  field: string;
  operator:
    | 'between'
    | 'contains'
    | 'endsWith'
    | 'equals'
    | 'greaterThan'
    | 'greaterThanOrEqual'
    | 'in'
    | 'isNotNull'
    | 'isNull'
    | 'last'
    | 'lessThan'
    | 'lessThanOrEqual'
    | 'notContains'
    | 'notEquals'
    | 'notIn'
    | 'startsWith';
  value?: unknown;
}

export interface VisualizationSortIntent {
  field: string;
  direction: 'asc' | 'desc';
}

export interface VisualizationSpec {
  id: string;
  schemaVersion?: 1;
  kind: VisualizationKind;
  title: string;
  description: string;
  dataRef?: VisualizationDataRef;
  encodings: FieldEncoding[];
  filters?: VisualizationFilterIntent[];
  sort?: VisualizationSortIntent[];
  limit?: number;
  themeTokens?: {
    palette?: string;
    surface?: string;
    accent?: string;
  };
  interactions: {
    tooltip: boolean;
    legend: boolean;
    crossFilter: boolean;
    drilldown: boolean;
  };
  accessibility: {
    label: string;
    summary: string;
  };
  rendererHints?: {
    requiredCapabilities: VisualizationCapability[];
    fallback: 'table' | 'card' | 'text';
  };
}

export interface DashboardDefinition {
  id: string;
  schemaVersion: 1;
  title: string;
  description: string;
  visualizations: VisualizationSpec[];
  themeTokenSet: string;
}
