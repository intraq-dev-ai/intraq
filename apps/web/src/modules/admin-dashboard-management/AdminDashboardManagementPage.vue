<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  cloneAdminDashboard,
  deleteAdminDashboard,
  fetchAdminDashboards,
  updateAdminDashboard,
  updateAdminDashboardVisibility
} from './api';
import AdminDashboardManagementDialogs from './AdminDashboardManagementDialogs.vue';
import AdminDashboardManagementTable from './AdminDashboardManagementTable.vue';
import {
  buildDashboardStats,
  canManageDashboardVisibility,
  categorySummary,
  filterDashboards,
  sortDashboards
} from './helpers';
import type {
  AdminDashboard,
  DashboardDialogName,
  DashboardEditForm,
  DashboardFilterState,
  DashboardSortDirection,
  DashboardSortField,
  DashboardVisibilitySettings
} from './types';
import '../admin/admin-base-product.css';
import './admin-dashboard-management.css';

const dashboards = ref<AdminDashboard[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const status = ref('Loading dashboards');
const error = ref('');
const searchQuery = ref('');
const selectedCategory = ref('');
const selectedType = ref('');
const selectedStatus = ref('');
const sortField = ref<DashboardSortField>('updatedAt');
const sortDirection = ref<DashboardSortDirection>('desc');
const currentPage = ref(1);
const itemsPerPage = 20;
const activeDialog = ref<DashboardDialogName>('');
const selectedDashboard = ref<AdminDashboard | null>(null);
const cloneName = ref('');
const editForm = ref<DashboardEditForm>(emptyEditForm());
const visibilitySettings = ref<DashboardVisibilitySettings>({
  isGloballyVisible: true
});

const categories = computed(() => [...new Set(dashboards.value.map(dashboard => dashboard.category))].sort());
const stats = computed(() => buildDashboardStats(dashboards.value));
const metricCards = computed(() => [
  { id: 'total', label: 'Total Dashboards', value: stats.value.totalDashboards.toLocaleString() },
  { id: 'views', label: 'Total Views', value: stats.value.totalViews.toLocaleString() },
  { id: 'shared', label: 'Shared Dashboards', value: stats.value.sharedDashboards.toLocaleString() },
  { id: 'active', label: 'Active This Week', value: stats.value.activeThisWeek.toLocaleString() }
]);
const categorySummaries = computed(() => categorySummary(filteredDashboards.value));
const filters = computed<DashboardFilterState>(() => ({
  category: selectedCategory.value,
  searchQuery: searchQuery.value,
  status: selectedStatus.value,
  type: selectedType.value
}));
const filteredDashboards = computed(() => sortDashboards(filterDashboards(dashboards.value, filters.value), sortField.value, sortDirection.value));
const totalPages = computed(() => Math.max(1, Math.ceil(filteredDashboards.value.length / itemsPerPage)));
const paginatedDashboards = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredDashboards.value.slice(start, start + itemsPerPage);
});
const canSubmitEdit = computed(() => editForm.value.name.trim().length > 0 && editForm.value.category.trim().length > 0);
const canSubmitClone = computed(() => cloneName.value.trim().length > 0);

watch([searchQuery, selectedCategory, selectedType, selectedStatus], () => {
  currentPage.value = 1;
});

watch(totalPages, pages => {
  if (currentPage.value > pages) currentPage.value = pages;
});

void loadDashboards();

async function loadDashboards(): Promise<void> {
  isLoading.value = true;
  error.value = '';
  status.value = 'Loading dashboards';
  try {
    dashboards.value = await fetchAdminDashboards();
    status.value = `${dashboards.value.length} ${pluralize('dashboard', dashboards.value.length)} loaded`;
  } catch (caught) {
    dashboards.value = [];
    error.value = caught instanceof Error && caught.message ? caught.message : 'Dashboards failed to load.';
    status.value = 'Dashboards failed to load';
  } finally {
    isLoading.value = false;
  }
}

function changeSort(field: DashboardSortField): void {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortField.value = field;
  sortDirection.value = 'asc';
}

