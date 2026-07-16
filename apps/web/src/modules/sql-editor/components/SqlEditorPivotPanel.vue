<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  isNumericColumn,
  normalizePivotConfig,
  pivotTableRows,
  valueColumnName
} from '../pivot';
import type {
  SqlEditorPivotAggregation,
  SqlEditorPivotConfig,
  SqlEditorPivotValueSpec,
  SqlEditorQueryResult
} from '../types';

const props = defineProps<{
  result: SqlEditorQueryResult;
  pivotConfig: SqlEditorPivotConfig | null;
}>();

const emit = defineEmits<{
  updatePivotConfig: [config: SqlEditorPivotConfig];
}>();

const sidebarCollapsed = ref(false);
const fieldSearch = ref('');
const normalizedConfig = computed(() =>
  normalizePivotConfig(props.result, props.pivotConfig, undefined, 'pivot')
);
const pivotTable = computed(() => pivotTableRows(props.result, normalizedConfig.value));
const availableColumns = computed(() => props.result.columns);
const measureColumnSet = computed(() => new Set(pivotTable.value.measureColumns));
const filteredFieldList = computed(() => {
  const query = fieldSearch.value.trim().toLowerCase();
  if (!query) return availableColumns.value;
  return availableColumns.value.filter(field => field.toLowerCase().includes(query));
});

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '(null)';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (typeof value === 'object') return JSON.stringify(value);
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && String(value).trim() !== ''
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numberValue)
    : String(value);
}

function isFieldAssigned(field: string): boolean {
  const config = normalizedConfig.value;
  return config.rows.includes(field) ||
    config.columns.includes(field) ||
    config.filters.includes(field) ||
    config.values.some(value => value.field === field);
}

function assignFieldToArea(field: string, area: 'columns' | 'filters' | 'rows' | 'values'): void {
  const config = withoutField(normalizedConfig.value, field);
  if (area === 'rows') config.rows = sortBySourceOrder([...config.rows, field]);
  if (area === 'columns') config.columns = sortBySourceOrder([...config.columns, field]);
  if (area === 'filters') {
    config.filters = sortBySourceOrder([...config.filters, field]);
    config.filterValues = { ...config.filterValues, [field]: '__ALL__' };
  }
  if (area === 'values') {
    config.values = [...config.values, {
      field,
      aggregation: isNumericColumn(props.result, field) ? 'sum' : 'count',
      alias: ''
    }];
  }
  updateConfig(config);
}

function toggleFieldDefault(field: string): void {
  if (isFieldAssigned(field)) {
    updateConfig(withoutField(normalizedConfig.value, field));
    return;
  }
  assignFieldToArea(field, isNumericColumn(props.result, field) ? 'values' : 'rows');
}

function removeFieldFromArea(field: string, area: 'columns' | 'filters' | 'rows'): void {
  const config = cloneConfig(normalizedConfig.value);
  if (area === 'rows') config.rows = config.rows.filter(item => item !== field);
  if (area === 'columns') config.columns = config.columns.filter(item => item !== field);
  if (area === 'filters') {
    config.filters = config.filters.filter(item => item !== field);
    const filterValues = { ...config.filterValues };
    delete filterValues[field];
    config.filterValues = filterValues;
  }
  updateConfig(config);
}

function removeValueByIndex(index: number): void {
  const config = cloneConfig(normalizedConfig.value);
  config.values = config.values.filter((_value, valueIndex) => valueIndex !== index);
  updateConfig(config);
}

function setFilterValue(field: string, value: string): void {
  updateConfig({
    ...cloneConfig(normalizedConfig.value),
    filterValues: { ...normalizedConfig.value.filterValues, [field]: value }
  });
}

function setAggregation(index: number, aggregation: SqlEditorPivotAggregation): void {
  const config = cloneConfig(normalizedConfig.value);
  config.values = config.values.map((value, valueIndex) =>
    valueIndex === index ? { ...value, aggregation } : value
  );
  updateConfig(config);
}

function toggleSort(field: string): void {
  const current = normalizedConfig.value.sort;
  const nextSort = !current || current.field !== field
    ? { field, direction: 'asc' as const }
    : current.direction === 'asc'
      ? { field, direction: 'desc' as const }
      : null;
  updateConfig({ ...cloneConfig(normalizedConfig.value), sort: nextSort });
}

function getSortIndicator(field: string): string {
  const sort = normalizedConfig.value.sort;
  if (sort?.field !== field) return '';
  return sort.direction === 'asc' ? 'Asc' : 'Desc';
}

