<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { AdminDataSource } from '../types';
import { sourceDisplayType, statusBadgeClass } from '../view-model';
import { selectedTableSummary } from '../workflow-helpers';

defineProps<{
  canManage: boolean;
  isBusy: boolean;
  label: string;
  refreshingSchemaSourceId: string;
  selectedSourceId: string;
  sources: AdminDataSource[];
  testingSourceId: string;
}>();

defineEmits<{
  dashboardSettings: [source: AdminDataSource, field: 'visible' | 'default', value: boolean];
  details: [source: AdminDataSource];
  edit: [source: AdminDataSource];
  filters: [source: AdminDataSource];
  manageDataModels: [source: AdminDataSource];
  manageTables: [source: AdminDataSource];
  refreshSchema: [source: AdminDataSource];
  sampleVisibility: [source: AdminDataSource, field: 'isGloballyVisible', value: boolean];
  test: [source: AdminDataSource];
}>();

function checkedValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

function canRegisterAllTables(source: AdminDataSource): boolean {
  if (source.isSample || source.sourceType === 'custom_query') return false;
  const connectorType = String(source.config.engine ?? source.config.provider ?? source.type).toLowerCase();
  return connectorType === 'mysql'
    || connectorType === 'mariadb'
    || connectorType === 'databricks'
    || connectorType === 'databricks_sql'
    || connectorType === 'databricks-sql';
}

function isApiSource(source: AdminDataSource): boolean {
  return source.type.toLowerCase() === 'api';
}

function sourceResourceLabel(source: AdminDataSource, plural = true): string {
  if (isApiSource(source)) return plural ? 'Endpoints' : 'Endpoint';
  return plural ? 'Tables' : 'Table';
}

function sourceResourceSummary(source: AdminDataSource): string {
  return selectedTableSummary(source).replace(/\btables\b/gi, isApiSource(source) ? 'endpoints' : 'tables');
}
</script>

<template>
  <article class="panel admin-data-source-list" aria-labelledby="admin-data-source-list-title">
    <div class="admin-data-source-panel-heading">
      <h2 id="admin-data-source-list-title">Source Connections</h2>
      <span class="admin-muted">{{ sources.length }} source{{ sources.length === 1 ? '' : 's' }}</span>
    </div>

    <p v-if="isBusy" class="admin-empty-state" role="status" aria-live="polite">Loading data sources.</p>
    <p v-else-if="sources.length === 0" class="admin-empty-state">No data sources match this view.</p>

    <div v-else class="admin-table-wrap">
      <table :aria-label="label">
        <thead>
          <tr>
            <th scope="col">Data Source</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Models</th>
            <th scope="col">Visibility</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="source in sources" :key="source.id" :class="{ 'is-selected': source.id === selectedSourceId }">
            <th scope="row">
              <button
                class="admin-link-button"
                type="button"
                :aria-label="`Open ${source.name} details`"
                @click="$emit('details', source)"
              >
                {{ source.name }}
              </button>
              <span v-if="source.description" class="admin-data-source-description">{{ source.description }}</span>
            </th>
            <td>{{ sourceDisplayType(source) }}</td>
            <td><span :class="statusBadgeClass(source.status)">{{ source.status }}</span></td>
            <td>{{ sourceResourceSummary(source) }}</td>
            <td>
              <span v-if="source.isGloballyVisible">Global sample</span>
              <span v-else-if="source.dashboardVisible">Dashboard ready</span>
              <span v-else>Scoped</span>
              <div v-if="canManage" class="admin-data-source-inline-toggles">
                <label>
                  <input
                    :checked="source.dashboardVisible"
                    type="checkbox"
                    :aria-label="`Show ${source.name} in dashboards and Analyzer`"
                    @change="$emit('dashboardSettings', source, 'visible', checkedValue($event))"
                  />
                  Dashboard
                </label>
                <label>
                  <input
                    :checked="source.dashboardDefault"
                    :disabled="!source.dashboardVisible || source.sourceType === 'target'"
                    type="checkbox"
                    :aria-label="`Use ${source.name} as default dashboard source`"
                    @change="$emit('dashboardSettings', source, 'default', checkedValue($event))"
                  />
                  Default
                </label>
                <label v-if="source.isSample">
                  <input
                    :checked="source.isGloballyVisible"
                    type="checkbox"
                    :aria-label="`Show ${source.name} as a global sample`"
                    @change="$emit('sampleVisibility', source, 'isGloballyVisible', checkedValue($event))"
                  />
                  Global sample
                </label>
              </div>
            </td>
            <td>
              <div class="admin-row-actions">
                <button
                  class="admin-secondary-button"
                  type="button"
                  :aria-label="`View details for ${source.name}`"
                  @click="$emit('details', source)"
                >
                  Details
                </button>
                <button
                  v-if="canManage"
                  class="admin-secondary-button"
                  type="button"
                  :disabled="testingSourceId === source.id"
                  :aria-label="`Test connection for ${source.name}`"
                  @click="$emit('test', source)"
                >
                  {{ testingSourceId === source.id ? 'Testing' : 'Test connection' }}
                </button>
                <button
                  v-if="canManage"
                  class="admin-secondary-button"
                  type="button"
                  :aria-label="`Edit ${source.name}`"
                  @click="$emit('edit', source)"
                >
                  Edit
                </button>
                <button
                  v-if="canManage && canRegisterAllTables(source)"
                  class="admin-secondary-button"
                  type="button"
                  :disabled="refreshingSchemaSourceId === source.id"
                  :aria-label="`Register all raw tables for ${source.name}`"
                  @click="$emit('refreshSchema', source)"
                >
                  {{ refreshingSchemaSourceId === source.id ? 'Registering' : 'Register all tables' }}
                </button>
                <button
                  v-if="canManage"
                  class="admin-secondary-button"
                  type="button"
                  :aria-label="`Manage ${sourceResourceLabel(source).toLowerCase()} for ${source.name}`"
                  @click="$emit('manageTables', source)"
                >
                  Manage {{ sourceResourceLabel(source) }}
                </button>
                <button
                  v-if="canManage"
                  class="admin-secondary-button"
                  type="button"
                  :aria-label="`Manage data models for ${source.name}`"
                  @click="$emit('manageDataModels', source)"
                >
                  Manage Data Models
                </button>
                <button
                  v-if="canManage"
                  class="admin-secondary-button"
                  type="button"
                  :aria-label="`Filters for ${source.name}`"
                  @click="$emit('filters', source)"
                >
                  Filters
                  <span v-if="source.defaultFilters.length" class="admin-ds-filter-count">{{ source.defaultFilters.length }}</span>
                </button>
                <RouterLink
                  class="admin-secondary-link"
                  :to="{ path: '/admin/data-dictionary', query: { source: source.id } }"
                  :aria-label="`Open dictionary for ${source.name}`"
                >
                  Dictionary
                </RouterLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