function openDashboardDialog(dialog: Exclude<DashboardDialogName, ''>, dashboard: AdminDashboard): void {
  if (dialog === 'visibility' && !canManageDashboardVisibility(dashboard)) {
    error.value = `Visibility can only be managed for sample dashboards like the active product.`;
    status.value = 'Dashboard visibility action blocked';
    return;
  }
  selectedDashboard.value = dashboard;
  if (dialog === 'edit') {
    editForm.value = {
      category: dashboard.category,
      description: dashboard.description,
      name: dashboard.name,
      status: dashboard.status === 'draft' ? 'draft' : 'active'
    };
  }
  if (dialog === 'clone') cloneName.value = `${dashboard.name} Copy`;
  if (dialog === 'visibility') {
    visibilitySettings.value = {
      isGloballyVisible: dashboard.isGloballyVisible
    };
  }
  activeDialog.value = dialog;
}

function closeDialog(): void {
  activeDialog.value = '';
  selectedDashboard.value = null;
  cloneName.value = '';
  editForm.value = emptyEditForm();
}

async function submitEdit(): Promise<void> {
  const dashboard = selectedDashboard.value;
  if (!dashboard || !canSubmitEdit.value) return;
  await runSaving('Dashboard updated', async () => {
    const updated = await updateAdminDashboard(dashboard.id, editForm.value);
    replaceDashboard(updated);
    closeDialog();
  });
}

async function submitClone(): Promise<void> {
  const dashboard = selectedDashboard.value;
  if (!dashboard || !canSubmitClone.value) return;
  await runSaving('Dashboard cloned', async () => {
    const created = await cloneAdminDashboard(dashboard.id, cloneName.value.trim());
    dashboards.value = [created, ...dashboards.value];
    closeDialog();
  });
}

async function submitVisibility(): Promise<void> {
  const dashboard = selectedDashboard.value;
  if (!dashboard || !canManageDashboardVisibility(dashboard)) return;
  await runSaving('Dashboard visibility updated', async () => {
    await updateAdminDashboardVisibility(dashboard.id, visibilitySettings.value);
    dashboards.value = dashboards.value.map(item => item.id === dashboard.id
      ? {
          ...item,
          isGloballyVisible: visibilitySettings.value.isGloballyVisible,
          isShared: visibilitySettings.value.isGloballyVisible || item.isPublic
        }
      : item);
    closeDialog();
  });
}

async function submitDelete(): Promise<void> {
  const dashboard = selectedDashboard.value;
  if (!dashboard) return;
  await runSaving('Dashboard deleted', async () => {
    await deleteAdminDashboard(dashboard.id);
    dashboards.value = dashboards.value.filter(item => item.id !== dashboard.id);
    closeDialog();
  });
}

async function runSaving(successMessage: string, action: () => Promise<void>): Promise<void> {
  isSaving.value = true;
  error.value = '';
  try {
    await action();
    status.value = successMessage;
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : 'Dashboard action failed.';
    status.value = 'Dashboard action failed';
  } finally {
    isSaving.value = false;
  }
}

function replaceDashboard(updated: AdminDashboard): void {
  dashboards.value = dashboards.value.map(dashboard => dashboard.id === updated.id ? updated : dashboard);
}

