import { ref, watch, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { readRouteString } from './page-helpers';
import type { DataSourceSummary } from './types';

interface AnalyzerRoutePromptOptions {
  canSubmit: Ref<boolean>;
  dataSources: Ref<DataSourceSummary[]>;
  isAsking: Ref<boolean>;
  isLoading: Ref<boolean>;
  question: Ref<string>;
  route: RouteLocationNormalizedLoaded;
  selectedDataSourceId: Ref<string>;
  submitQuestion: () => Promise<void>;
}

export function useAnalyzerRoutePrompt(options: AnalyzerRoutePromptOptions): {
  submitRoutePromptIfRequested: () => Promise<void>;
} {
  const autoSubmittedRouteKey = ref('');
  const pendingAutoSubmit = ref(false);
  const pendingDataSourceId = ref('');
  const pendingPrompt = ref('');

  watch(
    () => [
      options.route.query.prompt,
      options.route.query.autoSubmit,
      options.route.query.dataSourceId
    ],
    () => {
      const prompt = readRouteString(options.route.query.prompt);
      if (prompt) {
        pendingAutoSubmit.value = readRouteString(options.route.query.autoSubmit) === 'true';
        pendingDataSourceId.value = readRouteString(options.route.query.dataSourceId);
        pendingPrompt.value = prompt;
        options.question.value = prompt;
      }
    },
    { immediate: true }
  );
  watch(
    () => [
      options.route.query.prompt,
      options.route.query.autoSubmit,
      options.route.query.dataSourceId,
      options.canSubmit.value,
      options.selectedDataSourceId.value,
      options.isLoading.value
    ],
    () => { void submitRoutePromptIfRequested(); }
  );

  async function submitRoutePromptIfRequested(): Promise<void> {
    const prompt = pendingPrompt.value || readRouteString(options.route.query.prompt);
    const autoSubmit = pendingAutoSubmit.value
      || readRouteString(options.route.query.autoSubmit) === 'true';
    if (!prompt || !autoSubmit
      || !options.canSubmit.value || options.isLoading.value || options.isAsking.value) return;
    const dataSourceId = pendingDataSourceId.value
      || readRouteString(options.route.query.dataSourceId);
    if (dataSourceId && options.dataSources.value.some(source => source.id === dataSourceId)) {
      options.selectedDataSourceId.value = dataSourceId;
    }
    if (!options.selectedDataSourceId.value) return;
    const key = `${prompt}::${options.selectedDataSourceId.value}`;
    if (autoSubmittedRouteKey.value === key) return;
    autoSubmittedRouteKey.value = key;
    pendingAutoSubmit.value = false;
    pendingDataSourceId.value = '';
    pendingPrompt.value = '';
    options.question.value = prompt;
    await options.submitQuestion();
  }

  return { submitRoutePromptIfRequested };
}
