<script setup lang="ts">
import { computed } from 'vue';
import type {
  DashboardElement,
  DashboardFilter,
  DashboardSettings
} from '../../types';
import type { VisualizationDataRequestContext } from '../../visualization/data';
import { useDashboardAiSummary } from '../useDashboardAiSummary';

const props = withDefaults(defineProps<{
  dashboardElements?: DashboardElement[];
  dashboardSettings?: DashboardSettings;
  element: DashboardElement;
  filters?: DashboardFilter[];
  generateAiContent?: boolean;
  visualizationRequest?: VisualizationDataRequestContext;
}>(), {
  dashboardElements: () => [],
  filters: () => [],
  generateAiContent: false
});

type TextTone = 'critical' | 'info' | 'neutral' | 'success' | 'warning';
type TextVariant = 'body' | 'insight' | 'section';

const fallbackContent = computed(() => readString(
  props.element.config?.text
    ?? props.element.config?.content
    ?? props.element.config?.description
) ?? '');
const { generatedText, isGenerating } = useDashboardAiSummary({
  dashboardElements: computed(() => props.dashboardElements),
  dashboardSettings: computed(() => props.dashboardSettings),
  element: computed(() => props.element),
  enabled: computed(() => props.generateAiContent && !props.visualizationRequest?.token),
  filters: computed(() => props.filters),
  visualizationRequest: computed(() => props.visualizationRequest)
});
const content = computed(() => generatedText.value || fallbackContent.value);
const contentSource = computed(() => generatedText.value
  ? 'dashboard-ai'
  : props.element.config?.aiGenerated === true ? 'saved-fallback' : 'saved');
const variant = computed<TextVariant>(() => {
  const value = readString(props.element.config?.textVariant ?? props.element.config?.variant)?.toLowerCase();
  return value === 'insight' || value === 'section' ? value : 'body';
});
const tone = computed<TextTone>(() => {
  const value = readString(props.element.config?.tone ?? props.element.config?.severity)?.toLowerCase();
  if (value === 'critical' || value === 'danger' || value === 'error') return 'critical';
  if (value === 'info' || value === 'success' || value === 'warning') return value;
  return 'neutral';
});
const badge = computed(() => readString(props.element.config?.badge ?? props.element.config?.statusLabel));
const showIcon = computed(() => variant.value === 'insight' && props.element.config?.showIcon !== false);
const showTitle = computed(() => props.element.config?.showTitle !== false);

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
</script>

<template>
  <section
    class="dashboard-text-renderer"
    :data-tone="tone"
    :data-variant="variant"
    :data-content-source="contentSource"
    :aria-busy="isGenerating"
    :aria-label="`${element.name} text`"
  >
    <span v-if="showIcon" class="dashboard-text-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.75 3h15.3a2 2 0 0 0 1.75-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      </svg>
    </span>
    <div class="dashboard-text-copy">
      <h3 v-if="showTitle">{{ element.name }}</h3>
      <p v-if="content" class="dashboard-text-content" aria-live="polite">{{ content }}</p>
    </div>
    <strong v-if="badge" class="dashboard-text-badge">{{ badge }}</strong>
  </section>
</template>
