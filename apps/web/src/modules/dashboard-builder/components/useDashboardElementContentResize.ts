import { onBeforeUnmount, onMounted, watch, type ComputedRef, type Ref } from 'vue';
import type { DashboardMatrixModel, DashboardTableModel } from '../visualization/element-view-model';
import type { DashboardElementRenderKind } from '../visualization/view-model-types';
import type { DashboardElementRendererState } from './dashboard-element-renderer-model';

export function useDashboardElementContentResize(options: {
  matrixModel: ComputedRef<DashboardMatrixModel>;
  onResize: (height: number) => void;
  renderKind: ComputedRef<DashboardElementRenderKind>;
  rendererState: Ref<DashboardElementRendererState>;
  rootRef: Ref<HTMLElement | null>;
  tableModel: ComputedRef<DashboardTableModel>;
}): void {
  let contentResizeObserver: ResizeObserver | null = null;
  let contentMutationObserver: MutationObserver | null = null;
  let pendingContentResizeFrame = 0;
  let lastReportedContentHeight = 0;

  onMounted(() => {
    startContentResizeObserver();
  });

  onBeforeUnmount(() => {
    contentResizeObserver?.disconnect();
    contentResizeObserver = null;
    contentMutationObserver?.disconnect();
    contentMutationObserver = null;
    if (pendingContentResizeFrame) {
      window.cancelAnimationFrame(pendingContentResizeFrame);
      pendingContentResizeFrame = 0;
    }
  });

  watch([options.renderKind, options.tableModel, options.matrixModel, options.rendererState], () => {
    scheduleContentResizeReport();
  }, { deep: true });

  function startContentResizeObserver(): void {
    const target = options.rootRef.value;
    if (!target) return;
    contentMutationObserver?.disconnect();
    contentMutationObserver = new MutationObserver(() => scheduleContentResizeReport());
    contentMutationObserver.observe(target, {
      attributes: true,
      childList: true,
      subtree: true
    });
    if (typeof ResizeObserver !== 'undefined') {
      contentResizeObserver?.disconnect();
      contentResizeObserver = new ResizeObserver(() => scheduleContentResizeReport());
      contentResizeObserver.observe(target);
    }
    scheduleContentResizeReport();
  }

  function scheduleContentResizeReport(): void {
    if (options.renderKind.value !== 'table' && options.renderKind.value !== 'matrix') return;
    if (pendingContentResizeFrame) return;
    pendingContentResizeFrame = window.requestAnimationFrame(() => {
      pendingContentResizeFrame = 0;
      const target = options.rootRef.value;
      if (!target) return;
      const height = Math.ceil(Math.max(target.scrollHeight, target.getBoundingClientRect().height));
      if (!Number.isFinite(height) || height <= 0 || height === lastReportedContentHeight) return;
      lastReportedContentHeight = height;
      options.onResize(height);
    });
  }
}
