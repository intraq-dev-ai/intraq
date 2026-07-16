<script setup lang="ts">
import { computed } from 'vue';

defineProps<{
  configuredFields: string[];
}>();

const matrixRowFieldsText = defineModel<string>('matrixRowFieldsText', { required: true });
const matrixColumnFieldsText = defineModel<string>('matrixColumnFieldsText', { required: true });
const matrixValueFieldsText = defineModel<string>('matrixValueFieldsText', { required: true });
const matrixDisplayMode = defineModel<string>('matrixDisplayMode', { required: true });
const matrixShowValueHeaders = defineModel<boolean>('matrixShowValueHeaders', { required: true });
const matrixRowHeaderLabel = defineModel<string>('matrixRowHeaderLabel', { required: true });
const matrixColumnHeaderLabel = defineModel<string>('matrixColumnHeaderLabel', { required: true });
const matrixValueHeaderLabel = defineModel<string>('matrixValueHeaderLabel', { required: true });
const matrixRowHeaderWidth = defineModel<string>('matrixRowHeaderWidth', { required: true });
const matrixValueHeaderWidth = defineModel<string>('matrixValueHeaderWidth', { required: true });
const matrixColumnWidthsText = defineModel<string>('matrixColumnWidthsText', { required: true });
const matrixRowDataDisplayMode = defineModel<string>('matrixRowDataDisplayMode', { required: true });
const matrixFiltersText = defineModel<string>('matrixFiltersText', { required: true });
const matrixConditionalFormattingText = defineModel<string>('matrixConditionalFormattingText', { required: true });
const matrixMultiSortText = defineModel<string>('matrixMultiSortText', { required: true });
const matrixDefaultRowCollapseState = defineModel<string>('matrixDefaultRowCollapseState', { required: true });
const matrixDefaultColumnCollapseState = defineModel<string>('matrixDefaultColumnCollapseState', { required: true });
const matrixSortBy = defineModel<string>('matrixSortBy', { required: true });
const matrixSortDirection = defineModel<string>('matrixSortDirection', { required: true });
const matrixRowCollapseFieldsText = defineModel<string>('matrixRowCollapseFieldsText', { required: true });
const matrixColumnCollapseFieldsText = defineModel<string>('matrixColumnCollapseFieldsText', { required: true });
const matrixShowRowTotals = defineModel<boolean>('matrixShowRowTotals', { required: true });
const matrixShowColumnTotals = defineModel<boolean>('matrixShowColumnTotals', { required: true });
const matrixShowRowSubtotals = defineModel<boolean>('matrixShowRowSubtotals', { required: true });
const matrixShowColumnSubtotals = defineModel<boolean>('matrixShowColumnSubtotals', { required: true });
const matrixEnableRowCollapse = defineModel<boolean>('matrixEnableRowCollapse', { required: true });
const matrixEnableColumnCollapse = defineModel<boolean>('matrixEnableColumnCollapse', { required: true });
const matrixShowBorders = defineModel<boolean>('matrixShowBorders', { required: true });
const matrixBorderColor = defineModel<string>('matrixBorderColor', { required: true });
const matrixHeaderBg = defineModel<string>('matrixHeaderBg', { required: true });
const matrixHeaderText = defineModel<string>('matrixHeaderText', { required: true });
const matrixRowHeaderBg = defineModel<string>('matrixRowHeaderBg', { required: true });
const matrixRowHeaderText = defineModel<string>('matrixRowHeaderText', { required: true });
const matrixRowBg = defineModel<string>('matrixRowBg', { required: true });
const matrixRowText = defineModel<string>('matrixRowText', { required: true });
const matrixFontFamily = defineModel<string>('matrixFontFamily', { required: true });
const matrixFontSize = defineModel<string>('matrixFontSize', { required: true });

interface MatrixFieldDraft {
  customLabel: string;
  extra: Record<string, unknown>;
  field: string;
  summarize: string;
}

type MatrixFieldTarget = 'columns' | 'rows' | 'values';

