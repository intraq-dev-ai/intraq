<script setup lang="ts">
import { computed } from 'vue';

import type { DashboardStatusTone } from '../../visualization/view-model-types';

const props = defineProps<{
  label?: string;
  tone?: DashboardStatusTone;
  value?: string;
}>();

const accessibleLabel = computed(() => [props.value, props.label].filter(Boolean).join(' '));
</script>

<template>
  <span
    class="dashboard-kpi-supporting"
    :class="`tone-${tone ?? 'default'}`"
    :aria-label="`Supporting metric: ${accessibleLabel}`"
    :title="accessibleLabel"
  >
    <strong v-if="value" class="dashboard-kpi-supporting-value">{{ value }}</strong>
    <span v-if="label" class="dashboard-kpi-supporting-label">{{ label }}</span>
  </span>
</template>
