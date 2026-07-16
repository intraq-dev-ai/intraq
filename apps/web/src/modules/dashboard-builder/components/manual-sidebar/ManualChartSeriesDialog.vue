<script setup lang="ts">
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showSeriesDialog" class="modal-overlay" @click.self="ctx.showSeriesDialog = false">
    <div class="modal-box modal-box--wide modal-box--series">
      <div class="modal-header">
        <h4>Manage Y Series (Measure)</h4>
        <button type="button" class="modal-close" @click="ctx.showSeriesDialog = false">&times;</button>
      </div>
      <div class="modal-body">
        <p v-if="ctx.splitSeriesByActive" class="dialog-notice dialog-notice--warning" role="status">
          Split Series is active. Only Default Type is supported for Y-series chart type overrides.
        </p>
        <div v-for="(s, i) in ctx.localSeries" :key="i" class="series-editor-card">
          <div class="series-editor-card__header">
            <div class="series-editor-card__title">
              <strong>{{ s.field ? ctx.seriesFieldLabel(s.field) : 'New series' }}</strong>
              <span>{{ s.field || 'Select a measure field' }}</span>
            </div>
            <button type="button" class="remove-btn" @click="ctx.removeSeries(i)">&times;</button>
          </div>
          <div class="series-editor-card__body">
            <div class="series-editor-grid series-editor-grid--two">
              <label class="dialog-field">
                <span class="editor-field-label">Measure Field</span>
                <select v-model="s.field" class="editor-select" @change="ctx.syncSeriesDialog">
                  <option value="">Select field…</option>
                  <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
                </select>
              </label>
              <ManualTextField
                v-model="s.label"
                class="dialog-field"
                label="Display Label"
                :placeholder="s.field ? ctx.seriesFieldLabel(s.field) : 'Label'"
                @update:model-value="ctx.syncSeriesDialog"
              />
            </div>
            <div class="series-editor-grid series-editor-grid--four">
              <label class="dialog-field">
                <span class="editor-field-label">Aggregation</span>
                <select v-model="s.agg" class="editor-select" @change="ctx.syncSeriesDialog">
                  <option value="sum">Sum</option>
                  <option value="average">Average</option>
                  <option value="none">None</option>
                  <option value="count">Count</option>
                  <option value="countDistinct">Count Distinct</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                </select>
              </label>
              <label class="dialog-field">
                <span class="editor-field-label">Axis</span>
                <select v-model="s.axis" class="editor-select" @change="ctx.syncSeriesDialog">
                  <option value="y">Y Axis</option>
                  <option value="y2">Y2 Axis</option>
                </select>
              </label>
              <label class="dialog-field">
                <span class="editor-field-label">Type</span>
                <select
                  v-model="s.chartType"
                  class="editor-select"
                  :disabled="ctx.splitSeriesByActive"
                  @change="ctx.syncSeriesDialog"
                >
                  <option value="">Default Type</option>
                  <option value="bar">Bar</option>
                  <option value="column">Column</option>
                  <option value="line">Line</option>
                  <option value="area">Area</option>
                </select>
              </label>
              <label class="dialog-field">
                <span class="editor-field-label">Color</span>
                <div class="color-row">
                  <input
                    type="color"
                    :value="ctx.seriesColorPreview(s, i)"
                    class="color-swatch"
                    :title="s.color ? 'Series color override' : `Default palette color ${ctx.seriesColorPreview(s, i)}`"
                    @input="ctx.setSeriesColor(s, ($event.target as HTMLInputElement).value); ctx.syncSeriesDialog()"
                  />
                  <input
                    v-model="s.color"
                    class="editor-input color-hex"
                    :placeholder="`Default (${ctx.seriesColorPreview(s, i)})`"
                    @input="ctx.syncSeriesDialog"
                  />
                  <button
                    type="button"
                    class="color-reset-btn"
                    :disabled="!s.color"
                    @click="ctx.clearSeriesColor(s); ctx.syncSeriesDialog()"
                  >
                    Default
                  </button>
                </div>
              </label>
            </div>
            <div class="series-format-card">
              <h5>Value Formatting</h5>
              <div class="series-editor-grid series-editor-grid--four">
                <label class="dialog-field">
                  <span class="editor-field-label">Format Type</span>
                  <select v-model="s.format" class="editor-select" @change="ctx.syncSeriesDialog">
                    <option value="number">Number</option>
                    <option value="currency">Currency</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </label>
                <label class="dialog-field">
                  <span class="editor-field-label">Decimal Places</span>
                  <select v-model="s.decimals" class="editor-select" @change="ctx.syncSeriesDialog">
                    <option value="">Auto</option>
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </label>
                <label class="dialog-field">
                  <span class="editor-field-label">Thousands Separator</span>
                  <select v-model="s.thousandsSeparator" class="editor-select" @change="ctx.syncSeriesDialog">
                    <option value="comma">Comma (1,000)</option>
                    <option value="none">None (1000)</option>
                    <option value="space">Space (1 000)</option>
                  </select>
                </label>
                <label v-if="s.format === 'currency'" class="dialog-field">
                  <span class="editor-field-label">Currency Symbol</span>
                  <select v-model="s.currencySymbol" class="editor-select" @change="ctx.syncSeriesDialog">
                    <option value="">Dashboard Default</option>
                    <option v-for="option in ctx.dashboardCurrencyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
                <label v-else class="dialog-field">
                  <span class="editor-field-label">Prefix</span>
                  <input v-model="s.prefix" class="editor-input" placeholder="e.g. ~" @input="ctx.syncSeriesDialog" />
                </label>
              </div>
            </div>
          </div>
        </div>
        <button type="button" class="add-btn" @click="ctx.addSeries">+ Add Series</button>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.closeSeriesDialog">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
