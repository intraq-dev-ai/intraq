<script setup lang="ts">
import type { DashboardRuntimeCrossFilter } from './canvas/dashboard-cross-filters';

defineProps<{
  filters: DashboardRuntimeCrossFilter[];
}>();

const emit = defineEmits<{
  clear: [];
  remove: [filterId: string];
}>();
</script>

<template>
  <div
    v-if="filters.length > 0"
    class="dashboard-runtime-cross-filter-bar"
    role="region"
    aria-label="Chart cross-filters"
  >
    <div class="dashboard-runtime-cross-filter-copy">
      <strong>Chart filters</strong>
      <span>{{ filters.length }} active</span>
    </div>
    <div class="dashboard-runtime-cross-filter-list">
      <button
        v-for="filter in filters"
        :key="filter.filter.id"
        type="button"
        class="dashboard-runtime-cross-filter-chip"
        :aria-label="`Clear cross-filter ${filter.filter.name}`"
        :title="filter.filter.name"
        @click="emit('remove', filter.filter.id)"
      >
        <span>{{ filter.filter.name }}</span>
        <span aria-hidden="true">×</span>
      </button>
    </div>
    <button
      type="button"
      class="dashboard-runtime-cross-filter-clear"
      aria-label="Clear all chart cross-filters"
      @click="emit('clear')"
    >
      Clear all
    </button>
  </div>
</template>

<style scoped>
.dashboard-runtime-cross-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 8px 12px 6px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 88%, var(--bg-secondary));
}

.dashboard-runtime-cross-filter-copy {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--text-primary);
}

.dashboard-runtime-cross-filter-list {
  display: flex;
  flex: 1 1 320px;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-runtime-cross-filter-chip {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-height: 32px;
  padding: 0.375rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-primary);
  cursor: pointer;
}

.dashboard-runtime-cross-filter-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0.375rem 0.875rem;
  border: 1px solid color-mix(in srgb, var(--text-secondary) 45%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-secondary) 10%, var(--surface));
  color: var(--text-secondary);
  cursor: pointer;
}

@media (max-width: 760px) {
  .dashboard-runtime-cross-filter-bar,
  .dashboard-runtime-cross-filter-copy {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
