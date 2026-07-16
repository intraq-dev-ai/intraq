<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  configuredFields: string[];
}>();

const columnsText = defineModel<string>('columnsText', { required: true });
const tableDataMode = defineModel<'raw' | 'series'>('tableDataMode', { required: true });
const tableDisplayMode = defineModel<string>('tableDisplayMode', { required: true });
const tableFillMissingTimeBuckets = defineModel<boolean>('tableFillMissingTimeBuckets', { required: true });
const tableTimeBucketInterval = defineModel<'auto' | 'day' | 'hour' | 'month' | 'week'>('tableTimeBucketInterval', { required: true });
const tableTimeBucketFillValue = defineModel<number | null>('tableTimeBucketFillValue', { required: true });
const tablePageSize = defineModel<number>('tablePageSize', { required: true });
const tableGroupFieldsText = defineModel<string>('tableGroupFieldsText', { required: true });
const tableFiltersText = defineModel<string>('tableFiltersText', { required: true });
const tableActionsText = defineModel<string>('tableActionsText', { required: true });
const tableEnableSearch = defineModel<boolean>('tableEnableSearch', { required: true });
const tableEnableFilters = defineModel<boolean>('tableEnableFilters', { required: true });
const tableEnableSorting = defineModel<boolean>('tableEnableSorting', { required: true });
const tableEnableExport = defineModel<boolean>('tableEnableExport', { required: true });
const tableEnablePagination = defineModel<boolean>('tableEnablePagination', { required: true });
const tableShowTotal = defineModel<boolean>('tableShowTotal', { required: true });
const tableTotalColumnsText = defineModel<string>('tableTotalColumnsText', { required: true });
const tableTotalLabel = defineModel<string>('tableTotalLabel', { required: true });
const tableTotalLabelColumn = defineModel<string>('tableTotalLabelColumn', { required: true });

interface TableColumnDraft {
  cellType: string;
  extra: Record<string, unknown>;
  field: string;
  label: string;
  width: string;
}

const tableColumns = computed(() => {
  const parsed = parseColumns(columnsText.value);
  const parsedFields = parsed.map(column => column.field);
  const missingConfigured = props.configuredFields.filter(field => field && !parsedFields.includes(field));
  return [
    ...parsed,
    ...missingConfigured.map(field => ({ cellType: '', extra: {}, field, label: '', width: '' }))
  ];
});

function fieldControlId(field: string, control: string): string {
  return `table-column-${control}-${field.replace(/[^a-z0-9_-]/gi, '-')}`;
}

function updateColumn(field: string, key: 'cellType' | 'label' | 'width', value: string): void {
  const columns = tableColumns.value.map(column => ({ ...column }));
  const target = columns.find(column => column.field === field);
  if (!target) return;
  target[key] = value.trim();
  columnsText.value = serializeColumns(columns);
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function parseColumns(source: string): TableColumnDraft[] {
  const trimmed = source.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith('[')) {
    return trimmed.split(',').map(field => field.trim()).filter(Boolean).map(field => ({
      cellType: '',
      extra: {},
      field,
      label: '',
      width: ''
    }));
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      if (typeof item === 'string' && item.trim()) {
        return [{ cellType: '', extra: {}, field: item.trim(), label: '', width: '' }];
      }
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const field = readString(record.field);
      if (!field) return [];
      const extra = { ...record };
      delete extra.cellType;
      delete extra.field;
      delete extra.label;
      delete extra.width;
      return [{
        cellType: readString(record.cellType) ?? '',
        extra,
        field,
        label: readString(record.label) ?? '',
        width: readString(record.width) ?? ''
      }];
    });
  } catch {
    return [];
  }
}

