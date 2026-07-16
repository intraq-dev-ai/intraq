<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { AdminDataSource } from '../types';
import {
  ADMIN_CONNECTION_TYPES,
  countSourcesByConnectionType,
  sourceDisplayType,
  statusBadgeClass,
  type AdminConnectionType,
  type AdminConnectionTypeId
} from '../view-model';
import { selectedTableSummary } from '../workflow-helpers';

const props = defineProps<{
  canManage: boolean;
  connections: AdminDataSource[];
  error: string;
  isBusy: boolean;
  refreshingSchemaSourceId: string;
  searchQuery: string;
  selectedTypeId: AdminConnectionTypeId;
  sources: AdminDataSource[];
  status: string;
  testingSourceId: string;
}>();

defineEmits<{
  addNew: [typeId: AdminConnectionTypeId];
  filters: [source: AdminDataSource];
  details: [source: AdminDataSource];
  edit: [source: AdminDataSource];
  manageDataModels: [source: AdminDataSource];
  manageTables: [source: AdminDataSource];
  refreshSchema: [source: AdminDataSource];
  sampleVisibility: [source: AdminDataSource, field: 'isGloballyVisible', value: boolean];
  test: [source: AdminDataSource];
  dashboardSettings: [source: AdminDataSource, field: 'visible' | 'default', value: boolean];
  'update:searchQuery': [value: string];
  'update:selectedTypeId': [value: AdminConnectionTypeId];
}>();

const FALLBACK_CONNECTION_TYPE: AdminConnectionType = {
  abbreviation: 'DB',
  color: '#3b82f6',
  id: 'database',
  name: 'Database'
};

const selectedType = computed<AdminConnectionType>(() =>
  ADMIN_CONNECTION_TYPES.find(type => type.id === props.selectedTypeId) ?? ADMIN_CONNECTION_TYPES[0] ?? FALLBACK_CONNECTION_TYPE
);

const activeConnections = computed(() =>
  props.connections.filter(s => s.tables && s.tables.some(t => t.isSelected))
);

const availableConnections = computed(() =>
  props.connections.filter(s => !s.tables || !s.tables.some(t => t.isSelected))
);

const totalSelectedTables = computed(() =>
  activeConnections.value.reduce((tot, s) => tot + (s.tables ? s.tables.filter(t => t.isSelected).length : 0), 0)
);

const selectedResourceLabel = computed(() => selectedType.value.id === 'api' ? 'endpoints' : 'tables');

const visibleStatus = computed(() => {
  const trimmed = props.status.trim();
  if (!trimmed || props.error || props.isBusy) return '';
  if (trimmed.startsWith('Loading ')) return '';
  if (/^\d+ data source records? loaded$/.test(trimmed)) return '';
  return trimmed;
});

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : '';
}

function checkedValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

function isApiSource(source: AdminDataSource): boolean {
  return source.type.toLowerCase() === 'api';
}

function editSourceLabel(source: AdminDataSource): string {
  return isApiSource(source) ? 'API Setup' : 'Edit';
}

function editSourceAriaLabel(source: AdminDataSource): string {
  return isApiSource(source)
    ? `Edit API setup, authentication, and token configuration for ${source.name}`
    : `Edit ${source.name}`;
}

function configHost(source: AdminDataSource): string {
  return String(source.config.host ?? source.config.serverHostname ?? source.config.bucket ?? source.config.baseUrl ?? 'N/A');
}

function configDatabase(source: AdminDataSource): string {
  return String(source.config.database ?? source.config.catalog ?? source.config.region ?? 'N/A');
}

function canRegisterAllTables(source: AdminDataSource): boolean {
  if (source.isSample || source.sourceType === 'custom_query') return false;
  const connectorType = String(source.config.engine ?? source.config.provider ?? source.type).toLowerCase();
  return [
    'postgres',
    'postgresql',
    'databricks',
    'databricks_sql',
    'databricks-sql',
    'mysql',
    'mariadb'
  ].includes(connectorType);
}

