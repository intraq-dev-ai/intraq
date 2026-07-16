<template>
  <footer class="dashboard-mobile-actions" aria-label="Dashboard mobile edit actions">
    <button
      v-if="showAnalyzer !== false"
      class="mobile-action-btn"
      @click="$emit('analyzer')"
      title="AI Analyzer"
      type="button"
      aria-label="Open AI Analyzer"
    >
      <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>AI</span>
    </button>

    <button
      class="mobile-action-btn"
      @click="$emit('export')"
      title="Export Dashboard"
      type="button"
      aria-label="Export dashboard"
    >
      <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      <span>Export</span>
    </button>

    <button
      v-if="showFilters"
      class="mobile-action-btn"
      @click="$emit('filters')"
      title="Dashboard Filters"
      type="button"
      aria-label="Open dashboard filters"
    >
      <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16l-6.5 7.5V19l-3 1.75v-7.25L4 6z" />
      </svg>
      <span>Filters</span>
    </button>

    <button
      class="mobile-action-btn"
      @click="$emit('email')"
      title="Email Report"
      type="button"
      aria-label="Send email report"
    >
      <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <span>Email</span>
    </button>

    <button
      class="mobile-action-btn"
      @click="$emit('info')"
      title="Dashboard Info"
      type="button"
      aria-label="Dashboard information"
    >
      <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Info</span>
    </button>
  </footer>
</template>

<script setup lang="ts">
defineProps<{
  showAnalyzer?: boolean;
  showFilters?: boolean;
}>();

defineEmits<{
  analyzer: [];
  export: [];
  email: [];
  filters: [];
  info: [];
}>();
</script>

<style scoped>
.dashboard-mobile-actions {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
  padding: 8px;
  gap: 8px;
  flex-direction: row;
  z-index: 50;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
}

@media (max-width: 768px) {
  .dashboard-mobile-actions {
    display: flex;
  }
}

.mobile-action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.mobile-action-btn:hover,
.mobile-action-btn:active {
  background: var(--bg-secondary);
  border-color: var(--border);
}

.action-icon {
  width: 20px;
  height: 20px;
  stroke-width: 2;
  color: var(--text-primary);
}
</style>
