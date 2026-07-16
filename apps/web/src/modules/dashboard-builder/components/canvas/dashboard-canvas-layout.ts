import type { DashboardElement } from '../../types';
import { isTwoRowCardConfig } from '../../card-layout-config';

export interface ComponentLayout {
  height: number;
  width: number;
  x: number;
  y: number;
}

export type LayoutDrafts = Record<string, ComponentLayout>;
export type ResizeHandlePosition = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const GRID_COLUMNS = 12;
const MAX_COMPONENT_HEIGHT = 12;
const MAX_TABLE_COMPONENT_HEIGHT = 42;
const MIN_COMPONENT_HEIGHT = 3;
const KPI_CARD_WIDTH = 4;
const KPI_CARD_DEFAULT_HEIGHT = 4;
const KPI_CARD_MIN_HEIGHT = 3;
const TWO_ROW_CARD_WIDTH = 3;
const LEGACY_WIDE_CARD_WIDTH = 6;
const LEGACY_SHORT_CARD_HEIGHT = 4;
const AUTO_CONTENT_TABLE_MIN_HEIGHT = 2;

export function buildLayoutStyles(
  elements: DashboardElement[],
  drafts: LayoutDrafts = {}
): Record<string, Record<string, string>> {
  const placed: ComponentLayout[] = [];
  const ordered = [...elements].sort((first, second) => {
    const firstLayout = resolvedLayout(first, drafts[first.id]);
    const secondLayout = resolvedLayout(second, drafts[second.id]);
    return firstLayout.y - secondLayout.y || firstLayout.x - secondLayout.x || first.order - second.order;
  });
  return Object.fromEntries(ordered.map(element => {
    const layout = findNextAvailableLayout(
      placed,
      resolvedLayout(element, drafts[element.id]),
      maxHeightForElement(element)
    );
    placed.push(layout);
    return [element.id, layoutToStyle(layout, maxHeightForElement(element))];
  }));
}

