<script setup lang="ts">
import { computed } from 'vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();

const matrixRowOptions = computed(() =>
  ctx.matrixConfiguredRowFields.map((field: { field: string; label: string }) => ({
    label: field.label || ctx.seriesFieldLabel(field.field),
    value: field.field
  }))
);

const matrixColumnOptions = computed(() =>
  ctx.matrixConfiguredColumnFields.map((field: { field: string; label: string }) => ({
    label: field.label || ctx.seriesFieldLabel(field.field),
    value: field.field
  }))
);

const filterOperators = [
  { label: 'Equals', value: 'equals' },
  { label: 'Not equals', value: 'not_equals' },
  { label: 'Greater than', value: '>' },
  { label: 'Less than', value: '<' },
  { label: 'Greater than or equal', value: '>=' },
  { label: 'Less than or equal', value: '<=' },
  { label: 'Contains', value: 'contains' },
  { label: 'Does not contain', value: 'not_contains' },
  { label: 'Starts with', value: 'starts_with' },
  { label: 'Ends with', value: 'ends_with' },
  { label: 'In list', value: 'in' },
  { label: 'Not in list', value: 'not_in' },
  { label: 'Between', value: 'between' },
  { label: 'Is empty', value: 'is_null' },
  { label: 'Is not empty', value: 'is_not_null' }
];

function addFilter(): void {
  ctx.localMatrixFilters.push({
    field: '',
    logicOperator: 'AND',
    operator: 'equals',
    value: '',
    valueTo: ''
  });
}

function addRowSort(): void {
  ctx.localMatrixRowSorts.push({ direction: 'ASC', sortBy: '', sortOn: '' });
}

function addColumnSort(): void {
  ctx.localMatrixColumnSorts.push({ direction: 'ASC', sortBy: '', sortOn: '' });
}

function moveSort(list: Array<{ direction: 'ASC' | 'DESC'; sortBy: string; sortOn: string }>, index: number, delta: number): void {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= list.length) return;
  const [item] = list.splice(index, 1);
  if (!item) return;
  list.splice(nextIndex, 0, item);
}

function needsValue(operator: string): boolean {
  return operator !== 'is_null' && operator !== 'is_not_null';
}

function isBetween(operator: string): boolean {
  return operator === 'between';
}
</script>

