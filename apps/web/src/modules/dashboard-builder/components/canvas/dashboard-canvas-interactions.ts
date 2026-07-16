import { onBeforeUnmount, ref } from 'vue';
import type { DashboardElement } from '../../types';
import {
  maxHeightForElement,
  minHeightForElement,
  minWidthForType,
  moveLayout,
  resizeLayoutFromHandle,
  type ComponentLayout,
  type ResizeHandlePosition
} from './dashboard-canvas-layout';

interface InteractionState {
  currentLayout: ComponentLayout;
  elementId: string;
  startLayout: ComponentLayout;
  startWidthPx: number;
  startX: number;
  startY: number;
}

interface ResizeState extends InteractionState {
  position: ResizeHandlePosition;
}

interface CanvasInteractionOptions {
  canEditDashboard: () => boolean;
  commitLayout: (element: DashboardElement, layout: ComponentLayout) => void;
  getElement: (elementId: string) => DashboardElement | undefined;
  getElementNode: (elementId: string) => HTMLElement | undefined;
  getLayout: (element: DashboardElement) => ComponentLayout;
  previewLayout?: (elementId: string, layout: ComponentLayout) => void;
  setLayout: (element: DashboardElement, layout: ComponentLayout) => void;
}

const GRID_CELL_HEIGHT = 62;

export function useDashboardCanvasInteractions(options: CanvasInteractionOptions) {
  const movingElementId = ref<string | null>(null);
  const resizingElementId = ref<string | null>(null);
  const moveState = ref<InteractionState | null>(null);
  const movePreviewStyles = ref<Record<string, Record<string, string>>>({});
  const resizeState = ref<ResizeState | null>(null);

  function startMove(elementId: string, event: MouseEvent | TouchEvent): void {
    if (!options.canEditDashboard() || resizeState.value || shouldIgnoreMoveTarget(event.target)) return;
    const state = createInteractionState(elementId, event, options);
    if (!state) return;
    event.preventDefault();
    moveState.value = state;
    movingElementId.value = elementId;
    setBodyDragging(true);
    addInteractionListeners(event, onMovePointerMove, onMovePointerEnd);
  }

  function startResize(elementId: string, position: ResizeHandlePosition, event: MouseEvent | TouchEvent): void {
    if (!options.canEditDashboard() || moveState.value) return;
    const state = createInteractionState(elementId, event, options);
    if (!state) return;
    event.preventDefault();
    resizeState.value = { ...state, position };
    resizingElementId.value = elementId;
    setBodyDragging(true);
    addInteractionListeners(event, onResizePointerMove, onResizePointerEnd);
  }

  function onMovePointerMove(event: MouseEvent | TouchEvent): void {
    if (!moveState.value) return;
    const element = options.getElement(moveState.value.elementId);
    const point = eventPoint(event);
    if (!element || !point) return;
    event.preventDefault();
    const next = moveLayout(moveState.value.startLayout, {
      xDelta: Math.round((point.x - moveState.value.startX) / pixelWidthPerGridUnit(moveState.value)),
      yDelta: Math.round((point.y - moveState.value.startY) / GRID_CELL_HEIGHT)
    });
    moveState.value.currentLayout = next;
    options.previewLayout?.(element.id, next);
    movePreviewStyles.value = {
      ...movePreviewStyles.value,
      [element.id]: {
        transform: `translate3d(${point.x - moveState.value.startX}px, ${point.y - moveState.value.startY}px, 0)`
      }
    };
  }

  function onResizePointerMove(event: MouseEvent | TouchEvent): void {
    if (!resizeState.value) return;
    const element = options.getElement(resizeState.value.elementId);
    const point = eventPoint(event);
    if (!element || !point) return;
    event.preventDefault();
    const position = resizeState.value.position;
    const next = resizeLayoutFromHandle(resizeState.value.startLayout, {
      heightDelta: position.includes('s') ? Math.round((point.y - resizeState.value.startY) / GRID_CELL_HEIGHT) : 0,
      position,
      widthDelta: position.includes('e') ? Math.round((point.x - resizeState.value.startX) / pixelWidthPerGridUnit(resizeState.value)) : 0
    }, {
      maxHeight: maxHeightForElement(element),
      minHeight: minHeightForElement(element),
      minWidth: minWidthForType(element.type)
    });
    setIfChanged(element, next, options);
  }

  function onMovePointerEnd(): void {
    commitMoveLayout(moveState.value, options);
    removeInteractionListeners(onMovePointerMove, onMovePointerEnd);
    if (moveState.value) {
      const { [moveState.value.elementId]: _removed, ...remaining } = movePreviewStyles.value;
      movePreviewStyles.value = remaining;
      options.previewLayout?.(moveState.value.elementId, moveState.value.startLayout);
    }
    moveState.value = null;
    movingElementId.value = null;
    setBodyDragging(false);
  }

  function onResizePointerEnd(): void {
    commitInteractionLayout(resizeState.value, options);
    removeInteractionListeners(onResizePointerMove, onResizePointerEnd);
    resizeState.value = null;
    resizingElementId.value = null;
    setBodyDragging(false);
  }

  onBeforeUnmount(() => {
    onMovePointerEnd();
    onResizePointerEnd();
  });

  return { movePreviewStyles, movingElementId, resizingElementId, startMove, startResize };
}

