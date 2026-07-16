import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef
} from 'vue';
import {
  dashboardAiSummaryFilterState,
  fetchDashboardAiSummary
} from '../dashboard-ai-summary-api';
import { collectDashboardAiSummaryEvidence } from '../dashboard-ai-summary-evidence';
import type {
  DashboardElement,
  DashboardFilter,
  DashboardSettings
} from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import { stableStringify } from '../visualization/data-utils';

export function useDashboardAiSummary(options: {
  dashboardElements: ComputedRef<DashboardElement[]>;
  dashboardSettings: ComputedRef<DashboardSettings | undefined>;
  element: ComputedRef<DashboardElement>;
  enabled: ComputedRef<boolean>;
  filters: ComputedRef<DashboardFilter[]>;
  visualizationRequest: ComputedRef<VisualizationDataRequestContext | undefined>;
}) {
  const generatedText = ref('');
  const isGenerating = ref(false);
  let controller: AbortController | null = null;
  let sequence = 0;

  const requestKey = computed(() => stableStringify({
    dashboardId: options.element.value.dashboardId,
    elementId: options.element.value.id,
    enabled: isAiSummaryEnabled(options.element.value, options.enabled.value),
    filters: options.filters.value.map(dashboardAiSummaryFilterState),
    prompt: options.element.value.config?.generationPrompt,
    runtimeParameterValues: options.visualizationRequest.value?.runtimeParameterValues ?? null
  }));

  watch(requestKey, () => {
    generatedText.value = '';
    controller?.abort();
    controller = null;
    if (!isAiSummaryEnabled(options.element.value, options.enabled.value)) {
      isGenerating.value = false;
      return;
    }
    void loadSummary();
  }, { immediate: true });

  onBeforeUnmount(() => controller?.abort());

  async function loadSummary(): Promise<void> {
    const currentSequence = ++sequence;
    const currentController = new AbortController();
    controller = currentController;
    isGenerating.value = true;
    const element = options.element.value;
    const baseRequest = {
      dashboardId: element.dashboardId,
      elementId: element.id,
      filters: options.filters.value,
      runtimeParameterValues: options.visualizationRequest.value?.runtimeParameterValues,
      signal: currentController.signal
    };
    try {
      let result = await fetchDashboardAiSummary(baseRequest);
      if (result.evidenceRequired) {
        const evidence = await collectDashboardAiSummaryEvidence({
          dashboardElements: options.dashboardElements.value,
          dashboardSettings: options.dashboardSettings.value,
          filters: options.filters.value,
          requestContext: options.visualizationRequest.value,
          signal: currentController.signal,
          summaryElement: element
        });
        if (evidence.length === 0) return;
        result = await fetchDashboardAiSummary({ ...baseRequest, evidence });
      }
      if (currentSequence === sequence && result.text?.trim()) {
        generatedText.value = result.text.trim();
      }
    } catch (error) {
      if (!isAbortError(error)) generatedText.value = '';
    } finally {
      if (currentSequence === sequence) {
        isGenerating.value = false;
        if (controller === currentController) controller = null;
      }
    }
  }

  return {
    generatedText,
    isGenerating
  };
}

function isAiSummaryEnabled(element: DashboardElement, enabled: boolean): boolean {
  return enabled
    && element.type === 'text'
    && element.config?.aiGenerated === true
    && typeof element.config?.generationPrompt === 'string'
    && element.config.generationPrompt.trim().length > 0;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