function serializeColumns(columns: TableColumnDraft[]): string {
  const payload = columns.map(column => {
    const next: Record<string, unknown> = { ...column.extra, field: column.field };
    if (column.label) next.label = column.label;
    if (column.cellType) next.cellType = column.cellType;
    if (column.width) next.width = column.width;
    return next;
  });
  return payload.length ? JSON.stringify(payload, null, 2) : '';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
</script>

<template>
  <fieldset class="visualization-control-group" aria-label="Table configuration">
    <legend>Table configuration</legend>
    <section class="table-column-editor" aria-labelledby="table-column-editor-title">
      <div class="chart-series-heading">
        <h4 id="table-column-editor-title">Columns</h4>
        <span>{{ tableColumns.length }} configured</span>
      </div>
      <p v-if="tableColumns.length === 0" class="chart-series-empty">
        Add fields to configure table column labels, cell type, and width.
      </p>
      <div v-else class="table-column-list">
        <article v-for="column in tableColumns" :key="column.field" class="chart-series-row">
          <div class="chart-series-field">
            <strong>{{ column.field }}</strong>
            <span>Column</span>
          </div>
          <label :for="fieldControlId(column.field, 'label')">
            Label
            <input
              :id="fieldControlId(column.field, 'label')"
              :value="column.label"
              :aria-label="`Label for ${column.field}`"
              placeholder="Default label"
              @input="updateColumn(column.field, 'label', inputValue($event))"
            >
          </label>
          <label :for="fieldControlId(column.field, 'cell-type')">
            Cell type
            <select
              :id="fieldControlId(column.field, 'cell-type')"
              :value="column.cellType"
              :aria-label="`Cell type for ${column.field}`"
              @change="updateColumn(column.field, 'cellType', inputValue($event))"
            >
              <option value="">Default</option>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="currency">Currency</option>
              <option value="badge">Badge</option>
              <option value="progress">Progress</option>
              <option value="bar">Bar</option>
              <option value="sparkline">Sparkline</option>
            </select>
          </label>
          <label :for="fieldControlId(column.field, 'width')">
            Width
            <input
              :id="fieldControlId(column.field, 'width')"
              :value="column.width"
              :aria-label="`Width for ${column.field}`"
              placeholder="Auto"
              @input="updateColumn(column.field, 'width', inputValue($event))"
            >
          </label>
        </article>
      </div>
      <details class="chart-series-advanced-json">
        <summary>Advanced columns JSON</summary>
        <label for="table-columns">Columns JSON or fields</label>
        <textarea
          id="table-columns"
          v-model="columnsText"
          rows="6"
          placeholder='[{"field":"measure_field","label":"Metric","cellType":"progress","format":{"style":"number"}}]'
        ></textarea>
      </details>
    </section>
    <label for="table-display-mode">Table display mode</label>
    <select id="table-display-mode" v-model="tableDisplayMode">
      <option value="">Default</option>
      <option value="comfortable">Comfortable</option>
      <option value="compact">Compact</option>
      <option value="dense">Dense</option>
      <option value="plain">Plain</option>
    </select>
    <label for="table-data-mode">Table row source</label>
    <select id="table-data-mode" v-model="tableDataMode">
      <option value="raw">Raw rows from data source</option>
      <option value="series">Bucketed chart/period rows</option>
    </select>
    <template v-if="tableDataMode === 'series'">
      <label class="inline-checkbox"><input v-model="tableFillMissingTimeBuckets" type="checkbox"> Fill missing period buckets</label>
      <template v-if="tableFillMissingTimeBuckets">
        <label for="table-time-bucket-interval">Bucket interval</label>
        <select id="table-time-bucket-interval" v-model="tableTimeBucketInterval">
          <option value="auto">Auto from period filter</option>
          <option value="hour">Hour</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        <label for="table-time-bucket-fill-value">Missing bucket value</label>
        <input id="table-time-bucket-fill-value" v-model.number="tableTimeBucketFillValue" type="number" step="0.01" placeholder="0">
      </template>
    </template>
    <label for="table-page-size">Page size</label>
    <input id="table-page-size" v-model.number="tablePageSize" min="1" type="number">
    <label for="table-group-fields">Grouping fields</label>
    <textarea id="table-group-fields" v-model="tableGroupFieldsText" rows="3" placeholder="dimension_field, grouping_field"></textarea>
    <label for="table-filters">Filters JSON</label>
    <textarea id="table-filters" v-model="tableFiltersText" rows="4" placeholder='[{"field":"dimension_field","operator":"equals","value":"Value"}]'></textarea>
    <label for="table-actions">Actions JSON</label>
    <textarea id="table-actions" v-model="tableActionsText" rows="4" placeholder='[{"actionId":"view","label":"View"}]'></textarea>
    <label class="inline-checkbox"><input v-model="tableEnableSearch" type="checkbox"> Enable search</label>
    <label class="inline-checkbox"><input v-model="tableEnableFilters" type="checkbox"> Enable filters</label>
    <label class="inline-checkbox"><input v-model="tableEnableSorting" type="checkbox"> Enable sorting</label>
    <label class="inline-checkbox"><input v-model="tableEnableExport" type="checkbox"> Enable export</label>
    <label class="inline-checkbox"><input v-model="tableEnablePagination" type="checkbox"> Enable pagination</label>
    <label class="inline-checkbox"><input v-model="tableShowTotal" type="checkbox"> Show totals</label>
    <template v-if="tableShowTotal">
      <label for="table-total-label">Total label</label>
      <input id="table-total-label" v-model="tableTotalLabel" placeholder="Total">
      <label for="table-total-label-column">Total label column</label>
      <input id="table-total-label-column" v-model="tableTotalLabelColumn" placeholder="First text column">
      <label for="table-total-columns">Total columns</label>
      <textarea id="table-total-columns" v-model="tableTotalColumnsText" rows="2" placeholder="Optional comma-separated fields"></textarea>
    </template>
  </fieldset>
</template>
