import { computed, type ComputedRef, type Ref } from 'vue';
import type {
  BuilderDataField,
  BuilderDataSource,
  BuilderDataTable,
  DashboardElement
} from '../types';
import {
  readString,
  type FilterFormState,
  type TargetDataSource
} from './dashboard-filter-editor-model';
import type { DashboardFilterEditorProps } from './dashboard-filter-editor-types';
import {
  fieldsForTable,
  filterFieldLabel,
  toTargetDataModels,
  uniqueStrings,
  visualizationDataRef
} from './dashboard-filter-editor-utils';
import {
  parameterDisplayName,
  requiredParametersForDataTable
} from './parameterized-data-sources';

export interface DashboardFilterEditorContext {
  allAvailableDataModels: ComputedRef<TargetDataSource[]>;
  availableColumnFields: ComputedRef<BuilderDataField[]>;
  availableFields: ComputedRef<BuilderDataField[]>;
  availableTables: ComputedRef<BuilderDataTable[]>;
  canOpenTargets: ComputedRef<boolean>;
  compatibleComponents: ComputedRef<DashboardElement[]>;
  dashboardDataModels: ComputedRef<TargetDataSource[]>;
  isSelectedDataModelFromDashboard: ComputedRef<boolean>;
  requiredParameterLabels: ComputedRef<string[]>;
  selectedDataModel: ComputedRef<TargetDataSource | undefined>;
  selectedDataSource: ComputedRef<BuilderDataSource | undefined>;
  selectedTable: ComputedRef<BuilderDataTable | undefined>;
  dataModelById: (id: string | undefined) => TargetDataSource | undefined;
  dataSourceById: (id: string) => BuilderDataSource | undefined;
  fieldLabel: (field: BuilderDataField) => string;
  fieldsForTable: (table: BuilderDataTable | undefined) => BuilderDataField[];
  getElementDataSourceName: (element: DashboardElement) => string;
  dataSourceForElement: (element: DashboardElement) => BuilderDataSource | undefined;
  tableForDataModel: (model: TargetDataSource | undefined) => BuilderDataTable | undefined;
  tableForDataSource: (source: BuilderDataSource | undefined, preferredTableName: string) => BuilderDataTable | undefined;
  tableForElement: (element: DashboardElement, source: BuilderDataSource | undefined) => BuilderDataTable | undefined;
}