function emptyEditForm(): DashboardEditForm {
  return { category: '', description: '', name: '', status: 'active' };
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
</script>

<template>
  <section class="admin-page admin-dashboard-management-page" aria-labelledby="dashboard-management-title">
    <header class="admin-dashboard-management-header">
      <div>
        <h1 id="dashboard-management-title" class="admin-page-title">Dashboard Management</h1>
        <p class="admin-page-subtitle">Manage your organization's data visualization dashboards</p>
      </div>
      <a class="admin-dashboard-management-create" href="/dashboard">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Go to Dashboard Builder
      </a>
    </header>

    <p class="sr-only" role="status" aria-label="Dashboard Management status" aria-live="polite">{{ status }}</p>
    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>

    <section class="admin-dashboard-management-stats" aria-label="Dashboard Management metrics">
      <article class="admin-dashboard-management-stat">
        <div class="stat-icon total" aria-hidden="true">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        </div>
        <div class="stat-content">
          <strong>{{ stats.totalDashboards.toLocaleString() }}</strong>
          <p>Total Dashboards</p>
        </div>
      </article>
      <article class="admin-dashboard-management-stat">
        <div class="stat-icon views" aria-hidden="true">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        </div>
        <div class="stat-content">
          <strong>{{ stats.totalViews.toLocaleString() }}</strong>
          <p>Total Views</p>
        </div>
      </article>
      <article class="admin-dashboard-management-stat">
        <div class="stat-icon shared" aria-hidden="true">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" /></svg>
        </div>
        <div class="stat-content">
          <strong>{{ stats.sharedDashboards.toLocaleString() }}</strong>
          <p>Shared Dashboards</p>
        </div>
      </article>
      <article class="admin-dashboard-management-stat">
        <div class="stat-icon active" aria-hidden="true">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <div class="stat-content">
          <strong>{{ stats.activeThisWeek.toLocaleString() }}</strong>
          <p>Active This Week</p>
        </div>
      </article>
    </section>

    <article class="admin-dashboard-management-panel">
      <section class="admin-dashboard-management-filters" aria-label="Dashboard filters">
        <label>
          <span class="sr-only">Search dashboards</span>
          <svg class="admin-dashboard-management-search-icon" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input v-model="searchQuery" type="search" placeholder="Search dashboards..." aria-label="Search dashboards" />
        </label>
        <select v-model="selectedCategory" aria-label="Filter dashboards by category">
          <option value="">All Categories</option>
          <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
        </select>
        <select v-model="selectedType" aria-label="Filter dashboards by type">
          <option value="">All Types</option>
          <option value="tenant">Tenant Dashboards</option>
          <option value="global">Global Templates</option>
          <option value="sample">Sample Dashboards</option>
        </select>
        <select v-model="selectedStatus" aria-label="Filter dashboards by status">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </section>

      <div v-if="isLoading" class="admin-dashboard-management-state">Loading dashboards.</div>
      <div v-else-if="filteredDashboards.length === 0" class="admin-dashboard-management-state">
        <strong>No dashboards found</strong>
        <a class="button" href="/dashboard/create">Create Your First Dashboard</a>
      </div>
      <section v-if="!isLoading && filteredDashboards.length > 0" class="admin-dashboard-management-category-summary" aria-label="Dashboard category summary">
        <article v-for="summary in categorySummaries" :key="summary.category">
          <strong>{{ summary.category }}</strong>
          <span>{{ summary.count }} {{ pluralize('dashboard', summary.count) }}</span>
          <span>{{ summary.visibleCount }} shared</span>
        </article>
      </section>

      <AdminDashboardManagementTable
        v-if="!isLoading && filteredDashboards.length > 0"
        :dashboards="paginatedDashboards"
        :is-saving="isSaving"
        :sort-direction="sortDirection"
        :sort-field="sortField"
        @open-dialog="openDashboardDialog"
        @sort="changeSort"
      />

      <nav v-if="totalPages > 1" class="admin-dashboard-management-pagination" aria-label="Dashboard pagination">
        <button type="button" :disabled="currentPage === 1" @click="currentPage = 1">First</button>
        <button type="button" :disabled="currentPage === 1" @click="currentPage -= 1">Previous</button>
        <span>Page {{ currentPage }} of {{ totalPages }} ({{ filteredDashboards.length }} dashboards)</span>
        <button type="button" :disabled="currentPage === totalPages" @click="currentPage += 1">Next</button>
        <button type="button" :disabled="currentPage === totalPages" @click="currentPage = totalPages">Last</button>
      </nav>
    </article>

    <AdminDashboardManagementDialogs
      v-model:clone-name="cloneName"
      v-model:edit-form="editForm"
      v-model:visibility-settings="visibilitySettings"
      :active-dialog="activeDialog"
      :can-submit-clone="canSubmitClone"
      :can-submit-edit="canSubmitEdit"
      :is-saving="isSaving"
      :selected-dashboard="selectedDashboard"
      @close="closeDialog"
      @submit-clone="submitClone"
      @submit-delete="submitDelete"
      @submit-edit="submitEdit"
      @submit-visibility="submitVisibility"
    />
  </section>
</template>
