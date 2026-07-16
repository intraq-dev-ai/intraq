<script setup lang="ts">
import type { AdminDataSourceMetric } from '../types';

defineProps<{ metrics: AdminDataSourceMetric[]; title: string }>();
</script>

<template>
  <section class="admin-data-source-metrics" :aria-label="`${title} metrics`">
    <article v-for="metric in metrics" :key="metric.label" class="admin-data-source-metric">
      <p>{{ metric.label }}</p>
      <strong>{{ metric.value }}</strong>
      <span>{{ metric.detail }}</span>
    </article>
  </section>
</template>
