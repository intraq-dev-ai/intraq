import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ComponentRunState, DashboardCanvasProps, SettingsMenuPosition } from './dashboard-canvas-types';

const SETTINGS_MENU_EDGE_PADDING = 8;
const SETTINGS_MENU_GAP = 6;
const FALLBACK_SETTINGS_MENU_WIDTH = 188;

export function useDashboardCanvasRunState(props: DashboardCanvasProps) {
  const runStates = ref<Record<string, ComponentRunState>>({});
  const settingsButtonRefs = ref<Record<string, HTMLElement>>({});
  const settingsMenuPositions = ref<Record<string, SettingsMenuPosition>>({});
  const settingsMenuRefs = ref<Record<string, HTMLElement>>({});

  function syncRunStates(): void {
    const next: Record<string, ComponentRunState> = {};
    for (const element of props.dashboard.elements) {
      next[element.id] = runStates.value[element.id] ?? defaultRunState();
    }
    runStates.value = next;
  }

  function runState(elementId: string): ComponentRunState {
    return runStates.value[elementId] ?? defaultRunState();
  }

  function patchRunState(elementId: string, patch: Partial<ComponentRunState>): void {
    runStates.value = {
      ...runStates.value,
      [elementId]: { ...runState(elementId), ...patch }
    };
  }

  function setSettingsButtonRef(elementId: string, element: unknown): void {
    if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
      settingsButtonRefs.value[elementId] = element;
      return;
    }
    delete settingsButtonRefs.value[elementId];
  }

  function setSettingsMenuRef(elementId: string, element: unknown): void {
    if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
      settingsMenuRefs.value[elementId] = element;
      return;
    }
    delete settingsMenuRefs.value[elementId];
  }

  function settingsMenuStyle(elementId: string): Record<string, string> {
    const position = settingsMenuPositions.value[elementId] ?? { left: 0, top: 0 };
    return {
      left: `${position.left}px`,
      position: 'fixed',
      right: 'auto',
      top: `${position.top}px`
    };
  }

  function toggleRun(elementId: string): void {
    const state = runState(elementId);
    if (state.isLoading) {
      patchRunState(elementId, { cancelToken: state.cancelToken + 1, isLoading: false });
      return;
    }
    patchRunState(elementId, { isLoading: true, menuOpen: false, runToken: state.runToken + 1 });
  }

  async function toggleSettings(elementId: string): Promise<void> {
    const nextOpen = !runState(elementId).menuOpen;
    runStates.value = Object.fromEntries(
      Object.entries(runStates.value).map(([id, state]) => [id, { ...state, menuOpen: id === elementId ? nextOpen : false }])
    );
    if (!nextOpen) return;
    updateSettingsMenuPosition(elementId);
    await nextTick();
    updateSettingsMenuPosition(elementId);
  }

  function updateOpenSettingsMenuPosition(): void {
    const openElementId = Object.entries(runStates.value).find(([, state]) => state.menuOpen)?.[0];
    if (!openElementId) return;
    updateSettingsMenuPosition(openElementId);
  }

  function updateSettingsMenuPosition(elementId: string): void {
    if (typeof window === 'undefined') return;
    const button = settingsButtonRefs.value[elementId];
    if (!button) return;
    const buttonRect = button.getBoundingClientRect();
    const menu = settingsMenuRefs.value[elementId];
    const menuWidth = menu?.offsetWidth ?? FALLBACK_SETTINGS_MENU_WIDTH;
    const menuHeight = menu?.offsetHeight ?? 0;
    const maxLeft = window.innerWidth - menuWidth - SETTINGS_MENU_EDGE_PADDING;
    const left = Math.max(SETTINGS_MENU_EDGE_PADDING, Math.min(buttonRect.right - menuWidth, maxLeft));
    const belowTop = buttonRect.bottom + SETTINGS_MENU_GAP;
    const top = menuHeight > 0 && belowTop + menuHeight > window.innerHeight - SETTINGS_MENU_EDGE_PADDING
      ? Math.max(SETTINGS_MENU_EDGE_PADDING, buttonRect.top - menuHeight - SETTINGS_MENU_GAP)
      : belowTop;
    settingsMenuPositions.value = { ...settingsMenuPositions.value, [elementId]: { left, top } };
  }

  function closeSettingsMenu(elementId: string): void {
    if (runState(elementId).menuOpen) patchRunState(elementId, { menuOpen: false });
  }

  watch(() => props.dashboard.elements.map(element => element.id).join('|'), syncRunStates, { immediate: true });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateOpenSettingsMenuPosition);
    window.addEventListener('scroll', updateOpenSettingsMenuPosition, true);
  }

  onBeforeUnmount(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('resize', updateOpenSettingsMenuPosition);
    window.removeEventListener('scroll', updateOpenSettingsMenuPosition, true);
  });

  return {
    closeSettingsMenu,
    patchRunState,
    runState,
    runStates,
    setSettingsButtonRef,
    setSettingsMenuRef,
    settingsMenuStyle,
    toggleRun,
    toggleSettings
  };
}

function defaultRunState(): ComponentRunState {
  return { cancelToken: 0, hasRun: false, isLoading: false, menuOpen: false, runToken: 0 };
}
