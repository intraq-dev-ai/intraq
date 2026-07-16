<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { FilterDraft } from '../../agent-context/planner-filters';
import type {
  BuilderDataSource,
  Dashboard,
  DashboardFilter,
  DashboardFilterCreatePatch,
  DashboardFilterPatch
} from '../../types';
import type { VisualizationDataRequestContext } from '../../visualization/data';
import DashboardFilterBar from '../DashboardFilterBar.vue';

defineProps<{
  canEditDashboard: boolean;
  dashboard: Dashboard;
  dataSources: BuilderDataSource[];
  filterDraft: FilterDraft;
  filters: DashboardFilter[];
  selectedDataSourceId: string;
  selectedTableId: string;
  visualizationRequest?: VisualizationDataRequestContext;
}>();

const emit = defineEmits<{
  close: [];
  create: [patch: DashboardFilterCreatePatch];
  remove: [filterId: string];
  update: [filterId: string, patch: DashboardFilterPatch];
}>();

const mobileFilterDialogEl = ref<HTMLElement | null>(null);

onMounted(() => {
  mobileFilterDialogEl.value?.focus();
});
</script>

<template>
  <div class="dashboard-mobile-filter-overlay" @click="emit('close')">
    <section
      ref="mobileFilterDialogEl"
      class="dashboard-mobile-filter-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard filters"
      tabindex="-1"
      @click.stop
      @keydown.esc="emit('close')"
    >
      <div class="dashboard-mobile-filter-panel-header">
        <h2>Dashboard Filters</h2>
        <button type="button" class="dashboard-mobile-filter-close" @click="emit('close')">Close</button>
      </div>
      <DashboardFilterBar
        :can-edit-dashboard="canEditDashboard"
        :create-draft="filterDraft"
        :create-request-key="0"
        :dashboard-elements="dashboard.elements"
        :data-sources="dataSources"
        :filters="filters"
        :selected-data-source-id="selectedDataSourceId"
        :selected-table-id="selectedTableId"
        :visualization-request="visualizationRequest"
        @create="emit('create', $event)"
        @update="(filterId, patch) => emit('update', filterId, patch)"
        @remove="emit('remove', $event)"
      />
    </section>
  </div>
</template>

<style scoped>
.dashboard-mobile-filter-overlay {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
}

.dashboard-mobile-filter-panel {
  display: grid;
  gap: 14px;
  width: 100%;
  max-height: min(82vh, 720px);
  overflow: auto;
  padding: 18px 16px 24px;
  border-radius: 18px 18px 0 0;
  background: var(--surface);
  box-shadow: 0 -12px 36px rgba(15, 23, 42, 0.18);
}

.dashboard-mobile-filter-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dashboard-mobile-filter-panel-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}

.dashboard-mobile-filter-close {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  padding: 0.45rem 0.8rem;
}

@media (min-width: 761px) {
  .dashboard-mobile-filter-overlay {
    display: none;
  }
}
</style>
