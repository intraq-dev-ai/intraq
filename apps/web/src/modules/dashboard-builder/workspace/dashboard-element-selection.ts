import { chooseDefaultTable } from '../agent-context/element-planner';
import type { Dashboard } from '../types';
import { readString } from './dashboard-agent-conversation';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

export function assertSelectedElementOnlyUpdate(
  before: Dashboard,
  after: Dashboard,
  selectedElementId: string
): void {
  const beforeIds = before.elements.map(element => element.id);
  const afterIds = after.elements.map(element => element.id);
  const identityChanged = beforeIds.length !== afterIds.length
    || beforeIds.some((id, index) => afterIds[index] !== id);
  if (identityChanged || !afterIds.includes(selectedElementId)) {
    throw new Error('Selected component AI edits must not create, remove, or reorder dashboard elements.');
  }
}

export function syncWorkspaceDataSelectionFromElement(
  state: DashboardWorkspaceState,
  element: Dashboard['elements'][number] | null
): void {
  if (!element) return;
  const sourceId = readString(element.dataSourceId) ?? readString(element.config?.dataSourceId);
  if (!sourceId) return;
  state.selectedDataSourceId.value = sourceId;
  const source = state.dataSources.value.find(item => item.id === sourceId);
  const savedTableId = readString(element.config?.dataSourceTableId);
  const savedTableName = readString(element.config?.tableName) ?? readString(element.config?.dataSource);
  const savedTable = source?.tables.find(table =>
    table.id === savedTableId
    || table.name === savedTableName
    || table.dictionary?.businessName === savedTableName
  );
  state.selectedTableId.value = savedTable?.id ?? savedTableId ?? chooseDefaultTable(source ?? null, state.selectedTableId.value)?.id ?? '';
  state.selectedTableUserSelected.value = false;
}
