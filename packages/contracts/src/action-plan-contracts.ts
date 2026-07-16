import type { VisualizationKind } from './dashboard-schema.js';

export type ActionPlanMode = 'create' | 'update';

export type DashboardComponentType = 'chart' | 'table' | 'card' | 'pie' | 'matrix' | 'filter' | 'text';

export interface DashboardElementIdentifier {
  clientElementId: string;
  elementId?: string;
  dashboardId?: string;
}

export interface ActionPlanStep {
  action: string;
  params: Record<string, unknown>;
}

export interface ActionPlanParams {
  element: DashboardElementIdentifier;
  dataSourceId?: string;
  dataSourceTableId?: string;
  tableName?: string;
  visualizationId?: string;
  visualizationKind?: VisualizationKind;
}

export interface DashboardActionPlan {
  type: 'action-plan';
  mode: ActionPlanMode;
  componentType: DashboardComponentType;
  actions: ActionPlanStep[];
  params: ActionPlanParams;
  message: string;
}
