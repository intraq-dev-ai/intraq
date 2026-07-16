import type { DashboardDataCachePolicy } from '../dashboard-data-cache-policy';
import type {
  DashboardElement,
  VisualizationFilterIntent,
  VisualizationSpec
} from '../types';

export interface VisualizationDataRequest {
  dataSourceId: string;
  tableName: string;
  editMode: boolean;
  parameterValues?: Record<string, unknown>;
  componentConfig?: Record<string, unknown>;
  visualization: {
    encodings: VisualizationSpec['encodings'];
    filters: VisualizationFilterIntent[];
    kind: VisualizationSpec['kind'];
    limit?: number;
    sort: NonNullable<VisualizationSpec['sort']>;
  };
}

export interface VisualizationDataRequestContext {
  cacheKeyPrefix?: string;
  downloadEndpoint?: string;
  embedOrigin?: string;
  endpoint?: string;
  runtimeParameterValues?: Record<string, unknown>;
  token?: string;
}

export interface LoadVisualizationDataOptions {
  cachePolicy?: DashboardDataCachePolicy | undefined;
  peerElements?: DashboardElement[] | undefined;
  refresh?: boolean;
  requestContext?: VisualizationDataRequestContext | undefined;
  rowLimit?: number | undefined;
  signal?: AbortSignal;
}

export interface VisualizationDataRequestOptions {
  rowLimit?: number | undefined;
}

export interface SharedVisualizationDataGroupItem {
  element: DashboardElement;
  request: VisualizationDataRequest;
  spec: VisualizationSpec;
}
