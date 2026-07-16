import type { BuilderDataSource, DashboardElement } from '../../types';

export interface SaveElementPatch {
  chartType?: string;
  config?: Record<string, unknown>;
  dataSourceId?: string;
  name: string;
  type: string;
}

export interface DashboardElementEditorProps {
  dataSources?: BuilderDataSource[];
  selectedDataSourceId?: string;
  selectedElement: DashboardElement | null;
  selectedTableId?: string;
}
