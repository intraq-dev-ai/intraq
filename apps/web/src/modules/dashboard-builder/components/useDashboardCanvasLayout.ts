import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DashboardElement } from '../types';
import {
  buildLayoutStyles,
  layoutToStorageForElement,
  maxHeightForElement,
  minHeightForElement,
  resolvedLayout,
  usesAutoContentHeight,
  type ComponentLayout,
  type LayoutDrafts
} from './canvas/dashboard-canvas-layout';
import { dashboardDropGridPosition } from './canvas/dashboard-canvas-drop-target';
import {
  isContainerElement,
  readConfigString,
  type DashboardCanvasEmit,
  type DashboardCanvasProps,
  type GridLayoutItem
} from './dashboard-canvas-types';

const MOBILE_CANVAS_QUERY = '(max-width: 760px)';
const MOBILE_GRID_ROW_HEIGHT = 44;
const DESKTOP_GRID_COLUMNS = 12;
const DESKTOP_GRID_ROW_HEIGHT = 30;
const DESKTOP_GRID_MARGIN_Y = 16;
const MOBILE_GRID_MARGIN_Y = 12;
const AUTO_CONTENT_HEIGHT_CHROME_PX = 32;
const AUTO_CONTENT_ROW_ESTIMATE_PX = 50;
const AUTO_CONTENT_TALL_TABLE_ROW_THRESHOLD = 12;
const AUTO_CONTENT_TALL_TABLE_BOTTOM_BUFFER_ROWS = 3;
const GRID_DRAG_IGNORE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="menuitem"]',
  '.card-wrapper-actions',
  '.resize-handle',
  '.vue-resizable-handle',
  '.settings-dropdown',
  '.dashboard-filter-dropdown-control'
].join(', ');

