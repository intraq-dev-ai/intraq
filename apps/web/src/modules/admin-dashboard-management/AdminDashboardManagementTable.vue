<script setup lang="ts">
import {
  canManageDashboardVisibility,
  creatorName,
  dashboardTypeLabel,
  formatDashboardDate,
  statusClass,
  statusLabel,
  visibilitySummary
} from './helpers';
import type { AdminDashboard, DashboardDialogName, DashboardSortDirection, DashboardSortField } from './types';
import './admin-dashboard-management-table.css';

defineProps<{
  dashboards: AdminDashboard[];
  isSaving: boolean;
  sortDirection: DashboardSortDirection;
  sortField: DashboardSortField;
}>();

const emit = defineEmits<{
  openDialog: [dialog: Exclude<DashboardDialogName, ''>, dashboard: AdminDashboard];
  sort: [field: DashboardSortField];
}>();

const columns: Array<{ field?: DashboardSortField; label: string }> = [
  { field: 'name', label: 'Dashboard' },
  { field: 'category', label: 'Category' },
  { label: 'Type' },
  { field: 'createdBy', label: 'Created By' },
  { field: 'status', label: 'Status' },
  { field: 'views', label: 'Views' },
  { field: 'charts', label: 'Charts' },
  { field: 'updatedAt', label: 'Last Updated' },
  { label: 'Visibility' },
  { label: 'Actions' }
];

function isSortActive(field: DashboardSortField, activeField: DashboardSortField): boolean {
  return field === activeField;
}

function isDescending(field: DashboardSortField, activeField: DashboardSortField, direction: DashboardSortDirection): boolean {
  return field === activeField && direction === 'desc';
}
</script>

<template>
  <div class="admin-table-wrap">
    <table aria-label="Dashboard Management dashboards" data-testid="admin-dashboard-management-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.label" scope="col">
            <button
              v-if="column.field"
              class="admin-dashboard-management-sort"
              type="button"
              :aria-label="`Sort dashboards by ${column.label}`"
              @click="emit('sort', column.field)"
            >
              {{ column.label }}
              <svg
                v-if="isSortActive(column.field, sortField)"
                aria-hidden="true"
                class="admin-dashboard-management-sort-icon"
                :class="{ 'is-desc': isDescending(column.field, sortField, sortDirection) }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <span v-else>{{ column.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="dashboard in dashboards" :key="dashboard.id" :data-testid="`admin-dashboard-row-${dashboard.id}`">
          <td>
            <strong>{{ dashboard.name }}</strong>
            <span v-if="dashboard.isSample" class="sample-badge">Sample</span>
            <p>{{ dashboard.description || 'No description' }}</p>
          </td>
          <td><span class="category-badge">{{ dashboard.category }}</span></td>
          <td><span :class="['type-badge', dashboard.type]">{{ dashboardTypeLabel(dashboard) }}</span></td>
          <td>
            <strong>{{ creatorName(dashboard) }}</strong>
            <p>{{ dashboard.creator?.email || dashboard.tenantName || 'Unknown' }}</p>
          </td>
          <td><span :class="['status-badge', statusClass(dashboard.status)]">{{ statusLabel(dashboard.status) }}</span></td>
          <td>{{ dashboard.views.toLocaleString() }}</td>
          <td>{{ dashboard.charts.toLocaleString() }}</td>
          <td>{{ formatDashboardDate(dashboard.updatedAt) }}</td>
          <td>
            <span class="visibility-badge">{{ visibilitySummary(dashboard) }}</span>
          </td>
          <td>
            <div class="admin-dashboard-management-actions">
              <button class="action-btn view" type="button" :aria-label="`View ${dashboard.name}`" title="View Dashboard" @click="emit('openDialog', 'view', dashboard)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>
              </button>
              <button v-if="!dashboard.isSample" class="action-btn edit" type="button" :disabled="isSaving" :aria-label="`Edit ${dashboard.name}`" title="Edit Dashboard" @click="emit('openDialog', 'edit', dashboard)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5V20h2.5L18.1 8.4l-2.5-2.5L4 17.5Zm15.8-11.3a1 1 0 0 0 0-1.4l-.6-.6a1 1 0 0 0-1.4 0l-1 1 2.5 2.5 1-1Z" /></svg>
              </button>
              <button class="action-btn clone" type="button" :disabled="isSaving" :aria-label="`Clone ${dashboard.name}`" title="Clone Dashboard" @click="emit('openDialog', 'clone', dashboard)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2Zm2 0h4a2 2 0 0 1 2 2v4h2V5H9v2Zm-4 2v8h8V9H5Z" /></svg>
              </button>
              <details class="admin-dashboard-management-more">
                <summary :aria-label="`More actions for ${dashboard.name}`">...</summary>
                <div class="admin-dashboard-management-menu">
                  <button
                    v-if="canManageDashboardVisibility(dashboard)"
                    type="button"
                    :disabled="isSaving"
                    @click="emit('openDialog', 'visibility', dashboard)"
                  >
                    Manage Visibility
                  </button>
                  <button v-if="!dashboard.isSample" class="danger" type="button" :disabled="isSaving" @click="emit('openDialog', 'delete', dashboard)">Delete</button>
                </div>
              </details>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
