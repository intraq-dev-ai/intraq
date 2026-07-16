<script setup lang="ts">
import { computed } from 'vue';
import type {
  DashboardAnalyzerComponentOption,
  DashboardAnalyzerScope
} from './dashboard-analyzer-scope';

const props = defineProps<{
  components: DashboardAnalyzerComponentOption[];
  disabled?: boolean;
  scope: DashboardAnalyzerScope;
  selectedComponentId: string;
}>();

const emit = defineEmits<{
  selectContext: [scope: DashboardAnalyzerScope, componentId?: string];
}>();

const COMPONENT_VALUE_PREFIX = 'component:';

const selectedValue = computed(() => props.scope === 'component' && props.selectedComponentId
  ? `${COMPONENT_VALUE_PREFIX}${props.selectedComponentId}`
  : props.scope
);

function selectContext(event: Event): void {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
  if (value === 'dashboard' || value === 'related') {
    emit('selectContext', value);
    return;
  }
  if (value.startsWith(COMPONENT_VALUE_PREFIX)) {
    emit('selectContext', 'component', value.slice(COMPONENT_VALUE_PREFIX.length));
  }
}
</script>

<template>
  <section class="dashboard-analyzer-scope" aria-label="Question scope">
    <label class="dashboard-analyzer-component-select">
      <span>Ask about</span>
      <select
        :value="selectedValue"
        aria-label="Dashboard AI context"
        :disabled="disabled"
        @change="selectContext"
      >
        <option value="dashboard">All components</option>
        <optgroup v-if="components.length" label="One component">
          <option v-for="component in components" :key="component.id" :value="`${COMPONENT_VALUE_PREFIX}${component.id}`">
            {{ component.name }}
          </option>
        </optgroup>
        <option value="related">Related data</option>
      </select>
    </label>
  </section>
</template>
