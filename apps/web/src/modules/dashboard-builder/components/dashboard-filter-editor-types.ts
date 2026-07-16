import type { FilterDraft } from '../agent-context/planner-filters';
import type {
  BuilderDataSource,
  DashboardElement,
  DashboardFilter,
  DashboardFilterCreatePatch,
  DashboardFilterPatch
} from '../types';

export interface DashboardFilterEditorProps {
  createDraft: FilterDraft;
  dashboardElements: DashboardElement[];
  dataSources: BuilderDataSource[];
  editingFilter: DashboardFilter | null;
  filtersCount: number;
  selectedDataSourceId: string;
  selectedTableId: string;
  suggestedTargetElementId: string;
}

export type DashboardFilterEditorEmits = {
  close: [];
  create: [patch: DashboardFilterCreatePatch];
  update: [filterId: string, patch: DashboardFilterPatch];
};

export type DashboardFilterEditorEmit = <Event extends keyof DashboardFilterEditorEmits>(
  event: Event,
  ...args: DashboardFilterEditorEmits[Event]
) => void;
