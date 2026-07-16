<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  filterAdminDictionaryDialogTables,
  type AdminDictionaryDialogTable
} from './view-model';

const props = defineProps<{
  loading: boolean;
  rows: AdminDictionaryDialogTable[];
  selectedRowId: string;
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
  select: [rowId: string];
}>();

const dialogEl = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const activeCategories = ref<string[]>([]);
const pendingRowId = ref('');

onMounted(() => { dialogEl.value?.focus(); });

const categories = computed(() => [...new Set(props.rows.map(row => row.category))].sort());
const visibleRows = computed(() =>
  filterAdminDictionaryDialogTables(props.rows, searchQuery.value, activeCategories.value)
);
const pendingTable = computed(() => props.rows.find(row => row.rowId === pendingRowId.value) ?? null);

watch(() => props.show, show => {
  if (!show) return;
  pendingRowId.value = props.selectedRowId;
  searchQuery.value = '';
  activeCategories.value = [];
});

function toggleCategory(category: string): void {
  activeCategories.value = activeCategories.value.includes(category)
    ? activeCategories.value.filter(item => item !== category)
    : [...activeCategories.value, category];
}

function confirmSelection(): void {
  if (!pendingRowId.value) return;
  emit('select', pendingRowId.value);
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) return 'Not reported';
  return new Intl.NumberFormat('en-US', { notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Not reported';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(date);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="admin-dictionary-dialog-backdrop" @click.self="emit('close')">
      <section
        ref="dialogEl"
        class="admin-dictionary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dictionary-picker-title"
        tabindex="-1"
        @keydown.esc="emit('close')"
      >
        <header class="admin-dictionary-dialog-header">
          <div>
            <h2 id="admin-dictionary-picker-title">Data Dictionary</h2>
            <p>Search, filter, and choose the governed table to review.</p>
          </div>
          <button class="admin-icon-button" type="button" aria-label="Close table picker" @click="emit('close')">X</button>
        </header>

        <div class="admin-dictionary-dialog-body">
          <label class="admin-dictionary-dialog-search" for="admin-dictionary-picker-search">
            <span>Search tables by name or description</span>
            <input
              id="admin-dictionary-picker-search"
              v-model="searchQuery"
              type="search"
              placeholder="Search tables by name or description"
            />
          </label>

          <div v-if="categories.length > 0" class="admin-dictionary-filter-options" aria-label="Dictionary categories">
            <button
              v-for="category in categories"
              :key="category"
              type="button"
              :class="{ active: activeCategories.includes(category) }"
              :aria-pressed="activeCategories.includes(category)"
              @click="toggleCategory(category)"
            >
              {{ category }}
              <span>{{ rows.filter(row => row.category === category).length }}</span>
            </button>
          </div>

          <div v-if="loading" class="admin-empty-state" role="status" aria-live="polite">
            Loading data dictionary.
          </div>
          <div v-else-if="visibleRows.length === 0" class="admin-empty-state" role="status">
            No tables found matching your search criteria.
          </div>
          <div v-else class="admin-dictionary-dialog-grid" aria-label="Dictionary table choices">
            <button
              v-for="row in visibleRows"
              :key="row.rowId"
              type="button"
              class="admin-dictionary-choice"
              :class="{ selected: pendingRowId === row.rowId, 'has-issues': row.hasIssues }"
              @click="pendingRowId = row.rowId"
            >
              <span class="admin-dictionary-choice-heading">
                <strong>{{ row.displayName }}</strong>
                <span>{{ row.category }}</span>
              </span>
              <small>ID: {{ row.physicalName }}</small>
              <span class="admin-dictionary-choice-description">{{ row.description }}</span>
              <span class="admin-dictionary-choice-stats">
                <span>Columns: {{ row.columnCount }}</span>
                <span>Records: {{ formatNumber(row.recordCount) }}</span>
                <span>Updated: {{ formatDate(row.lastUpdated) }}</span>
              </span>
              <span v-if="row.hasIssues" class="admin-dictionary-issues">
                <strong>Data issues:</strong>
                {{ row.issues.join('; ') }}
              </span>
              <span v-else class="admin-badge admin-badge-success">Ready</span>
            </button>
          </div>
        </div>

        <footer class="admin-dictionary-dialog-footer">
          <span>{{ pendingTable ? `Selected: ${pendingTable.displayName}` : 'No table selected' }}</span>
          <div>
            <button class="admin-secondary-button" type="button" @click="emit('close')">Cancel</button>
            <button class="button" type="button" :disabled="!pendingRowId" @click="confirmSelection">
              Use Selected Table
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
