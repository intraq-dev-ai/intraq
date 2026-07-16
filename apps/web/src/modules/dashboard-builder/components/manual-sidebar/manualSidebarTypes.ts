import type {
  BuilderDataSource,
  Dashboard,
  DashboardElement,
  DashboardFilterCreatePatch,
  DashboardFilterPatch,
  DashboardSettings,
  DashboardVersion
} from '../../types';
import type { SaveElementPatch } from '../editor/useDashboardElementEditor';

export interface ManualSidebarProps {
  canEditDashboard: boolean;
  dashboard: Dashboard | null;
  dataSources: BuilderDataSource[];
  isSaving: boolean;
  selectedDataSourceId: string;
  selectedElement: DashboardElement | null;
  selectedTableId: string;
  versions: DashboardVersion[];
}

export type ManualSidebarEmit = {
  (event: 'changeFilter', filterId: string, patch: DashboardFilterPatch): void;
  (event: 'clearElementSelection'): void;
  (event: 'createFilter', patch: DashboardFilterCreatePatch): void;
  (event: 'createManualElement', type: string, chartType?: string): void;
  (event: 'removeFilter', filterId: string): void;
  (event: 'restoreVersion', versionId: string): void;
  (event: 'saveElement', patch: SaveElementPatch): void;
  (event: 'selectDataSource', id: string): void;
  (event: 'selectDataTable', id: string): void;
  (event: 'updateDashboardSettings', settings: DashboardSettings): void;
  (event: 'updateElementLayout', elementId: string, layout: Record<string, number>): void;
};
