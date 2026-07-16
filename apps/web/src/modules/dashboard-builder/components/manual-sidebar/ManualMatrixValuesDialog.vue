<script setup lang="ts">
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showMatrixValuesDialog" class="modal-overlay" @click.self="ctx.applyMatrixValuesDialog">
    <div class="modal-box modal-box--wide">
      <div class="modal-header">
        <h4>Manage Values</h4>
        <button type="button" class="modal-close" @click="ctx.applyMatrixValuesDialog">&times;</button>
      </div>
      <div class="modal-body">
        <div v-for="(v, i) in ctx.localMatrixValues" :key="i" class="column-editor-card">
          <div class="field-row">
            <select
              v-model="v.field"
              class="editor-select field-row-field"
              :aria-label="`Value ${i + 1} field`"
            >
              <option value="">Select field…</option>
              <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
            <ManualTextField
              v-model="v.label"
              class="field-row-label"
              hide-label
              :input-id="`matrix-value-${i + 1}-label-input`"
              label="Value label"
              placeholder="Custom label"
            />
            <label class="sr-only" :for="`matrix-value-${i + 1}-label-input`">Value {{ i + 1 }} label</label>
            <select
              v-model="v.agg"
              class="editor-select field-row-agg"
              :aria-label="`Value ${i + 1} aggregation`"
            >
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
              <option value="countDistinct">Count Distinct</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
            <button type="button" class="remove-btn" @click="ctx.localMatrixValues.splice(i, 1)">&times;</button>
          </div>
          <div class="column-format-grid">
            <label class="dialog-field">
              <span class="editor-field-label">Format Type</span>
              <select
                v-model="v.format"
                class="editor-select"
                :aria-label="`Value ${i + 1} format type`"
              >
                <option value="none">No Formatting</option>
                <option value="currency">Currency</option>
                <option value="number">Number</option>
                <option value="integer">Integer</option>
                <option value="percentage">Percentage</option>
                <option value="decimal">Decimal</option>
                <option value="text">Text</option>
              </select>
            </label>
            <label v-if="v.format !== 'none' && v.format !== 'text'" class="dialog-field">
              <span class="editor-field-label">Decimals</span>
              <select
                v-model="v.decimals"
                class="editor-select"
                :aria-label="`Value ${i + 1} decimals`"
                :disabled="v.format === 'integer'"
              >
                <option v-if="v.format !== 'integer'" value="">Auto</option>
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <label v-if="v.format !== 'none' && v.format !== 'text' && v.format !== 'decimal'" class="dialog-field">
              <span class="editor-field-label">Separator</span>
              <select
                v-model="v.thousandsSeparator"
                class="editor-select"
                :aria-label="`Value ${i + 1} thousands separator`"
              >
                <option value="comma">Comma</option>
                <option value="none">None</option>
                <option value="space">Space</option>
              </select>
            </label>
            <label v-if="v.format === 'currency'" class="dialog-field">
              <span class="editor-field-label">Currency</span>
              <select
                v-model="v.currencySymbol"
                class="editor-select"
                :aria-label="`Value ${i + 1} currency symbol`"
              >
                <option value="">Dashboard Default</option>
                <option v-for="option in ctx.dashboardCurrencyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label v-if="v.format !== 'none'" class="dialog-field">
              <span class="editor-field-label">Prefix</span>
              <input
                v-model="v.prefix"
                class="editor-input"
                :aria-label="`Value ${i + 1} prefix`"
                placeholder="Before value"
              />
            </label>
            <label v-if="v.format !== 'none'" class="dialog-field">
              <span class="editor-field-label">Suffix</span>
              <input
                v-model="v.suffix"
                class="editor-input"
                :aria-label="`Value ${i + 1} suffix`"
                placeholder="After value"
              />
            </label>
          </div>
          <div v-if="v.format && v.format !== 'none'" class="matrix-format-preview">
            <span class="matrix-format-preview__label">Preview</span>
            <code class="matrix-format-preview__value">{{ ctx.matrixValuePreview(v) }}</code>
          </div>
          <div v-if="ctx.localMatrixValues.length === 1" class="toggle-row">
            <span class="toggle-label">Hide Value Title</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="v.hideTitle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <button type="button" class="add-btn" @click="ctx.localMatrixValues.push({ field: '', label: '', agg: 'sum', format: 'none', decimals: '', thousandsSeparator: 'comma', currencySymbol: '', hideTitle: false, prefix: '', suffix: '' })">+ Add Value</button>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.applyMatrixValuesDialog">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>

<style scoped>
.matrix-format-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.matrix-format-preview__label {
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
  font-weight: 700;
}

.matrix-format-preview__value {
  border-radius: 6px;
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text-primary, #111827);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  padding: 4px 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