const rowFields = computed(() => parseFieldDrafts(matrixRowFieldsText.value));
const columnFields = computed(() => parseFieldDrafts(matrixColumnFieldsText.value));
const valueFields = computed(() => parseFieldDrafts(matrixValueFieldsText.value));

function fieldControlId(target: MatrixFieldTarget, field: string, control: string): string {
  return `matrix-${target}-${control}-${field.replace(/[^a-z0-9_-]/gi, '-')}`;
}

function updateField(
  target: MatrixFieldTarget,
  field: string,
  key: 'customLabel' | 'summarize',
  value: string
): void {
  const fields = currentFields(target).map(item => ({ ...item, extra: { ...item.extra } }));
  const draft = fields.find(item => item.field === field);
  if (!draft) return;
  draft[key] = value.trim();
  writeFields(target, fields);
}

function updateFieldExtra(
  target: MatrixFieldTarget,
  field: string,
  key: 'prefix' | 'suffix',
  value: string
): void {
  const fields = currentFields(target).map(item => ({ ...item, extra: { ...item.extra } }));
  const draft = fields.find(item => item.field === field);
  if (!draft) return;
  const trimmed = value.trim();
  if (trimmed) draft.extra[key] = trimmed;
  else delete draft.extra[key];
  writeFields(target, fields);
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function currentFields(target: MatrixFieldTarget): MatrixFieldDraft[] {
  return {
    columns: columnFields.value,
    rows: rowFields.value,
    values: valueFields.value
  }[target];
}

function writeFields(target: MatrixFieldTarget, fields: MatrixFieldDraft[]): void {
  const serialized = serializeFieldDrafts(fields);
  const model = {
    columns: matrixColumnFieldsText,
    rows: matrixRowFieldsText,
    values: matrixValueFieldsText
  }[target];
  model.value = serialized;
}

function parseFieldDrafts(source: string): MatrixFieldDraft[] {
  const trimmed = source.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith('[')) {
    return trimmed.split(',').map(field => field.trim()).filter(Boolean).map(field => ({
      customLabel: '',
      extra: {},
      field,
      summarize: ''
    }));
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      if (typeof item === 'string' && item.trim()) {
        return [{ customLabel: '', extra: {}, field: item.trim(), summarize: '' }];
      }
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const field = readString(record.field);
      if (!field) return [];
      const extra = { ...record };
      delete extra.customLabel;
      delete extra.field;
      delete extra.label;
      delete extra.summarize;
      return [{
        customLabel: readString(record.customLabel) ?? readString(record.label) ?? '',
        extra,
        field,
        summarize: readString(record.summarize) ?? ''
      }];
    });
  } catch {
    return [];
  }
}

