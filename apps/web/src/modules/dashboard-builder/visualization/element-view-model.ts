import type { DashboardElement, VisualizationSpec } from '../types';
import type { DashboardElementRenderKind } from './view-model-types';

export type {
  DashboardCardModel,
  DashboardCardSegment,
  DashboardDisplayMode,
  DashboardElementRenderKind,
  DashboardMatrixCellMeta,
  DashboardMatrixModel,
  DashboardMatrixRow,
  DashboardTableCell,
  DashboardTableCellType,
  DashboardTableColumn,
  DashboardTableModel,
  DashboardTableRow,
  SortDirection,
  TrendDirection
} from './view-model-types';
export { buildCardViewModel as cardViewModel } from './card-view-model';
export { buildMatrixViewModel as matrixViewModel } from './matrix-view-model';
export { tableViewModel } from './table-view-model';

export function elementRenderKind(
  element: DashboardElement,
  spec: VisualizationSpec
): DashboardElementRenderKind {
  if (element.type === 'filter' || spec.kind === 'filter') return 'filter';
  if (element.type === 'container' || element.type === 'filter-container') return 'container';
  if (element.type === 'export') return 'export';
  if (element.type === 'news' || element.type === 'NewsViewComponent') return 'news';
  if (element.type === 'chatbot' || element.type === 'AIChatBotComponent') return 'chatbot';
  if (element.type === 'matrix' || spec.kind === 'matrix') return 'matrix';
  if (element.type === 'card' || spec.kind === 'card') return 'card';
  if (element.type === 'table' || spec.kind === 'table') return 'table';
  if (element.type === 'text' || spec.kind === 'text') return 'text';
  return 'chart';
}
