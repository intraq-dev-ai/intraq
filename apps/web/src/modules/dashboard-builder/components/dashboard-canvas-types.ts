import type {
  BuilderDataSource,
  Dashboard,
  DashboardElement,
  DashboardFilterPatch,
  DashboardRunConfiguration,
  DashboardSettings
} from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';

export interface DashboardCanvasProps {
  dashboard: Dashboard;
  canEditDashboard: boolean;
  dataSources: BuilderDataSource[];
  editorFocusElementId: string;
  dashboardSettings?: DashboardSettings | undefined;
  runConfiguration: DashboardRunConfiguration;
  showViewDownloadActions?: boolean;
  showViewExpandActions?: boolean;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}

export type DashboardCanvasEmit = {
  (event: 'clearEdit'): void;
  (event: 'clone', elementId: string): void;
  (event: 'configureFilter', elementId: string): void;
  (event: 'edit', elementId: string): void;
  (event: 'remove', elementId: string): void;
  (event: 'changeFilter', filterId: string, patch: DashboardFilterPatch): void;
  (
    event: 'updateConfig',
    elementId: string,
    patch: { chartType?: string; config: Record<string, unknown>; name?: string }
  ): void;
  (event: 'updateLayout', elementId: string, layout: Record<string, number>): void;
  (event: 'dropComponent', type: string, chartType: string | undefined, gridX: number, gridY: number): void;
  (event: 'openFilterEditor', request: { elementId: string; filterId?: string }): void;
  (event: 'resize'): void;
};

export interface ComponentRunState {
  cancelToken: number;
  hasRun: boolean;
  isLoading: boolean;
  menuOpen: boolean;
  runToken: number;
}

export interface SettingsMenuPosition {
  left: number;
  top: number;
}

export interface ComponentDataPreview {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  totalRows: number;
}

export interface GridLayoutItem {
  h: number;
  i: string;
  w: number;
  x: number;
  y: number;
}

export function readConfigString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readConfigRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function safeDataToken(value: string): string | undefined {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return /[a-z0-9]/.test(normalized) ? normalized : undefined;
}

export function isContainerElement(element: DashboardElement): boolean {
  return element.type === 'container' || element.type === 'filter-container';
}
