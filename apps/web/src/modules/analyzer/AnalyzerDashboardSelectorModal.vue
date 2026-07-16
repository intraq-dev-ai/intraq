<script setup lang="ts">
import { ref, watch } from 'vue';
import type { AnalyzerDashboardSummary } from './dashboard-queue-api';

const props = withDefaults(defineProps<{
  dashboards?: AnalyzerDashboardSummary[];
  initialMode?: 'add' | 'create';
  itemCount: number;
  loading?: boolean;
  processing?: boolean;
  show: boolean;
}>(), {
  dashboards: () => [],
  initialMode: 'add',
  loading: false,
  processing: false
});

const emit = defineEmits<{
  close: [];
  create: [name: string, description: string];
  select: [dashboard: AnalyzerDashboardSummary];
}>();

const mode = ref<'add' | 'create'>('add');
const selectedDashboard = ref<AnalyzerDashboardSummary | null>(null);
const newDashboardName = ref('');
const newDashboardDescription = ref('');

watch(() => props.show, show => {
  if (!show) return;
  mode.value = props.initialMode;
  selectedDashboard.value = null;
  newDashboardName.value = '';
  newDashboardDescription.value = '';
});

function selectDashboard(dashboard: AnalyzerDashboardSummary): void {
  selectedDashboard.value = dashboard;
}

function addToDashboard(): void {
  if (selectedDashboard.value && !props.processing) emit('select', selectedDashboard.value);
}

function createDashboard(): void {
  const name = newDashboardName.value.trim();
  if (name && !props.processing) emit('create', name, newDashboardDescription.value.trim());
}

function dashboardElementCount(dashboard: AnalyzerDashboardSummary): number {
  return dashboard.elements?.length ?? dashboard.layout?.length ?? 0;
}

function formatDate(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="analyzer-dashboard-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analyzer-dashboard-selector-title"
      tabindex="-1"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
      @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()"
    >
      <div class="analyzer-dashboard-modal-backdrop" aria-hidden="true" @click="emit('close')"></div>
      <section class="analyzer-dashboard-modal">
        <header class="analyzer-dashboard-modal-header">
          <div>
            <h3 id="analyzer-dashboard-selector-title">Select Dashboard</h3>
            <p>{{ mode === 'add' ? `Add ${itemCount} item(s) to an existing dashboard` : `Create new dashboard with ${itemCount} item(s)` }}</p>
          </div>
          <button type="button" aria-label="Close dashboard selector" @click="emit('close')">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div class="analyzer-dashboard-modal-content">
          <div v-if="mode === 'add'" class="analyzer-dashboard-modal-list">
            <div v-if="loading" class="analyzer-dashboard-modal-state" role="status">
              <span aria-hidden="true"></span>
              <p>Loading dashboards...</p>
            </div>

            <div v-else-if="dashboards.length === 0" class="analyzer-dashboard-modal-state">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7m16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5m16 0h-3l-2 2h-4l-2-2H4" />
              </svg>
              <p>No dashboards found</p>
              <button type="button" @click="mode = 'create'">Create New Dashboard Instead</button>
            </div>

            <template v-else>
              <button
                v-for="dashboard in dashboards"
                :key="dashboard.id"
                type="button"
                class="analyzer-dashboard-choice"
                :aria-pressed="selectedDashboard?.id === dashboard.id"
                @click="selectDashboard(dashboard)"
              >
                <span>
                  <strong>{{ dashboard.name || 'Untitled Dashboard' }}</strong>
                  <small>
                    {{ dashboardElementCount(dashboard) }} component(s)
                    <template v-if="formatDate(dashboard.updatedAt)"> - Updated {{ formatDate(dashboard.updatedAt) }}</template>
                  </small>
                </span>
                <svg
                  v-if="selectedDashboard?.id === dashboard.id"
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z" clip-rule="evenodd" />
                </svg>
              </button>
            </template>
          </div>

          <div v-else class="analyzer-dashboard-modal-form">
            <label>
              <span>Dashboard Name</span>
              <input
                v-model="newDashboardName"
                type="text"
                placeholder="Enter dashboard name..."
                @keyup.enter="createDashboard"
              />
            </label>
            <label>
              <span>Description (optional)</span>
              <textarea v-model="newDashboardDescription" placeholder="Enter description..." rows="3"></textarea>
            </label>
          </div>
        </div>

        <footer class="analyzer-dashboard-modal-footer">
          <button v-if="mode === 'add' && dashboards.length > 0" type="button" class="analyzer-dashboard-modal-link" @click="mode = 'create'">
            Create New Instead
          </button>
          <span v-else></span>
          <div>
            <button type="button" class="analyzer-dashboard-modal-secondary" @click="emit('close')">Cancel</button>
            <button
              v-if="mode === 'add'"
              type="button"
              class="analyzer-dashboard-modal-primary"
              :disabled="!selectedDashboard || processing"
              @click="addToDashboard"
            >
              {{ processing ? 'Adding...' : 'Add to Dashboard' }}
            </button>
            <button
              v-else
              type="button"
              class="analyzer-dashboard-modal-primary"
              :disabled="!newDashboardName.trim() || processing"
              @click="createDashboard"
            >
              {{ processing ? 'Creating...' : 'Create Dashboard' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