function serializeFieldDrafts(fields: MatrixFieldDraft[]): string {
  const requiresObjects = fields.some(field =>
    field.customLabel || field.summarize || Object.keys(field.extra).length > 0
  );
  if (!requiresObjects) return fields.map(field => field.field).join(', ');
  const payload = fields.map(field => {
    const next: Record<string, unknown> = { ...field.extra, field: field.field };
    if (field.customLabel) next.customLabel = field.customLabel;
    if (field.summarize) next.summarize = field.summarize;
    return next;
  });
  return payload.length ? JSON.stringify(payload, null, 2) : '';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
</script>

<template>
  <fieldset class="visualization-control-group" aria-label="Matrix configuration">
    <legend>Matrix configuration</legend>
    <section class="matrix-field-editor" aria-labelledby="matrix-row-fields-title">
      <div class="chart-series-heading">
        <h4 id="matrix-row-fields-title">Row fields</h4>
        <span>{{ rowFields.length }} configured</span>
      </div>
      <p v-if="rowFields.length === 0" class="chart-series-empty">
        Select row dimensions in the field controls before configuring matrix row labels.
      </p>
      <div v-else class="matrix-field-list">
        <article v-for="field in rowFields" :key="`row-${field.field}`" class="chart-series-row">
          <div class="chart-series-field">
            <strong>{{ field.field }}</strong>
            <span>Row dimension</span>
          </div>
          <label :for="fieldControlId('rows', field.field, 'label')">
            Label
            <input
              :id="fieldControlId('rows', field.field, 'label')"
              :value="field.customLabel"
              :aria-label="`Label for row field ${field.field}`"
              placeholder="Default label"
              @input="updateField('rows', field.field, 'customLabel', inputValue($event))"
            >
          </label>
        </article>
      </div>
    </section>
    <section class="matrix-field-editor" aria-labelledby="matrix-column-fields-title">
      <div class="chart-series-heading">
        <h4 id="matrix-column-fields-title">Column fields</h4>
        <span>{{ columnFields.length }} configured</span>
      </div>
      <p v-if="columnFields.length === 0" class="chart-series-empty">
        Select a column dimension in the field controls before configuring matrix columns.
      </p>
      <div v-else class="matrix-field-list">
        <article v-for="field in columnFields" :key="`column-${field.field}`" class="chart-series-row">
          <div class="chart-series-field">
            <strong>{{ field.field }}</strong>
            <span>Column dimension</span>
          </div>
          <label :for="fieldControlId('columns', field.field, 'label')">
            Label
            <input
              :id="fieldControlId('columns', field.field, 'label')"
              :value="field.customLabel"
              :aria-label="`Label for column field ${field.field}`"
              placeholder="Default label"
              @input="updateField('columns', field.field, 'customLabel', inputValue($event))"
            >
          </label>
        </article>
      </div>
    </section>
    <section class="matrix-field-editor" aria-labelledby="matrix-value-fields-title">
      <div class="chart-series-heading">
        <h4 id="matrix-value-fields-title">Value fields</h4>
        <span>{{ valueFields.length }} configured</span>
      </div>
      <p v-if="valueFields.length === 0" class="chart-series-empty">
        Select value fields in the field controls before configuring matrix measures.
      </p>
      <div v-else class="matrix-field-list">
        <article v-for="field in valueFields" :key="`value-${field.field}`" class="chart-series-row">
          <div class="chart-series-field">
            <strong>{{ field.field }}</strong>
            <span>Value measure</span>
          </div>
          <label :for="fieldControlId('values', field.field, 'label')">
            Label
            <input
              :id="fieldControlId('values', field.field, 'label')"
              :value="field.customLabel"
              :aria-label="`Label for value field ${field.field}`"
              placeholder="Default label"
              @input="updateField('values', field.field, 'customLabel', inputValue($event))"
            >
          </label>
          <label :for="fieldControlId('values', field.field, 'summarize')">
            Aggregation
            <select
              :id="fieldControlId('values', field.field, 'summarize')"
              :value="field.summarize"
              :aria-label="`Aggregation for value field ${field.field}`"
              @change="updateField('values', field.field, 'summarize', inputValue($event))"
            >
              <option value="">Default</option>
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="min">Minimum</option>
              <option value="max">Maximum</option>
              <option value="count">Count</option>
              <option value="countDistinct">Count distinct</option>
            </select>
          </label>
          <div class="dialog-two-col">
            <label :for="fieldControlId('values', field.field, 'prefix')">
              Prefix
              <input
                :id="fieldControlId('values', field.field, 'prefix')"
                :value="typeof field.extra.prefix === 'string' ? field.extra.prefix : ''"
                :aria-label="`Prefix for value field ${field.field}`"
                placeholder="Before value"
                @input="updateFieldExtra('values', field.field, 'prefix', inputValue($event))"
              >
            </label>
            <label :for="fieldControlId('values', field.field, 'suffix')">
              Suffix
              <input
                :id="fieldControlId('values', field.field, 'suffix')"
                :value="typeof field.extra.suffix === 'string' ? field.extra.suffix : ''"
                :aria-label="`Suffix for value field ${field.field}`"
                placeholder="After value"
                @input="updateFieldExtra('values', field.field, 'suffix', inputValue($event))"
              >
            </label>
          </div>
        </article>
      </div>
    </section>
    <details class="chart-series-advanced-json">
      <summary>Advanced matrix fields</summary>
      <label for="matrix-row-fields">Row fields JSON or fields</label>
      <textarea id="matrix-row-fields" v-model="matrixRowFieldsText" rows="4" placeholder='[{"field":"dimension_field","customLabel":"Dimension"}]'></textarea>
      <label for="matrix-column-fields">Column fields JSON or fields</label>
      <textarea id="matrix-column-fields" v-model="matrixColumnFieldsText" rows="4" placeholder="time_or_category_field"></textarea>
      <label for="matrix-value-fields">Value fields JSON or fields</label>
      <textarea id="matrix-value-fields" v-model="matrixValueFieldsText" rows="4" placeholder='[{"field":"measure_field","customLabel":"Metric","summarize":"sum"}]'></textarea>
    </details>
    <label for="matrix-display-mode">Matrix display mode</label>
    <select id="matrix-display-mode" v-model="matrixDisplayMode">
      <option value="">Default</option>
      <option value="comfortable">Comfortable</option>
      <option value="compact">Compact</option>
      <option value="dense">Dense</option>
      <option value="heatmap">Heatmap</option>
      <option value="plain">Plain</option>
    </select>
    <label class="inline-checkbox"><input v-model="matrixShowValueHeaders" type="checkbox"> Show value headers</label>
    <label for="matrix-row-header-label">Row header label</label>
    <input id="matrix-row-header-label" v-model="matrixRowHeaderLabel" type="text" placeholder="Location">
    <label for="matrix-column-header-label">Column header label</label>
    <input id="matrix-column-header-label" v-model="matrixColumnHeaderLabel" type="text" placeholder="Date">
    <label for="matrix-value-header-label">Value header label</label>
    <input id="matrix-value-header-label" v-model="matrixValueHeaderLabel" type="text" placeholder="Metric">
    <label for="matrix-row-header-width">Row header width</label>
    <input id="matrix-row-header-width" v-model="matrixRowHeaderWidth" type="text" placeholder="180px">
    <label for="matrix-value-header-width">Value header width</label>
    <input id="matrix-value-header-width" v-model="matrixValueHeaderWidth" type="text" placeholder="120px">
    <label for="matrix-column-widths">Column widths JSON</label>
    <textarea id="matrix-column-widths" v-model="matrixColumnWidthsText" rows="3" placeholder='{"column_value":"120px"}'></textarea>
    <label for="matrix-row-data-display-mode">Row data display mode</label>
    <select id="matrix-row-data-display-mode" v-model="matrixRowDataDisplayMode">
      <option value="repeat">Repeat labels</option>
      <option value="merge">Merge labels</option>
    </select>
    <label for="matrix-filters">Filters JSON</label>
    <textarea id="matrix-filters" v-model="matrixFiltersText" rows="4" placeholder='[{"field":"dimension_field","operator":"equals","value":"Value"}]'></textarea>
    <label for="matrix-conditional-formatting">Conditional formatting JSON</label>
    <textarea id="matrix-conditional-formatting" v-model="matrixConditionalFormattingText" rows="4" placeholder='[{"field":"measure_field","operator":"gt","value":1000,"tone":"success"}]'></textarea>
    <label for="matrix-multi-sort">Multi-sort JSON</label>
    <textarea id="matrix-multi-sort" v-model="matrixMultiSortText" rows="4" placeholder='{"rows":[{"field":"dimension_field","direction":"asc"}]}'></textarea>
    <label for="matrix-sort-by">Matrix sort field</label>
    <select id="matrix-sort-by" v-model="matrixSortBy">
      <option value="">None</option>
      <option v-for="field in configuredFields" :key="`matrix-sort-${field}`" :value="field">{{ field }}</option>
    </select>
    <label for="matrix-sort-direction">Matrix sort direction</label>
    <select id="matrix-sort-direction" v-model="matrixSortDirection">
      <option value="asc">Ascending</option>
      <option value="desc">Descending</option>
    </select>
    <label for="matrix-row-collapse-fields">Row collapse fields</label>
    <textarea id="matrix-row-collapse-fields" v-model="matrixRowCollapseFieldsText" rows="3" placeholder="dimension_field, nested_dimension"></textarea>
    <label for="matrix-column-collapse-fields">Column collapse fields</label>
    <textarea id="matrix-column-collapse-fields" v-model="matrixColumnCollapseFieldsText" rows="3" placeholder="period_field, date_field"></textarea>
    <label class="inline-checkbox"><input v-model="matrixShowRowTotals" type="checkbox"> Show row totals</label>
    <label class="inline-checkbox"><input v-model="matrixShowColumnTotals" type="checkbox"> Show column totals</label>
    <label class="inline-checkbox"><input v-model="matrixShowRowSubtotals" type="checkbox"> Show row subtotals</label>
    <label class="inline-checkbox"><input v-model="matrixShowColumnSubtotals" type="checkbox"> Show column subtotals</label>
    <label class="inline-checkbox"><input v-model="matrixEnableRowCollapse" type="checkbox"> Enable row collapse</label>
    <label class="inline-checkbox"><input v-model="matrixEnableColumnCollapse" type="checkbox"> Enable column collapse</label>
    <label for="matrix-default-row-collapse-state">Default row collapse state</label>
    <select id="matrix-default-row-collapse-state" v-model="matrixDefaultRowCollapseState">
      <option value="">Unset</option>
      <option value="expanded">Expanded</option>
      <option value="collapsed">Collapsed</option>
    </select>
    <label for="matrix-default-column-collapse-state">Default column collapse state</label>
    <select id="matrix-default-column-collapse-state" v-model="matrixDefaultColumnCollapseState">
      <option value="">Unset</option>
      <option value="expanded">Expanded</option>
      <option value="collapsed">Collapsed</option>
    </select>
    <section class="matrix-field-editor" aria-labelledby="matrix-style-title">
      <div class="chart-series-heading">
        <h4 id="matrix-style-title">Matrix styling</h4>
        <span>Legacy-compatible</span>
      </div>
      <label class="inline-checkbox"><input v-model="matrixShowBorders" type="checkbox"> Show borders</label>
      <label for="matrix-border-color">Border color</label>
      <input id="matrix-border-color" v-model="matrixBorderColor" type="color">
      <label for="matrix-header-bg">Column header background</label>
      <input id="matrix-header-bg" v-model="matrixHeaderBg" type="color">
      <label for="matrix-header-text">Column header text</label>
      <input id="matrix-header-text" v-model="matrixHeaderText" type="color">
      <label for="matrix-row-header-bg">Row header background</label>
      <input id="matrix-row-header-bg" v-model="matrixRowHeaderBg" type="color">
      <label for="matrix-row-header-text">Row header text</label>
      <input id="matrix-row-header-text" v-model="matrixRowHeaderText" type="color">
      <label for="matrix-row-bg">Cell background</label>
      <input id="matrix-row-bg" v-model="matrixRowBg" type="color">
      <label for="matrix-row-text">Cell text</label>
      <input id="matrix-row-text" v-model="matrixRowText" type="color">
      <label for="matrix-font-family">Font family</label>
      <select id="matrix-font-family" v-model="matrixFontFamily">
        <option value="">Default</option>
        <option value="font-sans">Sans serif</option>
        <option value="font-serif">Serif</option>
        <option value="font-mono">Monospace</option>
      </select>
      <label for="matrix-font-size">Font size</label>
      <select id="matrix-font-size" v-model="matrixFontSize">
        <option value="">Default</option>
        <option value="text-xs">Extra small</option>
        <option value="text-sm">Small</option>
        <option value="text-base">Medium</option>
        <option value="text-lg">Large</option>
      </select>
    </section>
  </fieldset>
</template>