function sourceResourceLabel(source: AdminDataSource, plural = true): string {
  if (isApiSource(source)) return plural ? 'Endpoints' : 'Endpoint';
  return plural ? 'Tables' : 'Table';
}

function sourceResourceSummary(source: AdminDataSource): string {
  return selectedTableSummary(source).replace(/\btables\b/gi, isApiSource(source) ? 'endpoints' : 'tables');
}

function visibilityLabel(source: AdminDataSource): string {
  if (source.isGloballyVisible) return 'Global sample';
  if (source.dashboardVisible) return 'Dashboard ready';
  return 'Scoped';
}

function apiWorkflowAccessLabel(source: AdminDataSource): string {
  const workflow = source.settings.apiWorkflow;
  if (typeof workflow === 'object' && workflow !== null && !Array.isArray(workflow)) {
    const access = String((workflow as Record<string, unknown>).access ?? (workflow as Record<string, unknown>).visibility ?? '').toLowerCase();
    if (access === 'public') return 'Public client API';
  }
  return 'Private dashboard API';
}
</script>

<template>
  <div class="admin-ds-management-page">
    <header class="admin-ds-page-header">
      <div>
        <h1 id="admin-ds-management-title" class="admin-ds-page-title">Data Source Management</h1>
        <p class="admin-ds-page-subtitle">Manage and configure your data source connections</p>
      </div>
      <div class="admin-ds-header-actions">
        <RouterLink class="admin-secondary-button" to="/admin/api-workflows/guide">API workflow guide</RouterLink>
      </div>
    </header>

    <article class="sr-only" role="status" aria-label="Data Source Management status" aria-live="polite">
      {{ status }}
    </article>
    <p v-if="visibleStatus" class="admin-ds-status-message" role="status" aria-live="polite">{{ visibleStatus }}</p>
    <p v-if="error" class="admin-ds-error" role="alert">{{ error }}</p>

    <section class="admin-ds-management-shell" aria-label="Data source management workspace">
      <aside class="admin-ds-connection-sidebar" aria-labelledby="admin-ds-connection-types-title">
        <div class="admin-ds-connection-sidebar-header">
          <h2 id="admin-ds-connection-types-title">Connection Types</h2>
          <button
            v-if="canManage"
            class="admin-ds-primary-button is-compact"
            type="button"
            @click="$emit('addNew', selectedTypeId)"
          >
            <svg aria-hidden="true" class="admin-ds-button-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add New
          </button>
        </div>

        <div class="admin-ds-connection-types" aria-label="Connection Types">
          <button
            v-for="type in ADMIN_CONNECTION_TYPES"
            :key="type.id"
            class="admin-ds-type-button"
            :class="{ active: selectedTypeId === type.id }"
            type="button"
            :aria-pressed="selectedTypeId === type.id"
            @click="$emit('update:selectedTypeId', type.id)"
          >
            <span class="admin-ds-type-icon" :style="{ backgroundColor: type.color }">{{ type.abbreviation }}</span>
            <span class="admin-ds-type-info">
              <span class="admin-ds-type-name">{{ type.name }}</span>
              <span class="admin-ds-type-count">
                {{ countSourcesByConnectionType(sources, type.id) }}
                {{ countSourcesByConnectionType(sources, type.id) === 1 ? 'connection' : 'connections' }}
              </span>
            </span>
          </button>
        </div>
      </aside>

      <section class="admin-ds-connection-panel" :aria-labelledby="`admin-ds-${selectedType.id}-connections-title`">
        <div class="admin-ds-connection-panel-header">
          <h2 :id="`admin-ds-${selectedType.id}-connections-title`">{{ selectedType.name }} Connections</h2>
          <label>
            <span class="sr-only">Search connections</span>
            <input
              :value="searchQuery"
              type="search"
              placeholder="Search connections..."
              @input="$emit('update:searchQuery', inputValue($event))"
            />
          </label>
        </div>

        <div v-if="isBusy" class="admin-ds-panel-state" role="status" aria-live="polite">
          Loading connections...
        </div>

        <div v-else-if="connections.length === 0" class="admin-ds-panel-state">
          <p>No {{ selectedType.name.toLowerCase() }} sources found</p>
          <p v-if="selectedType.id === 'sample'" class="admin-ds-panel-state-note">
            Sample data sources are pre-loaded datasets for testing and demonstration purposes.
          </p>
          <button
            v-else-if="canManage"
            class="btn btn-outline"
            type="button"
            @click="$emit('addNew', selectedTypeId)"
          >
            Add Your First {{ selectedType.name }} Connection
          </button>
        </div>

        <div v-else class="admin-ds-connections-body">
          <div v-if="activeConnections.length > 0" class="data-source-section">
            <div class="section-header selected-section">
              <h3 class="selected-section-title">Active Data Sources ({{ activeConnections.length }})</h3>
              <span class="selected-section-count">{{ totalSelectedTables }} {{ selectedResourceLabel }} selected</span>
            </div>
            <div class="data-source-cards">
              <article
                v-for="source in activeConnections"
                :key="source.id"
                class="data-source-card selected-card"
                :class="{ 'is-default-source': source.dashboardDefault }"
                :aria-label="source.name"
              >
                <div class="ds-card-header">
                  <div class="ds-source-info">
                    <span class="ds-connection-icon" :style="{ backgroundColor: selectedType.color }">{{ selectedType.abbreviation }}</span>
                    <div>
                      <h4>{{ source.name }}</h4>
                      <p>{{ sourceDisplayType(source) }}</p>
                    </div>
                  </div>
                  <span :class="statusBadgeClass(source.status)">{{ source.status }}</span>
                </div>

                <div class="ds-source-details">
                  <div class="ds-detail-row">
                    <span class="ds-detail-label">Host:</span>
                    <span class="ds-detail-value">{{ configHost(source) }}</span>
                  </div>
                  <div class="ds-detail-row">
                    <span class="ds-detail-label">Database:</span>
                    <span class="ds-detail-value">{{ configDatabase(source) }}</span>
                  </div>
                  <div class="ds-detail-row">
                    <span class="ds-detail-label">{{ sourceResourceLabel(source) }}:</span>
                    <span class="ds-detail-value">{{ source.sourceType === 'target' ? 'Target destination (no table selection needed)' : sourceResourceSummary(source) }}</span>
                  </div>
                  <div v-if="isApiSource(source)" class="ds-detail-row">
                    <span class="ds-detail-label">API Access:</span>
                    <span class="ds-detail-value">{{ apiWorkflowAccessLabel(source) }}</span>
                  </div>
                  <div v-if="canManage" class="ds-detail-row ds-dashboard-row">
                    <span class="ds-detail-label">Dashboard:</span>
                    <label class="ds-dashboard-toggle">
                      <input
                        type="checkbox"
                        :checked="source.dashboardVisible"
                        :aria-label="`Show ${source.name} in dashboards`"
                        @change="$emit('dashboardSettings', source, 'visible', checkedValue($event))"
                      />
                      <span>Visible</span>
                    </label>
                    <label class="ds-dashboard-toggle">
                      <input
                        type="checkbox"
                        :checked="source.dashboardDefault"
                        :disabled="!source.dashboardVisible || source.sourceType === 'target'"
                        :aria-label="`Use ${source.name} as default`"
                        @change="$emit('dashboardSettings', source, 'default', checkedValue($event))"
                      />
                      <span>Default</span>
                    </label>
                  </div>
                </div>

                <div v-if="canManage" class="ds-table-management">
                  <span class="ds-table-management-label">{{ sourceResourceLabel(source, false) }} Management</span>
                  <div class="ds-card-actions">
                    <button class="btn btn-outline btn-sm" type="button" :aria-label="`Manage ${sourceResourceLabel(source).toLowerCase()} for ${source.name}`" @click="$emit('manageTables', source)">
                      Manage {{ sourceResourceLabel(source) }}
                    </button>
                    <button class="btn btn-outline btn-sm" type="button" :aria-label="`Manage data models for ${source.name}`" @click="$emit('manageDataModels', source)">Manage Data Models</button>
                  </div>
                </div>

                <div class="ds-card-actions ds-card-row-actions">
                  <button class="btn btn-outline btn-sm" type="button" :aria-label="`Open details for ${source.name}`" @click="$emit('details', source)">Details</button>
                  <button v-if="canManage" class="btn btn-outline btn-sm" type="button" :aria-label="editSourceAriaLabel(source)" @click="$emit('edit', source)">
                    {{ editSourceLabel(source) }}
                  </button>
                  <button
                    v-if="canManage"
                    class="btn btn-outline btn-sm"
                    type="button"
                    :disabled="testingSourceId === source.id"
                    :aria-label="`Test connection for ${source.name}`"
                    @click="$emit('test', source)"
                  >
                    {{ testingSourceId === source.id ? 'Testing...' : 'Test' }}
                  </button>
                  <button
                    v-if="canManage"
                    class="btn btn-outline btn-sm"
                    type="button"
                    :aria-label="`Filters for ${source.name}`"
                    @click="$emit('filters', source)"
                  >
                    Filters<span v-if="source.defaultFilters.length" class="ds-filter-pill">{{ source.defaultFilters.length }}</span>
                  </button>
                  <button
                    v-if="canManage && canRegisterAllTables(source)"
                    class="btn btn-outline btn-sm"
                    type="button"
                    :disabled="refreshingSchemaSourceId === source.id"
                    :aria-label="`Register all tables for ${source.name}`"
                    @click="$emit('refreshSchema', source)"
                  >
                    {{ refreshingSchemaSourceId === source.id ? 'Registering...' : 'Register all tables' }}
                  </button>
                  <RouterLink class="btn btn-outline btn-sm" :to="{ path: '/admin/data-dictionary', query: { source: source.id } }" :aria-label="`Open dictionary for ${source.name}`">Dictionary</RouterLink>
                  <div v-if="source.isSample && canManage" class="ds-visibility-controls">
                    <label class="ds-dashboard-toggle">
                      <input
                        type="checkbox"
                        :checked="source.isGloballyVisible"
                        :aria-label="`Show ${source.name} to all users globally`"
                        @change="$emit('sampleVisibility', source, 'isGloballyVisible', checkedValue($event))"
                      />
                      <span>Global</span>
                    </label>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div v-if="availableConnections.length > 0" class="data-source-section">
            <div v-if="activeConnections.length > 0" class="section-header">
              <h3 class="available-section-title">Available ({{ availableConnections.length }})</h3>
            </div>
            <div class="data-source-cards">
              <article
                v-for="source in availableConnections"
                :key="source.id"
                class="data-source-card"
                :class="{ 'is-default-source': source.dashboardDefault }"
                :aria-label="source.name"
              >
                <div class="ds-card-header">
                  <div class="ds-source-info">
                    <span class="ds-connection-icon" :style="{ backgroundColor: selectedType.color }">{{ selectedType.abbreviation }}</span>
                    <div>
                      <h4>{{ source.name }}</h4>
                      <p>{{ source.description || sourceDisplayType(source) }}</p>
                    </div>
                  </div>
                  <span :class="statusBadgeClass(source.status)">{{ source.status }}</span>
                </div>

                <div class="ds-source-details">
                  <div class="ds-detail-row">
                    <span class="ds-detail-label">Host:</span>
                    <span class="ds-detail-value">{{ configHost(source) }}</span>
                  </div>
                  <div class="ds-detail-row">
                    <span class="ds-detail-label">Database:</span>
                    <span class="ds-detail-value">{{ configDatabase(source) }}</span>
                  </div>
                  <div class="ds-detail-row">
                    <span class="ds-detail-label">{{ sourceResourceLabel(source) }}:</span>
                    <span class="ds-detail-value">{{ source.sourceType === 'target' ? 'Target destination' : sourceResourceSummary(source) }}</span>
                  </div>
                  <div v-if="canManage" class="ds-detail-row ds-dashboard-row">
                    <span class="ds-detail-label">Dashboard:</span>
                    <label class="ds-dashboard-toggle">
                      <input
                        type="checkbox"
                        :checked="source.dashboardVisible"
                        :aria-label="`Show ${source.name} in dashboards`"
                        @change="$emit('dashboardSettings', source, 'visible', checkedValue($event))"
                      />
                      <span>Visible</span>
                    </label>
                    <label class="ds-dashboard-toggle">
                      <input
                        type="checkbox"
                        :checked="source.dashboardDefault"
                        :disabled="!source.dashboardVisible || source.sourceType === 'target'"
                        :aria-label="`Use ${source.name} as default`"
                        @change="$emit('dashboardSettings', source, 'default', checkedValue($event))"
                      />
                      <span>Default</span>
                    </label>
                  </div>
                </div>

                <div v-if="source.sourceType !== 'target'" class="ds-table-management">
                  <span class="ds-table-management-label">Available {{ sourceResourceLabel(source) }}</span>
                  <div class="ds-card-actions">
                    <button class="btn btn-outline btn-sm" type="button" :aria-label="`Manage ${sourceResourceLabel(source).toLowerCase()} for ${source.name}`" @click="$emit('manageTables', source)">
                      Manage {{ sourceResourceLabel(source) }}
                    </button>
                    <button
                      v-if="canManage && canRegisterAllTables(source)"
                      class="btn btn-outline btn-sm"
                      type="button"
                      :disabled="refreshingSchemaSourceId === source.id"
                      :aria-label="`Register all raw tables for ${source.name}`"
                      @click="$emit('refreshSchema', source)"
                    >
                      {{ refreshingSchemaSourceId === source.id ? 'Registering...' : 'Register all tables' }}
                    </button>
                  </div>
                </div>

                <div class="ds-card-actions ds-card-row-actions">
                  <button class="btn btn-outline btn-sm" type="button" :aria-label="`Open details for ${source.name}`" @click="$emit('details', source)">Details</button>
                  <button v-if="canManage" class="btn btn-outline btn-sm" type="button" :aria-label="editSourceAriaLabel(source)" @click="$emit('edit', source)">
                    {{ editSourceLabel(source) }}
                  </button>
                  <button
                    v-if="canManage"
                    class="btn btn-outline btn-sm"
                    type="button"
                    :disabled="testingSourceId === source.id"
                    :aria-label="`Test connection for ${source.name}`"
                    @click="$emit('test', source)"
                  >
                    {{ testingSourceId === source.id ? 'Testing...' : 'Test' }}
                  </button>
                  <button v-if="canManage" class="btn btn-outline btn-sm" type="button" :aria-label="`Filters for ${source.name}`" @click="$emit('filters', source)">
                    Filters<span v-if="source.defaultFilters.length" class="ds-filter-pill">{{ source.defaultFilters.length }}</span>
                  </button>
                  <RouterLink class="btn btn-outline btn-sm" :to="{ path: '/admin/data-dictionary', query: { source: source.id } }" :aria-label="`Open dictionary for ${source.name}`">Dictionary</RouterLink>
                  <div v-if="source.isSample && canManage" class="ds-visibility-controls">
                    <label class="ds-dashboard-toggle">
                      <input
                        type="checkbox"
                        :checked="source.isGloballyVisible"
                        :aria-label="`Show ${source.name} globally`"
                        @change="$emit('sampleVisibility', source, 'isGloballyVisible', checkedValue($event))"
                      />
                      <span>Global</span>
                    </label>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>
    </section>
  </div>
</template>