function commitMoveLayout(state: InteractionState | null, options: CanvasInteractionOptions): void {
  if (!state) return;
  const element = options.getElement(state.elementId);
  if (!element) return;
  options.setLayout(element, state.currentLayout);
  options.commitLayout(element, state.currentLayout);
}

function commitInteractionLayout(state: InteractionState | null, options: CanvasInteractionOptions): void {
  if (!state) return;
  const element = options.getElement(state.elementId);
  if (!element) return;
  options.commitLayout(element, options.getLayout(element));
}

function createInteractionState(
  elementId: string,
  event: MouseEvent | TouchEvent,
  options: CanvasInteractionOptions
): InteractionState | null {
  const element = options.getElement(elementId);
  const node = options.getElementNode(elementId);
  const point = eventPoint(event);
  if (!element || !node || !point) return null;
  return {
    currentLayout: options.getLayout(element),
    elementId,
    startLayout: options.getLayout(element),
    startWidthPx: node.getBoundingClientRect().width,
    startX: point.x,
    startY: point.y
  };
}

function addInteractionListeners(
  event: MouseEvent | TouchEvent,
  onMove: (event: MouseEvent | TouchEvent) => void,
  onEnd: () => void
): void {
  if (event instanceof MouseEvent) {
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    return;
  }
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd);
}

function removeInteractionListeners(
  onMove: (event: MouseEvent | TouchEvent) => void,
  onEnd: () => void
): void {
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onEnd);
  window.removeEventListener('touchmove', onMove);
  window.removeEventListener('touchend', onEnd);
}

function eventPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if (event instanceof MouseEvent) return { x: event.clientX, y: event.clientY };
  const touch = event.touches[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

function pixelWidthPerGridUnit(state: InteractionState): number {
  return state.startWidthPx / state.startLayout.width;
}

function setIfChanged(
  element: DashboardElement,
  next: ComponentLayout,
  options: CanvasInteractionOptions
): void {
  const current = options.getLayout(element);
  if (current.height === next.height && current.width === next.width && current.x === next.x && current.y === next.y) return;
  options.setLayout(element, next);
}

function shouldIgnoreMoveTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (target.closest('[data-dashboard-drag-handle="true"]')) return false;
  return Boolean(target.closest(
    'a, button, input, select, textarea, [role="button"], [role="menuitem"], .card-wrapper-actions, .resize-handle, .vue-resizable-handle'
  ));
}

function setBodyDragging(isDragging: boolean): void {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('dashboard-canvas-is-dragging', isDragging);
}
