<script setup lang="ts">
import type { AnalyzerDashboardQueueItem } from './dashboard-queue';

const props = defineProps<{
  items: AnalyzerDashboardQueueItem[];
}>();

const emit = defineEmits<{
  addExisting: [];
  clear: [];
  close: [];
  createDashboard: [];
  remove: [id: string];
}>();

function clearQueue(): void {
  if (window.confirm(`Clear all ${props.items.length} items from queue?`)) emit('clear');
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function typeLabel(item: AnalyzerDashboardQueueItem): string {
  if (item.type === 'table') return 'Table';
  if (item.type === 'matrix') return 'Matrix';
  return `${capitalize(item.type)} Chart`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="analyzer-queue-overlay"
      @click.self="emit('close')"
    >
      <div class="analyzer-queue-backdrop" aria-hidden="true" @click="emit('close')"></div>
      <aside
        id="analyzer-dashboard-queue-panel"
        class="analyzer-queue-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analyzer-dashboard-queue-title"
        tabindex="-1"
        @keydown.esc="emit('close')"
        @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()"
      >
        <header class="analyzer-queue-panel-header">
          <div>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" />
            </svg>
            <h3 id="analyzer-dashboard-queue-title">Dashboard Queue</h3>
            <span>{{ items.length }}</span>
          </div>
          <button type="button" aria-label="Close dashboard queue" @click="emit('close')">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div v-if="items.length === 0" class="analyzer-queue-empty">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m20 7-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p>Queue is empty</p>
          <span>Add visualizations from AI Analyzer to save them for your dashboards</span>
        </div>

        <ol v-else class="analyzer-queue-list">
          <li v-for="item in items" :key="item.id" class="analyzer-queue-item">
            <div class="analyzer-queue-item-main">
              <div>
                <span class="analyzer-queue-item-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 19V5m0 14h16M8 17V9m4 8V7m4 10v-5" />
                  </svg>
                </span>
                <h4>{{ item.title }}</h4>
              </div>
              <p>{{ typeLabel(item) }} - {{ formatTime(item.createdAt) }}</p>
              <small v-if="item.execution.rowCount">{{ item.execution.rowCount }} rows</small>
            </div>
            <button
              type="button"
              :aria-label="`Remove ${item.title} from dashboard queue`"
              @click="emit('remove', item.id)"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19 7-.9 12.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
              </svg>
            </button>
          </li>
        </ol>

        <footer v-if="items.length > 0" class="analyzer-queue-footer">
          <button type="button" class="analyzer-queue-primary" @click="emit('addExisting')">Add to Existing Dashboard</button>
          <button type="button" class="analyzer-queue-secondary" @click="emit('createDashboard')">Create New Dashboard</button>
          <button type="button" class="analyzer-queue-danger" @click="clearQueue">Clear Queue</button>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>
