import { computed, onUnmounted, ref } from 'vue';
import { loadSqlEditorSplitState, saveSqlEditorSplitState } from './storage';

export function useSqlEditorSplitResize() {
  const splitContainer = ref<HTMLElement | null>(null);
  const isResizing = ref(false);
  const queryPanelHeight = ref(loadSqlEditorSplitState()?.queryPanelHeight ?? 420);
  const queryPanelStyle = computed(() => ({ flex: `0 0 ${queryPanelHeight.value}px` }));
  const resultPanelStyle = computed(() => ({ flex: '1 1 0' }));

  function startResize(event: MouseEvent): void {
    isResizing.value = true;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    event.preventDefault();
  }

  function handleResize(event: MouseEvent): void {
    if (!isResizing.value || !splitContainer.value) return;
    const rect = splitContainer.value.getBoundingClientRect();
    queryPanelHeight.value = Math.max(180, Math.min(rect.height - 180, event.clientY - rect.top));
  }

  function stopResize(): void {
    if (isResizing.value) saveSqlEditorSplitState({ queryPanelHeight: queryPanelHeight.value });
    isResizing.value = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }

  function resizeByKeyboard(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    queryPanelHeight.value = Math.max(180, queryPanelHeight.value + (event.key === 'ArrowDown' ? 24 : -24));
    saveSqlEditorSplitState({ queryPanelHeight: queryPanelHeight.value });
    event.preventDefault();
  }

  onUnmounted(stopResize);
  return { queryPanelStyle, resizeByKeyboard, resultPanelStyle, splitContainer, startResize };
}