<template>
  <div v-if="ctx.showMatrixFilterSortDialog" class="modal-overlay" @click.self="ctx.applyMatrixFilterSortDialog">
    <div class="modal-box modal-box--wide">
      <div class="modal-header">
        <h4>Configure Filters &amp; Sorting</h4>
        <button type="button" class="modal-close" @click="ctx.applyMatrixFilterSortDialog">&times;</button>
      </div>
      <div class="modal-body">
        <section class="dialog-stack-section">
          <div class="section-header-row">
            <div>
              <h5 class="dialog-section-title">Data Filters</h5>
              <p class="dialog-section-help">Filter matrix rows before grouping and totals are calculated.</p>
            </div>
            <button type="button" class="add-btn" @click="addFilter">+ Add Filter</button>
          </div>
          <div v-if="ctx.localMatrixFilters.length === 0" class="dialog-empty-state">No filters configured.</div>
          <div v-for="(filter, index) in ctx.localMatrixFilters" :key="`matrix-filter-${index}`" class="column-editor-card">
            <div class="field-row">
              <select v-model="filter.field" class="editor-select field-row-field" :aria-label="`Matrix filter ${index + 1} field`">
                <option value="">Select field…</option>
                <option v-for="field in ctx.currentTableFields" :key="field.name" :value="field.name">{{ ctx.fieldLabel(field) }}</option>
              </select>
              <select v-model="filter.operator" class="editor-select field-row-agg" :aria-label="`Matrix filter ${index + 1} operator`">
                <option v-for="operator in filterOperators" :key="operator.value" :value="operator.value">{{ operator.label }}</option>
              </select>
              <button type="button" class="remove-btn" @click="ctx.localMatrixFilters.splice(index, 1)">&times;</button>
            </div>
            <div class="column-format-grid">
              <label v-if="needsValue(filter.operator)" class="dialog-field">
                <span class="editor-field-label">Value</span>
                <input v-model="filter.value" class="editor-input" :aria-label="`Matrix filter ${index + 1} value`" :placeholder="filter.operator === 'in' || filter.operator === 'not_in' ? 'Comma separated values' : 'Filter value'" />
              </label>
              <label v-if="isBetween(filter.operator)" class="dialog-field">
                <span class="editor-field-label">End Value</span>
                <input v-model="filter.valueTo" class="editor-input" :aria-label="`Matrix filter ${index + 1} end value`" placeholder="Upper bound" />
              </label>
              <label v-if="index < ctx.localMatrixFilters.length - 1" class="dialog-field">
                <span class="editor-field-label">Next Condition</span>
                <select v-model="filter.logicOperator" class="editor-select" :aria-label="`Matrix filter ${index + 1} logic`">
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section class="dialog-stack-section">
          <div class="section-header-row">
            <div>
              <h5 class="dialog-section-title">Row Sorting</h5>
              <p class="dialog-section-help">Sort matrix row groups using the same display-field and data-field semantics as legacy.</p>
            </div>
            <button type="button" class="add-btn" @click="addRowSort">+ Add Sort</button>
          </div>
          <div v-if="ctx.localMatrixRowSorts.length === 0" class="dialog-empty-state">No row sorting configured.</div>
          <div v-for="(sort, index) in ctx.localMatrixRowSorts" :key="`matrix-row-sort-${index}`" class="column-editor-card">
            <div class="field-row">
              <select v-model="sort.sortOn" class="editor-select field-row-field" :aria-label="`Matrix row sort ${index + 1} sort on`">
                <option value="">Select row field…</option>
                <option v-for="option in matrixRowOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <select v-model="sort.sortBy" class="editor-select field-row-field" :aria-label="`Matrix row sort ${index + 1} sort by`">
                <option value="">Use display field</option>
                <option v-for="field in ctx.currentTableFields" :key="field.name" :value="field.name">{{ ctx.fieldLabel(field) }}</option>
              </select>
              <select v-model="sort.direction" class="editor-select field-row-agg" :aria-label="`Matrix row sort ${index + 1} direction`">
                <option value="ASC">Ascending</option>
                <option value="DESC">Descending</option>
              </select>
              <button type="button" class="remove-btn" @click="ctx.localMatrixRowSorts.splice(index, 1)">&times;</button>
            </div>
            <div class="sort-actions-row">
              <button type="button" class="sort-order-btn" :disabled="index === 0" @click="moveSort(ctx.localMatrixRowSorts, index, -1)">Move up</button>
              <button type="button" class="sort-order-btn" :disabled="index === ctx.localMatrixRowSorts.length - 1" @click="moveSort(ctx.localMatrixRowSorts, index, 1)">Move down</button>
            </div>
          </div>
        </section>

        <section class="dialog-stack-section">
          <div class="section-header-row">
            <div>
              <h5 class="dialog-section-title">Column Sorting</h5>
              <p class="dialog-section-help">Sort matrix columns independently from row grouping.</p>
            </div>
            <button type="button" class="add-btn" @click="addColumnSort">+ Add Sort</button>
          </div>
          <div v-if="ctx.localMatrixColumnSorts.length === 0" class="dialog-empty-state">No column sorting configured.</div>
          <div v-for="(sort, index) in ctx.localMatrixColumnSorts" :key="`matrix-column-sort-${index}`" class="column-editor-card">
            <div class="field-row">
              <select v-model="sort.sortOn" class="editor-select field-row-field" :aria-label="`Matrix column sort ${index + 1} sort on`">
                <option value="">Select column field…</option>
                <option v-for="option in matrixColumnOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <select v-model="sort.sortBy" class="editor-select field-row-field" :aria-label="`Matrix column sort ${index + 1} sort by`">
                <option value="">Use display field</option>
                <option v-for="field in ctx.currentTableFields" :key="field.name" :value="field.name">{{ ctx.fieldLabel(field) }}</option>
              </select>
              <select v-model="sort.direction" class="editor-select field-row-agg" :aria-label="`Matrix column sort ${index + 1} direction`">
                <option value="ASC">Ascending</option>
                <option value="DESC">Descending</option>
              </select>
              <button type="button" class="remove-btn" @click="ctx.localMatrixColumnSorts.splice(index, 1)">&times;</button>
            </div>
            <div class="sort-actions-row">
              <button type="button" class="sort-order-btn" :disabled="index === 0" @click="moveSort(ctx.localMatrixColumnSorts, index, -1)">Move up</button>
              <button type="button" class="sort-order-btn" :disabled="index === ctx.localMatrixColumnSorts.length - 1" @click="moveSort(ctx.localMatrixColumnSorts, index, 1)">Move down</button>
            </div>
          </div>
        </section>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.applyMatrixFilterSortDialog">Save</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>

<style scoped>
.dialog-stack-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-stack-section + .dialog-stack-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border, #d1d5db);
}

.section-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.dialog-section-title {
  margin: 0;
  color: var(--text-primary, #111827);
  font-size: 14px;
  font-weight: 700;
}

.dialog-section-help {
  margin: 4px 0 0;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
}

.dialog-empty-state {
  border: 1px dashed var(--border, #d1d5db);
  border-radius: 8px;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  padding: 14px;
  text-align: center;
}

.sort-actions-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}

.sort-order-btn {
  min-height: 30px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  background: var(--surface, #fff);
  color: var(--text-primary, #111827);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
}

.sort-order-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