function getFieldDistinctValues(field: string): string[] {
  const values = new Set<string>();
  for (const row of props.result.rows) {
    const value = row[field];
    if (value !== null && value !== undefined && value !== '') values.add(String(value));
    if (values.size >= 200) break;
  }
  return Array.from(values);
}

function getRowTotal(row: Record<string, unknown>): number {
  return pivotTable.value.measureColumns.reduce((total, column) => {
    const value = Number(row[column]);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function updateConfig(config: SqlEditorPivotConfig): void {
  emit('updatePivotConfig', normalizePivotConfig(props.result, config, undefined, 'pivot'));
}

function withoutField(config: SqlEditorPivotConfig, field: string): SqlEditorPivotConfig {
  const nextConfig = cloneConfig(config);
  nextConfig.rows = nextConfig.rows.filter(item => item !== field);
  nextConfig.columns = nextConfig.columns.filter(item => item !== field);
  nextConfig.filters = nextConfig.filters.filter(item => item !== field);
  nextConfig.values = nextConfig.values.filter(value => value.field !== field);
  delete nextConfig.filterValues[field];
  return nextConfig;
}

function cloneConfig(config: SqlEditorPivotConfig): SqlEditorPivotConfig {
  return {
    viewMode: 'pivot',
    rows: [...config.rows],
    columns: [...config.columns],
    filters: [...config.filters],
    filterValues: { ...config.filterValues },
    values: config.values.map(value => ({ ...value })),
    sort: config.sort ? { ...config.sort } : null
  };
}

function sortBySourceOrder(fields: string[]): string[] {
  return [...fields].sort((left, right) =>
    availableColumns.value.indexOf(left) - availableColumns.value.indexOf(right)
  );
}

function valueLabel(value: SqlEditorPivotValueSpec): string {
  return valueColumnName(value);
}
</script>

<template>
  <section class="sql-editor-pivot-view" aria-label="Pivot result preview">
    <div class="sql-editor-pivot-main">
      <div class="sql-editor-pivot-left">
        <div class="sql-editor-pivot-summary" role="status" aria-label="Pivot status">
          {{ pivotTable.rows.length }} grouped row{{ pivotTable.rows.length === 1 ? '' : 's' }}
        </div>
        <div class="sql-editor-result-table-wrap">
          <table class="sql-editor-result-table sql-editor-pivot-table" aria-label="Pivot preview">
            <thead>
              <tr>
                <th v-for="column in pivotTable.columns" :key="`pivot-header-${column}`" scope="col">
                  <button
                    type="button"
                    class="sql-editor-pivot-sort-button"
                    :aria-label="`Sort pivot by ${column}`"
                    @click="toggleSort(column)"
                  >
                    <span>{{ column }}</span>
                    <span v-if="getSortIndicator(column)" class="sql-editor-pivot-sort-indicator">{{ getSortIndicator(column) }}</span>
                  </button>
                </th>
                <th v-if="pivotTable.showRowTotal" scope="col">
                  <button
                    type="button"
                    class="sql-editor-pivot-sort-button"
                    aria-label="Sort pivot by Row Total"
                    @click="toggleSort('__row_total__')"
                  >
                    <span>Row Total</span>
                    <span v-if="getSortIndicator('__row_total__')" class="sql-editor-pivot-sort-indicator">{{ getSortIndicator('__row_total__') }}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in pivotTable.rows" :key="`pivot-row-${rowIndex}`">
                <td v-for="column in pivotTable.columns" :key="`pivot-cell-${rowIndex}-${column}`" :class="{ 'sql-editor-total-cell': measureColumnSet.has(column) }">
                  {{ formatCellValue(row[column]) }}
                </td>
                <td v-if="pivotTable.showRowTotal" class="sql-editor-total-cell">{{ formatCellValue(getRowTotal(row)) }}</td>
              </tr>
            </tbody>
            <tfoot v-if="pivotTable.rows.length > 0">
              <tr>
                <td
                  v-for="(column, columnIndex) in pivotTable.columns"
                  :key="`pivot-footer-${column}`"
                  class="sql-editor-total-cell"
                >
                  <span v-if="columnIndex === 0">Grand Total</span>
                  <span v-else-if="measureColumnSet.has(column)">{{ formatCellValue(pivotTable.columnTotals[column]) }}</span>
                </td>
                <td v-if="pivotTable.showRowTotal" class="sql-editor-total-cell">{{ formatCellValue(pivotTable.grandRowTotal) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <aside v-if="!sidebarCollapsed" class="sql-editor-pivot-sidebar" aria-label="PivotTable Fields">
        <div class="sql-editor-pivot-sidebar-header">
          <h3>PivotTable Fields</h3>
          <button type="button" class="sql-editor-pivot-collapse-button" aria-label="Collapse pivot fields" @click="sidebarCollapsed = true">
            &gt;
          </button>
        </div>

        <label class="sql-editor-pivot-search">
          <span class="sr-only">Search pivot fields</span>
          <input v-model="fieldSearch" type="search" placeholder="Search fields" aria-label="Search pivot fields">
        </label>

        <div class="sql-editor-pivot-field-list" aria-label="Available pivot fields">
          <div v-for="field in filteredFieldList" :key="`field-${field}`" class="sql-editor-pivot-field-item">
            <label class="sql-editor-pivot-field-check">
              <input type="checkbox" :checked="isFieldAssigned(field)" @change="toggleFieldDefault(field)">
              <span>{{ field }}</span>
            </label>
            <div class="sql-editor-pivot-field-targets">
              <button type="button" aria-label="Add field to Filters" title="Filters" @click="assignFieldToArea(field, 'filters')">F</button>
              <button type="button" aria-label="Add field to Columns" title="Columns" @click="assignFieldToArea(field, 'columns')">C</button>
              <button type="button" aria-label="Add field to Rows" title="Rows" @click="assignFieldToArea(field, 'rows')">R</button>
              <button type="button" aria-label="Add field to Values" title="Values" @click="assignFieldToArea(field, 'values')">V</button>
            </div>
          </div>
        </div>

        <div class="sql-editor-pivot-areas" aria-label="Pivot field areas">
          <section class="sql-editor-pivot-area" aria-label="Filters">
            <h4>Filters</h4>
            <div class="sql-editor-pivot-area-body">
              <div v-for="field in normalizedConfig.filters" :key="`filter-${field}`" class="sql-editor-pivot-chip">
                <span>{{ field }}</span>
                <select
                  :value="normalizedConfig.filterValues[field] || '__ALL__'"
                  :aria-label="`${field} pivot filter value`"
                  @change="setFilterValue(field, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="__ALL__">(All)</option>
                  <option v-for="value in getFieldDistinctValues(field)" :key="`filter-value-${field}-${value}`" :value="value">{{ value }}</option>
                </select>
                <button type="button" :aria-label="`Remove ${field} from Filters`" @click="removeFieldFromArea(field, 'filters')">&times;</button>
              </div>
            </div>
          </section>

          <section class="sql-editor-pivot-area" aria-label="Columns">
            <h4>Columns</h4>
            <div class="sql-editor-pivot-area-body">
              <div v-for="field in normalizedConfig.columns" :key="`column-${field}`" class="sql-editor-pivot-chip">
                <span>{{ field }}</span>
                <button type="button" :aria-label="`Remove ${field} from Columns`" @click="removeFieldFromArea(field, 'columns')">&times;</button>
              </div>
            </div>
          </section>

          <section class="sql-editor-pivot-area" aria-label="Rows">
            <h4>Rows</h4>
            <div class="sql-editor-pivot-area-body">
              <div v-for="field in normalizedConfig.rows" :key="`row-${field}`" class="sql-editor-pivot-chip">
                <span>{{ field }}</span>
                <button type="button" :aria-label="`Remove ${field} from Rows`" @click="removeFieldFromArea(field, 'rows')">&times;</button>
              </div>
            </div>
          </section>

          <section class="sql-editor-pivot-area" aria-label="Values">
            <h4>Values</h4>
            <div class="sql-editor-pivot-area-body">
              <div v-for="(value, index) in normalizedConfig.values" :key="`value-${index}-${value.field}`" class="sql-editor-pivot-chip value-chip">
                <span>{{ valueLabel(value) }}</span>
                <select
                  :value="value.aggregation"
                  :aria-label="`${value.field} value aggregation`"
                  @change="setAggregation(index, ($event.target as HTMLSelectElement).value as SqlEditorPivotAggregation)"
                >
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="count">Count</option>
                  <option value="count_distinct">Distinct Count</option>
                </select>
                <button type="button" :aria-label="`Remove ${value.field} from Values`" @click="removeValueByIndex(index)">&times;</button>
              </div>
            </div>
          </section>
        </div>
      </aside>

      <button v-else type="button" class="sql-editor-pivot-sidebar-reopen" aria-label="Expand pivot fields" @click="sidebarCollapsed = false">
        Pivot
      </button>
    </div>
  </section>
</template>