export function useDashboardCanvasLayout(
  props: DashboardCanvasProps,
  emit: DashboardCanvasEmit,
  options: {
    elementPassesVisibilityRules: (element: DashboardElement) => boolean;
    showElementHeader: (element: DashboardElement) => boolean;
  }
) {
  const layoutDrafts = ref<LayoutDrafts>({});
  const autoContentHeights = ref<Record<string, number>>({});
  const editableLayout = ref<GridLayoutItem[]>([]);
  const mobileCanvasQuery = ref<MediaQueryList | null>(null);
  const isMobileCanvas = ref(false);
  const isDragOver = ref(false);
  const canvasPanelRef = ref<HTMLElement | null>(null);
  const dragGridPosition = ref<{ gridX: number; gridY: number } | null>(null);
  let pendingCanvasResizeFrame = 0;

  const focusedElementExists = computed(() => props.dashboard.elements.some(element => element.id === props.editorFocusElementId));
  const hasEditorFocus = computed(() => props.canEditDashboard && props.editorFocusElementId !== '' && focusedElementExists.value);
  const containerIds = computed(() => new Set(props.dashboard.elements
    .filter(element => isContainerElement(element))
    .map(element => element.id)));
  const containedElementIds = computed(() => new Set(props.dashboard.elements
    .filter(element => {
      const containerId = configuredContainerId(element);
      return Boolean(containerId && containerIds.value.has(containerId));
    })
    .map(element => element.id)));
  const canvasElements = computed(() => props.dashboard.elements.filter(element =>
    element.isVisible !== false
    && options.elementPassesVisibilityRules(element)
    && !containedElementIds.value.has(element.id)
  ));
  const runtimeLayoutDrafts = computed(() => props.canEditDashboard
    ? layoutDrafts.value
    : autoContentLayoutDrafts()
  );
  const layoutStyles = computed(() => buildLayoutStyles(canvasElements.value, runtimeLayoutDrafts.value));
  const orderedElements = computed(() => [...canvasElements.value].sort((first, second) => {
    const firstLayout = resolvedLayout(first, layoutDrafts.value[first.id]);
    const secondLayout = resolvedLayout(second, layoutDrafts.value[second.id]);
    return firstLayout.y - secondLayout.y || firstLayout.x - secondLayout.x || first.order - second.order;
  }));
  const mobileGridLayout = computed<GridLayoutItem[]>(() => {
    let nextY = 0;
    return orderedElements.value.map(element => {
      const layout = resolvedLayout(element, layoutDrafts.value[element.id]);
      const height = Math.max(minMobileGridItemHeight(element), layout.height);
      const item = { h: height, i: element.id, w: 1, x: 0, y: nextY };
      nextY += height + 1;
      return item;
    });
  });
  const mobileGridLayoutById = computed(() => new Map(mobileGridLayout.value.map(item => [item.i, item])));
  const activeGridLayout = computed(() => isMobileCanvas.value ? mobileGridLayout.value : editableLayout.value);
  const gridLayoutKey = computed(() =>
    `${props.dashboard.id}:${isMobileCanvas.value ? 'mobile' : 'desktop'}:${canvasElements.value.map(element => element.id).join('|')}`
  );
  const canvasGridProps = computed(() => props.canEditDashboard
    ? {
        colNum: isMobileCanvas.value ? 1 : 12,
        isDraggable: !isMobileCanvas.value,
        isResizable: !isMobileCanvas.value,
        layout: activeGridLayout.value,
        margin: isMobileCanvas.value ? [0, 12] : [16, 16],
        rowHeight: isMobileCanvas.value ? MOBILE_GRID_ROW_HEIGHT : 30,
        useCssTransforms: !isMobileCanvas.value,
        verticalCompact: true
      }
    : {});

  function onCanvasDragOver(event: DragEvent): void {
    if (!props.canEditDashboard) return;
    if (event.dataTransfer?.types.includes('application/x-dashboard-component')) {
      isDragOver.value = true;
      event.dataTransfer.dropEffect = 'copy';
      dragGridPosition.value = readCanvasDropGridPosition(event);
    }
  }

  function onCanvasDrop(event: DragEvent): void {
    isDragOver.value = false;
    if (!props.canEditDashboard) return;
    const raw = event.dataTransfer?.getData('application/x-dashboard-component');
    if (!raw) return;
    let component: { type: string; chartType?: string };
    try { component = JSON.parse(raw); } catch { return; }
    const { gridX, gridY } = dragGridPosition.value ?? readCanvasDropGridPosition(event);
    dragGridPosition.value = null;
    emit('dropComponent', component.type, component.chartType, gridX, gridY);
  }

  function onCanvasDragLeave(): void {
    isDragOver.value = false;
    dragGridPosition.value = null;
  }

  function readCanvasDropGridPosition(event: DragEvent): { gridX: number; gridY: number } {
    const panel = canvasPanelRef.value ?? (event.currentTarget as HTMLElement);
    const grid = panel.querySelector<HTMLElement>('.dashboard-canvas-elements') ?? panel;
    const rect = grid.getBoundingClientRect();
    return dashboardDropGridPosition({
      clientX: event.clientX,
      clientY: event.clientY,
      columns: isMobileCanvas.value ? 1 : DESKTOP_GRID_COLUMNS,
      marginY: isMobileCanvas.value ? MOBILE_GRID_MARGIN_Y : DESKTOP_GRID_MARGIN_Y,
      rect,
      rowHeight: isMobileCanvas.value ? MOBILE_GRID_ROW_HEIGHT : DESKTOP_GRID_ROW_HEIGHT
    });
  }

  function syncLayoutDrafts(): void {
    const ids = new Set(props.dashboard.elements.map(element => element.id));
    layoutDrafts.value = Object.fromEntries(Object.entries(layoutDrafts.value).filter(([id]) => ids.has(id)));
    autoContentHeights.value = Object.fromEntries(Object.entries(autoContentHeights.value).filter(([id]) => ids.has(id)));
  }

  function syncEditableLayout(): void {
    editableLayout.value = canvasElements.value.map(element => {
      const layout = resolvedLayout(element, layoutDrafts.value[element.id]);
      return { h: layout.height, i: element.id, w: layout.width, x: layout.x, y: layout.y };
    });
  }

  function layoutSyncSignature(): string {
    return canvasElements.value
      .map(element => {
        const layout = resolvedLayout(element, layoutDrafts.value[element.id]);
        return `${element.id}:${layout.x}:${layout.y}:${layout.width}:${layout.height}`;
      })
      .join('|');
  }

  function handleContentResize(elementId: string, height: number): void {
    if (props.canEditDashboard || !Number.isFinite(height) || height <= 0) return;
    const element = props.dashboard.elements.find(candidate => candidate.id === elementId);
    if (!element || !usesAutoContentHeight(element)) return;
    const normalizedHeight = Math.ceil(height);
    if (autoContentHeights.value[elementId] === normalizedHeight) return;
    autoContentHeights.value = {
      ...autoContentHeights.value,
      [elementId]: normalizedHeight
    };
    requestCanvasResizeAfterRender();
  }

  function requestCanvasResizeAfterRender(): void {
    void nextTick(() => requestCanvasResize());
  }

  function requestCanvasResize(): void {
    if (typeof window === 'undefined') {
      emit('resize');
      return;
    }
    if (pendingCanvasResizeFrame) return;
    pendingCanvasResizeFrame = window.requestAnimationFrame(() => {
      pendingCanvasResizeFrame = 0;
      emit('resize');
    });
  }

  function configuredContainerId(element: DashboardElement): string | undefined {
    if (isContainerElement(element)) return undefined;
    const value = readConfigString(element.config?.containerId);
    return value || undefined;
  }

  function containerChildren(element: DashboardElement): DashboardElement[] {
    if (!isContainerElement(element)) return [];
    const explicitChildIds = Array.isArray(element.config?.childElementIds)
      ? element.config.childElementIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const explicit = explicitChildIds
      .map(id => props.dashboard.elements.find(child => child.id === id))
      .filter((child): child is DashboardElement => Boolean(child));
    const assigned = props.dashboard.elements.filter(child => configuredContainerId(child) === element.id);
    return [...explicit, ...assigned]
      .filter((child, index, list) => list.findIndex(candidate => candidate.id === child.id) === index)
      .filter(child => child.isVisible !== false && options.elementPassesVisibilityRules(child))
      .sort((first, second) => {
        const firstLayout = resolvedLayout(first, layoutDrafts.value[first.id]);
        const secondLayout = resolvedLayout(second, layoutDrafts.value[second.id]);
        return firstLayout.y - secondLayout.y || firstLayout.x - secondLayout.x || first.order - second.order;
      });
  }

  function autoContentLayoutDrafts(): LayoutDrafts {
    const next: LayoutDrafts = { ...layoutDrafts.value };
    for (const element of canvasElements.value) {
      if (!usesAutoContentHeight(element)) continue;
      const contentHeight = autoContentHeights.value[element.id];
      if (!contentHeight) continue;
      const layout = resolvedLayout(element, layoutDrafts.value[element.id]);
      next[element.id] = {
        ...layout,
        height: autoContentGridHeight(element, contentHeight)
      };
    }
    return next;
  }

  function autoContentGridHeight(element: DashboardElement, contentHeight: number): number {
    const chromeHeight = options.showElementHeader(element) ? AUTO_CONTENT_HEIGHT_CHROME_PX + 24 : AUTO_CONTENT_HEIGHT_CHROME_PX;
    const targetRows = Math.ceil((contentHeight + chromeHeight) / AUTO_CONTENT_ROW_ESTIMATE_PX);
    const bottomBufferRows = targetRows >= AUTO_CONTENT_TALL_TABLE_ROW_THRESHOLD ? AUTO_CONTENT_TALL_TABLE_BOTTOM_BUFFER_ROWS : 0;
    const minRows = minHeightForElement(element);
    const maxRows = maxHeightForElement(element);
    return Math.min(maxRows, Math.max(minRows, targetRows + bottomBufferRows));
  }

  function layoutStyle(element: DashboardElement): Record<string, string> {
    return layoutStyles.value[element.id] ?? {};
  }

  function elementLayout(element: DashboardElement): ComponentLayout {
    return resolvedLayout(element, layoutDrafts.value[element.id]);
  }

  function minGridItemWidth(element: DashboardElement): number {
    if (element.type === 'export') return 1;
    return element.type === 'card' || element.type === 'container' || element.type === 'filter' || element.type === 'filter-container' ? 2 : 4;
  }

  function minGridItemHeight(element: DashboardElement): number {
    return minHeightForElement(element);
  }

  function maxGridItemHeight(element: DashboardElement): number {
    return maxHeightForElement(element);
  }

  function minMobileGridItemHeight(element: DashboardElement): number {
    if (element.type === 'export') return 1;
    if (element.type === 'container' || element.type === 'filter-container' || element.type === 'filter') return 2;
    if (element.type === 'card') return minHeightForElement(element);
    return 6;
  }

  function gridItemProps(element: DashboardElement): Record<string, unknown> {
    if (!props.canEditDashboard) return {};
    const item = isMobileCanvas.value
      ? mobileGridLayoutById.value.get(element.id)
      : editableLayout.value.find(candidate => candidate.i === element.id);
    const layout = item
      ? { height: item.h, width: item.w, x: item.x, y: item.y }
      : elementLayout(element);
    return {
      'aria-label': `${element.name} canvas item`,
      class: {
        'vue-grid-item--container': isContainerElement(element),
        'vue-grid-item--filter': element.type === 'filter',
        'vue-grid-item--export': element.type === 'export',
        'vue-grid-item--mobile': isMobileCanvas.value
      },
      dragIgnoreFrom: GRID_DRAG_IGNORE_SELECTOR,
      h: layout.height,
      i: element.id,
      maxH: maxGridItemHeight(element),
      minH: isMobileCanvas.value ? minMobileGridItemHeight(element) : minGridItemHeight(element),
      minW: isMobileCanvas.value ? 1 : minGridItemWidth(element),
      role: 'group',
      w: layout.width,
      x: layout.x,
      y: layout.y
    };
  }

  function onGridLayoutUpdated(layout: GridLayoutItem[]): void {
    if (isMobileCanvas.value) return;
    editableLayout.value = layout;
    const elementIds = new Set(props.dashboard.elements.map(element => element.id));
    const nextDrafts: LayoutDrafts = { ...layoutDrafts.value };
    for (const item of layout) {
      if (!elementIds.has(item.i)) continue;
      const current = props.dashboard.elements.find(element => element.id === item.i);
      const next = gridItemToComponentLayout(item, current);
      if (!current || sameLayout(next, elementLayout(current))) continue;
      nextDrafts[item.i] = next;
      emit('updateLayout', item.i, gridItemToStorage(item, current));
    }
    layoutDrafts.value = nextDrafts;
  }

  function handleMobileCanvasChange(event: MediaQueryListEvent): void {
    isMobileCanvas.value = event.matches;
  }

  watch(() => props.dashboard.elements.map(element => element.id).join('|'), syncLayoutDrafts, { immediate: true });
  watch(layoutSyncSignature, syncEditableLayout, { immediate: true });

  onMounted(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(MOBILE_CANVAS_QUERY);
    mobileCanvasQuery.value = query;
    isMobileCanvas.value = query.matches;
    query.addEventListener('change', handleMobileCanvasChange);
  });

  onBeforeUnmount(() => {
    mobileCanvasQuery.value?.removeEventListener('change', handleMobileCanvasChange);
    if (typeof window === 'undefined') return;
    if (pendingCanvasResizeFrame) {
      window.cancelAnimationFrame(pendingCanvasResizeFrame);
      pendingCanvasResizeFrame = 0;
    }
  });

  return {
    canvasElements,
    canvasGridProps,
    canvasPanelRef,
    containerChildren,
    elementLayout,
    gridItemProps,
    gridLayoutKey,
    handleContentResize,
    hasEditorFocus,
    isDragOver,
    isMobileCanvas,
    layoutStyle,
    onCanvasDragLeave,
    onCanvasDragOver,
    onCanvasDrop,
    onGridLayoutUpdated,
    orderedElements,
    requestCanvasResize,
    requestCanvasResizeAfterRender
  };
}

function gridItemToComponentLayout(item: GridLayoutItem, element?: DashboardElement): ComponentLayout {
  const layout = {
    height: Math.max(1, Math.floor(item.h)),
    width: Math.max(1, Math.floor(item.w)),
    x: Math.max(0, Math.floor(item.x)),
    y: Math.max(0, Math.floor(item.y))
  };
  return element ? resolvedLayout(element, layout) : layout;
}

function gridItemToStorage(item: GridLayoutItem, element?: DashboardElement): Record<string, number> {
  const layout = gridItemToComponentLayout(item, element);
  return element ? layoutToStorageForElement(element, layout) : {
    h: layout.height,
    w: layout.width,
    x: layout.x,
    y: layout.y
  };
}

function sameLayout(first: ComponentLayout, second: ComponentLayout): boolean {
  return first.height === second.height && first.width === second.width && first.x === second.x && first.y === second.y;
}
