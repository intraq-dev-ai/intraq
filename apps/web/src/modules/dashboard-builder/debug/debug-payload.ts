import type {
  BuilderActionPlan,
  BuilderDataSource,
  BuilderDataTable,
  Dashboard,
  DashboardBuilderDebugPayload,
  DashboardElement,
  DashboardRuntimeState,
  DataModelRecommendation
} from '../types';
import { visualizationSpecFromElement } from '../visualization/spec';

interface BuildDashboardBuilderDebugPayloadInput {
  actionPlan: BuilderActionPlan | null;
  dashboard: Dashboard | null;
  dataModelRecommendation: DataModelRecommendation | null;
  prompt: string;
  runtimeState: DashboardRuntimeState | null;
  selectedDataSource: BuilderDataSource | null;
  selectedElement: DashboardElement | null;
  selectedTable: BuilderDataTable | null;
}

export function buildDashboardBuilderDebugPayload(input: BuildDashboardBuilderDebugPayloadInput): DashboardBuilderDebugPayload {
  const visualizationSpec = input.selectedElement ? visualizationSpecFromElement(input.selectedElement) : null;
  return {
    actionPlan: input.actionPlan,
    dashboardFilters: input.dashboard?.filters ?? [],
    dataModelRecommendation: input.dataModelRecommendation,
    dataRequest: visualizationSpec
      ? {
        dataRef: visualizationSpec.dataRef,
        encodings: visualizationSpec.encodings,
        filters: visualizationSpec.filters ?? [],
        limit: visualizationSpec.limit,
        sort: visualizationSpec.sort
      }
      : null,
    prompt: input.prompt,
    rawComponentState: input.selectedElement,
    rawFilterState: input.dashboard?.filters ?? [],
    selectedDataModel: input.selectedTable
      ? {
        id: input.selectedTable.id,
        name: input.selectedTable.dictionary?.businessName ?? input.selectedTable.name,
        fields: input.selectedTable.fields.map(field => field.name)
      }
      : null,
    selectedDataSource: input.selectedDataSource
      ? {
        id: input.selectedDataSource.id,
        name: input.selectedDataSource.name
      }
      : null,
    selectedElement: input.selectedElement
      ? {
        id: input.selectedElement.id,
        name: input.selectedElement.name,
        type: input.selectedElement.type,
        ...(input.selectedElement.chartType ? { chartType: input.selectedElement.chartType } : {})
      }
      : null,
    runtimeState: input.runtimeState,
    visualizationSpec
  };
}