export function useDashboardFilterEditorContext(
  props: Readonly<DashboardFilterEditorProps>,
  form: Ref<FilterFormState>
): DashboardFilterEditorContext {
  const allAvailableDataModels = computed(() => props.dataSources.flatMap(toTargetDataModels));
  const dashboardDataModels = computed(() => {
    const usedSourceIds = new Set(uniqueStrings(props.dashboardElements.flatMap(element => [
      element.dataSourceId,
      readString(element.config?.dataSource),
      readString(element.config?.dataSourceId),
      readString(visualizationDataRef(element).sourceId)
    ])));
    const usedModelIds = new Set(uniqueStrings(props.dashboardElements.flatMap(element => {
      const dataRef = visualizationDataRef(element);
      return [
        readString(element.config?.dataSourceTableId),
        readString(element.config?.tableId),
        readString(element.config?.tableName),
        readString(dataRef.tableId),
        readString(dataRef.tableName)
      ];
    })));
    if (usedModelIds.size > 0) {
      const models = allAvailableDataModels.value.filter(model =>
        usedModelIds.has(model.id) || usedModelIds.has(model.tableId) || usedModelIds.has(model.tableName)
      );
      if (models.length > 0) return models;
    }
    if (usedSourceIds.size > 0) {
      const models = allAvailableDataModels.value.filter(model => usedSourceIds.has(model.dataSourceId));
      if (models.length > 0) return models;
    }
    if (props.selectedTableId) {
      const models = allAvailableDataModels.value.filter(model =>
        model.id === props.selectedTableId || model.tableId === props.selectedTableId || model.tableName === props.selectedTableId
      );
      if (models.length > 0) return models;
    }
    return allAvailableDataModels.value;
  });
  const isSelectedDataModelFromDashboard = computed(() => (
    dashboardDataModels.value.some(model => model.id === form.value.dataModelId)
  ));
  const selectedDataModel = computed(() => dataModelById(form.value.dataModelId || form.value.tableName));
  const selectedDataSource = computed(() => dataSourceById(selectedDataModel.value?.dataSourceId ?? form.value.dataSourceId));
  const availableTables = computed(() => selectedDataSource.value?.tables ?? []);
  const selectedTable = computed(() => tableForDataModel(selectedDataModel.value) ?? tableForDataSource(selectedDataSource.value, form.value.tableName));
  const availableColumnFields = computed(() => fieldsForTable(selectedTable.value));
  const availableFields = computed(() => availableColumnFields.value);
  const requiredParameterLabels = computed(() =>
    requiredParametersForDataTable(selectedDataSource.value, selectedTable.value).map(parameterDisplayName)
  );
  const canOpenTargets = computed(() => {
    if (!form.value.type) return false;
    if (form.value.type !== 'dropdown') return true;
    return Boolean(form.value.dataModelId && form.value.field);
  });
  const compatibleComponents = computed(() => (
    props.dashboardElements.filter(element => element.isVisible !== false)
  ));

  function dataSourceById(id: string): BuilderDataSource | undefined {
    return props.dataSources.find(source => source.id === id || source.tables.some(table => table.id === id));
  }

  function dataModelById(id: string | undefined): TargetDataSource | undefined {
    const value = readString(id);
    if (!value) return undefined;
    return allAvailableDataModels.value.find(model => model.id === value || model.tableId === value || model.tableName === value);
  }

  function tableForDataSource(source: BuilderDataSource | undefined, preferredTableName: string): BuilderDataTable | undefined {
    if (!source) return undefined;
    return source.tables.find(table => table.name === preferredTableName || table.id === preferredTableName)
      ?? source.tables.find(table => table.id === props.selectedTableId)
      ?? source.tables.find(table => table.isSelected)
      ?? source.tables[0];
  }

  function tableForDataModel(model: TargetDataSource | undefined): BuilderDataTable | undefined {
    if (!model) return undefined;
    const source = dataSourceById(model.dataSourceId);
    return source?.tables.find(table => table.id === model.tableId || table.name === model.tableName);
  }

  function dataSourceForElement(element: DashboardElement): BuilderDataSource | undefined {
    const dataRef = visualizationDataRef(element);
    const sourceId = readString(element.dataSourceId)
      ?? readString(element.config?.dataSourceId)
      ?? readString(element.config?.dataSource)
      ?? readString(dataRef.sourceId);
    const tableId = readString(element.config?.dataSourceTableId)
      ?? readString(element.config?.tableId)
      ?? readString(element.config?.tableName)
      ?? readString(dataRef.tableId)
      ?? readString(dataRef.tableName);
    return props.dataSources.find(source => source.id === sourceId
      || source.tables.some(table => table.id === sourceId || table.name === sourceId || table.id === tableId || table.name === tableId));
  }

  function tableForElement(element: DashboardElement, source: BuilderDataSource | undefined): BuilderDataTable | undefined {
    const dataRef = visualizationDataRef(element);
    const tableId = readString(element.config?.dataSourceTableId)
      ?? readString(element.config?.tableId)
      ?? readString(element.config?.tableName)
      ?? readString(dataRef.tableId)
      ?? readString(dataRef.tableName);
    return source?.tables.find(table => table.id === tableId || table.name === tableId)
      ?? source?.tables.find(table => table.id === element.dataSourceId || table.name === element.dataSourceId)
      ?? source?.tables.find(table => table.isSelected)
      ?? source?.tables[0];
  }

  function getElementDataSourceName(element: DashboardElement): string {
    const id = readString(element.dataSourceId ?? element.config?.dataSource ?? visualizationDataRef(element).sourceId) ?? '';
    return (dataSourceById(id)?.name ?? id) || 'Current dashboard';
  }

  return {
    allAvailableDataModels,
    availableColumnFields,
    availableFields,
    availableTables,
    canOpenTargets,
    compatibleComponents,
    dashboardDataModels,
    isSelectedDataModelFromDashboard,
    requiredParameterLabels,
    selectedDataModel,
    selectedDataSource,
    selectedTable,
    dataModelById,
    dataSourceById,
    fieldLabel: filterFieldLabel,
    fieldsForTable,
    getElementDataSourceName,
    dataSourceForElement,
    tableForDataModel,
    tableForDataSource,
    tableForElement
  };
}