export function autoAlignDashboardLayouts(
  elements: DashboardElement[],
  drafts: LayoutDrafts = {}
): LayoutDrafts {
  const ordered = [...elements].sort((first, second) => {
    const firstLayout = resolvedLayout(first, drafts[first.id]);
    const secondLayout = resolvedLayout(second, drafts[second.id]);
    return firstLayout.y - secondLayout.y || firstLayout.x - secondLayout.x || first.order - second.order;
  });
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const aligned: LayoutDrafts = {};

  for (const element of ordered) {
    const current = autoAlignLayout(element, drafts[element.id]);
    if (cursorX > 0 && cursorX + current.width > GRID_COLUMNS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    const layout = normalizeLayoutForElement(element, {
      ...current,
      x: cursorX,
      y: cursorY
    });
    aligned[element.id] = layout;
    cursorX += layout.width;
    rowHeight = Math.max(rowHeight, layout.height);

    if (cursorX >= GRID_COLUMNS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
  }

  return aligned;
}

export function findNextAvailableLayout(
  existingLayouts: ComponentLayout[],
  requestedLayout: ComponentLayout,
  maxHeight = MAX_COMPONENT_HEIGHT
): ComponentLayout {
  const layout = normalizeLayout({ ...requestedLayout }, 1, maxHeight);
  const placedLayouts = existingLayouts.map(item => normalizeLayout(item, 1, Math.max(MAX_COMPONENT_HEIGHT, item.height)));
  while (placedLayouts.some(item => layoutsOverlap(layout, item))) {
    layout.y += 1;
  }
  return layout;
}

export function resolvedLayout(
  element: DashboardElement,
  draft?: ComponentLayout
): ComponentLayout {
  if (draft) return normalizeLayoutForElement(element, { ...draft });
  const minHeight = minHeightForElement(element);
  const minWidth = minWidthForType(element.type);
  return normalizeLayoutForElement(element, {
    width: Math.max(minWidth, readLayoutNumber(element.layout?.w, defaultWidthForElement(element))),
    height: Math.max(minHeight, readLayoutNumber(element.layout?.h, defaultHeightForElement(element))),
    x: readLayoutNumber(element.layout?.x, 0),
    y: readLayoutNumber(element.layout?.y, element.order)
  });
}

export function layoutToStorage(layout: ComponentLayout): Record<string, number> {
  const normalized = normalizeLayout(layout);
  return {
    h: normalized.height,
    w: normalized.width,
    x: normalized.x,
    y: normalized.y
  };
}

export function layoutToStorageForElement(element: DashboardElement, layout: ComponentLayout): Record<string, number> {
  const normalized = normalizeLayoutForElement(element, layout);
  return {
    h: normalized.height,
    w: normalized.width,
    x: normalized.x,
    y: normalized.y
  };
}

export function resizeLayout(
  layout: ComponentLayout,
  patch: { heightDelta?: number; widthDelta?: number }
): ComponentLayout {
  const targetWidth = Math.min(GRID_COLUMNS, Math.max(2, layout.width + (patch.widthDelta ?? 0)));
  const targetX = Math.min(layout.x, GRID_COLUMNS - targetWidth);
  return {
    ...layout,
    height: Math.min(MAX_COMPONENT_HEIGHT, Math.max(MIN_COMPONENT_HEIGHT, layout.height + (patch.heightDelta ?? 0))),
    width: targetWidth,
    x: Math.max(0, targetX)
  };
}

export function moveLayout(
  layout: ComponentLayout,
  patch: { xDelta?: number; yDelta?: number }
): ComponentLayout {
  return {
    ...layout,
    x: clamp(layout.x + (patch.xDelta ?? 0), 0, GRID_COLUMNS - layout.width),
    y: Math.max(0, layout.y + (patch.yDelta ?? 0))
  };
}

export function resizeLayoutFromHandle(
  layout: ComponentLayout,
  patch: { heightDelta?: number; position: ResizeHandlePosition; widthDelta?: number },
  constraints: { maxHeight?: number; minHeight?: number; minWidth?: number } = {}
): ComponentLayout {
  const minWidth = constraints.minWidth ?? 2;
  const minHeight = constraints.minHeight ?? MIN_COMPONENT_HEIGHT;
  const maxHeight = Math.max(minHeight, constraints.maxHeight ?? MAX_COMPONENT_HEIGHT);
  let next = { ...layout };

  if (patch.position.includes('e')) {
    next.width = clamp(layout.width + (patch.widthDelta ?? 0), minWidth, GRID_COLUMNS - layout.x);
  } else if (patch.position.includes('w')) {
    next = resizeFromLeadingEdge(next, patch.widthDelta ?? 0, minWidth, GRID_COLUMNS, 'x', 'width');
  }

  if (patch.position.includes('s')) {
    next.height = clamp(layout.height + (patch.heightDelta ?? 0), minHeight, maxHeight);
  } else if (patch.position.includes('n')) {
    next = resizeFromLeadingEdge(next, patch.heightDelta ?? 0, minHeight, maxHeight, 'y', 'height');
  }

  return next;
}

export function minWidthForType(type: string): number {
  if (type === 'export') return 1;
  return type === 'card' || type === 'container' || type === 'filter' || type === 'filter-container' ? 2 : 4;
}

export function minHeightForType(type: string): number {
  if (type === 'export' || type === 'text') return 1;
  if (type === 'container' || type === 'filter-container' || type === 'filter') return 2;
  return type === 'card' ? MIN_COMPONENT_HEIGHT : 6;
}

export function minHeightForElement(element: DashboardElement): number {
  const configured = readConfiguredMinHeight(element);
  if (configured !== undefined) return configured;
  if ((element.type === 'table' || element.type === 'matrix') && usesAutoContentHeight(element)) {
    return AUTO_CONTENT_TABLE_MIN_HEIGHT;
  }
  if (element.type === 'card' && !isTwoRowCardElement(element)) return KPI_CARD_MIN_HEIGHT;
  return minHeightForType(element.type);
}

export function maxHeightForElement(element: DashboardElement): number {
  if (element.type === 'export') return 1;
  if (element.type === 'text') return 4;
  if (element.type === 'table' || element.type === 'matrix') return MAX_TABLE_COMPONENT_HEIGHT;
  return MAX_COMPONENT_HEIGHT;
}

export function isTwoRowCardElement(element: DashboardElement): boolean {
  if (element.type !== 'card') return false;
  return isTwoRowCardConfig(element.config ?? {});
}

export function usesAutoContentHeight(element: DashboardElement): boolean {
  if (element.type !== 'table' && element.type !== 'matrix') return false;
  const raw = readConfigString(element.config?.tableHeightMode ?? element.config?.heightMode);
  return raw === 'auto'
    || raw === 'content'
    || raw === 'auto-content'
    || raw === 'auto-fit-content'
    || raw === 'fit-content'
    || raw === 'content-aware'
    || raw === 'auto-height';
}

function autoAlignLayout(element: DashboardElement, draft?: ComponentLayout): ComponentLayout {
  const current = resolvedLayout(element, draft);
  if (shouldCompactLegacyKpiCard(element, draft)) {
    return normalizeLayoutForElement(element, {
      ...current,
      height: KPI_CARD_DEFAULT_HEIGHT,
      width: KPI_CARD_WIDTH
    });
  }
  return current;
}

function shouldCompactLegacyKpiCard(element: DashboardElement, draft?: ComponentLayout): boolean {
  if (element.type !== 'card' || isTwoRowCardElement(element)) return false;
  const rawWidth = draft?.width ?? readLayoutNumber(element.layout?.w, defaultWidthForElement(element));
  const rawHeight = draft?.height ?? readLayoutNumber(element.layout?.h, defaultHeightForElement(element));
  return rawWidth >= LEGACY_WIDE_CARD_WIDTH && rawHeight <= LEGACY_SHORT_CARD_HEIGHT;
}

function defaultWidthForElement(element: DashboardElement): number {
  if (element.type === 'card') return isTwoRowCardElement(element) ? TWO_ROW_CARD_WIDTH : KPI_CARD_WIDTH;
  if (element.type === 'container' || element.type === 'filter-container') return 12;
  if (element.type === 'export') return 3;
  if (element.type === 'filter') return 3;
  if (element.type === 'table' || element.type === 'matrix') return 8;
  return 6;
}

function defaultHeightForElement(element: DashboardElement): number {
  if (element.type === 'card' && !isTwoRowCardElement(element)) return KPI_CARD_DEFAULT_HEIGHT;
  return minHeightForElement(element);
}

function readConfiguredMinHeight(element: DashboardElement): number | undefined {
  const config = element.config ?? {};
  const value = config.layoutMinHeight ?? config.minLayoutHeight ?? config.gridMinHeight;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return clamp(Math.floor(parsed), 1, MAX_TABLE_COMPONENT_HEIGHT);
}

function layoutToStyle(layout: ComponentLayout, maxHeight = MAX_COMPONENT_HEIGHT): Record<string, string> {
  const normalized = normalizeLayout(layout, 1, maxHeight);
  return {
    '--component-x': String(normalized.x + 1),
    '--component-y': String(normalized.y + 1),
    '--component-width': String(normalized.width),
    '--component-height': String(normalized.height)
  };
}

function layoutsOverlap(first: ComponentLayout, second: ComponentLayout): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function readLayoutNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function readConfigString(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replaceAll('_', '-').toLowerCase()
    : '';
}

function resizeFromLeadingEdge(
  layout: ComponentLayout,
  delta: number,
  minSize: number,
  maxSize: number,
  positionKey: 'x' | 'y',
  sizeKey: 'height' | 'width'
): ComponentLayout {
  const trailingEdge = layout[positionKey] + layout[sizeKey];
  const minPosition = Math.max(0, trailingEdge - maxSize);
  const maxPosition = trailingEdge - minSize;
  const nextPosition = clamp(layout[positionKey] - delta, minPosition, maxPosition);
  return {
    ...layout,
    [positionKey]: nextPosition,
    [sizeKey]: trailingEdge - nextPosition
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeLayout(
  layout: ComponentLayout,
  minHeight = MIN_COMPONENT_HEIGHT,
  maxHeight = MAX_COMPONENT_HEIGHT
): ComponentLayout {
  const width = clamp(Math.floor(layout.width), 1, GRID_COLUMNS);
  const height = clamp(Math.floor(layout.height), minHeight, Math.max(minHeight, maxHeight));
  const x = clamp(Math.floor(layout.x), 0, GRID_COLUMNS - width);
  const y = Math.max(0, Math.floor(layout.y));
  return { width, height, x, y };
}

function normalizeLayoutForElement(element: DashboardElement, layout: ComponentLayout): ComponentLayout {
  const minHeight = minHeightForElement(element);
  const maxHeight = Math.max(minHeight, maxHeightForElement(element));
  const normalized = normalizeLayout(layout, 1, maxHeight);
  const minWidth = minWidthForType(element.type);
  const width = clamp(normalized.width, minWidth, GRID_COLUMNS);
  const height = clamp(normalized.height, minHeight, maxHeight);
  return {
    width,
    height,
    x: clamp(normalized.x, 0, GRID_COLUMNS - width),
    y: normalized.y
  };
}
