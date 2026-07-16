import { inject, provide } from 'vue';
import type { UnwrapNestedRefs } from 'vue';
import type { useManualSidebarController } from './useManualSidebarController';

export type ManualSidebarContext = UnwrapNestedRefs<ReturnType<typeof useManualSidebarController>>;

const manualSidebarContextKey = Symbol('manual-sidebar-context');

export function provideManualSidebarContext(context: ManualSidebarContext): void {
  provide(manualSidebarContextKey, context);
}

export function useManualSidebarContext(): ManualSidebarContext {
  const context = inject<ManualSidebarContext>(manualSidebarContextKey);
  if (!context) throw new Error('Manual sidebar context was not provided.');
  return context;
}
