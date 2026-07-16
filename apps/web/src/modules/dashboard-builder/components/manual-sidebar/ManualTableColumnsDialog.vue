<script setup lang="ts">
import {
  TABLE_BOOLEAN_PRESET_OPTIONS,
  TABLE_DATE_FORMAT_PRESET_OPTIONS
} from './manualTableColumnFormattingPresets';
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';
import { REPORT_TIME_ZONE_OPTIONS } from './manualTimeZoneOptions';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showColumnsDialog" class="modal-overlay" @click.self="ctx.applyColumnsDialog">
    <div class="modal-box modal-box--wide">
      <div class="modal-header">
        <h4>Manage Columns</h4>
        <button type="button" class="modal-close" @click="ctx.applyColumnsDialog">&times;</button>
      </div>
      <div class="modal-body">
        <div v-for="(col, i) in ctx.localColumns" :key="i" class="column-editor-card">
          <div class="field-row">
            <select
              v-model="col.field"
              class="editor-select field-row-field"
              :aria-label="`Column ${i + 1} field`"
              @change="ctx.updateColumnField(col)"
            >
              <option value="">Select field...</option>
              <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
            <ManualTextField
              v-model="col.label"
              class="field-row-label"
              hide-label
              label="Column label"
              placeholder="Label"
            />
            <select
              v-model="col.summarize"
              class="editor-select field-row-agg"
              :aria-label="`Column ${i + 1} aggregation`"
            >
              <option value="">None</option>
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
            <select
              v-model="col.cellType"
              class="editor-select field-row-agg"
              :aria-label="`Column ${i + 1} cell type`"
              @change="ctx.updateColumnCellType(col)"
            >
              <option value="">Default</option>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="badge">Badge</option>
              <option value="bar-in-cell">Bar in Cell</option>
              <option value="progress">Progress</option>
              <option value="bullet-chart">Bullet Chart</option>
              <option value="sparkline">Sparkline</option>
              <option value="trend-indicator">Trend Indicator</option>
              <option value="delta">Delta</option>
              <option value="moving-average">Moving Average</option>
              <option value="running-total">Running Total</option>
              <option value="percent-of-total">Percent of Total</option>
              <option value="yoy-change">YoY Change</option>
              <option value="mom-change">MoM Change</option>
            </select>
            <button type="button" class="remove-btn" @click="ctx.removeColumn(i)">&times;</button>
          </div>
          <div class="column-format-grid">
            <label class="dialog-field">
              <span class="editor-field-label">Format Type</span>
              <select v-model="col.format" class="editor-select" :aria-label="`Column ${i + 1} format type`">
                <option value="">Default</option>
                <option value="number">Number</option>
                <option value="currency">Currency</option>
                <option value="percentage">Percentage</option>
                <option value="date">Date</option>
                <option value="structured-list">Structured List</option>
              </select>
            </label>
            <label v-if="ctx.columnUsesNumericFormatting(col)" class="dialog-field">
              <span class="editor-field-label">Decimals</span>
              <select v-model="col.decimals" class="editor-select" :aria-label="`Column ${i + 1} decimals`">
                <option value="">Auto</option>
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <label v-if="ctx.columnUsesNumericFormatting(col)" class="dialog-field">
              <span class="editor-field-label">Separator</span>
              <select v-model="col.thousandsSeparator" class="editor-select" :aria-label="`Column ${i + 1} thousands separator`">
                <option value="comma">Comma</option>
                <option value="none">None</option>
                <option value="space">Space</option>
              </select>
            </label>
            <label v-if="col.format === 'currency'" class="dialog-field">
              <span class="editor-field-label">Currency</span>
              <select v-model="col.currencySymbol" class="editor-select" :aria-label="`Column ${i + 1} currency symbol`">
                <option value="">Dashboard Default</option>
                <option v-for="option in ctx.dashboardCurrencyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label v-if="ctx.columnUsesDateFormatting(col)" class="dialog-field">
              <span class="editor-field-label">Date Format</span>
              <select v-model="col.dateFormat" class="editor-select" :aria-label="`Column ${i + 1} date format`" @change="ctx.updateColumnDateFormat(col)">
                <option v-for="option in TABLE_DATE_FORMAT_PRESET_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label v-if="ctx.columnUsesDateFormatting(col) && col.dateFormat === '__custom__'" class="dialog-field">
              <span class="editor-field-label">Custom Date Pattern</span>
              <input v-model="col.dateFormatCustom" class="editor-input" :aria-label="`Column ${i + 1} custom date format`" placeholder="dd MMM yyyy HH:mm" />
            </label>
            <label v-if="ctx.columnUsesDateFormatting(col)" class="dialog-field">
              <span class="editor-field-label">Time Zone</span>
              <select v-model="col.timeZone" class="editor-select" :aria-label="`Column ${i + 1} timezone`">
                <option v-for="option in REPORT_TIME_ZONE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <template v-if="ctx.columnUsesStructuredListFormatting(col)">
              <label class="dialog-field">
                <span class="editor-field-label">List Label Field</span>
                <input v-model="col.itemLabelField" class="editor-input" :aria-label="`Column ${i + 1} list label field`" placeholder="Name" />
              </label>
              <label class="dialog-field">
                <span class="editor-field-label">List Value Field</span>
                <input v-model="col.itemValueField" class="editor-input" :aria-label="`Column ${i + 1} list value field`" placeholder="Amount" />
              </label>
              <label class="dialog-field">
                <span class="editor-field-label">List Currency Field</span>
                <input v-model="col.itemCurrencyField" class="editor-input" :aria-label="`Column ${i + 1} list currency field`" placeholder="CurrencySymbol" />
              </label>
              <label class="dialog-field">
                <span class="editor-field-label">List Decimals</span>
                <input v-model="col.itemPrecision" class="editor-input" :aria-label="`Column ${i + 1} list decimals`" inputmode="numeric" placeholder="Auto" />
              </label>
              <label class="dialog-field">
                <span class="editor-field-label">Item Separator</span>
                <input v-model="col.itemSeparator" class="editor-input" :aria-label="`Column ${i + 1} item separator`" placeholder="\\n" />
              </label>
              <label class="dialog-field">
                <span class="editor-field-label">Label Separator</span>
                <input v-model="col.itemLabelValueSeparator" class="editor-input" :aria-label="`Column ${i + 1} label value separator`" placeholder=": " />
              </label>
              <label class="dialog-field dialog-field--checkbox">
                <input v-model="col.itemSkipZeroItems" type="checkbox" />
                <span>Skip zero values</span>
              </label>
            </template>
            <label v-if="ctx.columnUsesBooleanFormatting(col)" class="dialog-field">
              <span class="editor-field-label">Boolean Display</span>
              <select v-model="col.booleanPreset" class="editor-select" :aria-label="`Column ${i + 1} boolean preset`" @change="ctx.applyBooleanPreset(col)">
                <option v-for="option in TABLE_BOOLEAN_PRESET_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <div v-if="ctx.columnUsesBooleanFormatting(col)" class="dialog-field">
              <span class="editor-field-label">True Label</span>
              <ManualTextField
                v-model="col.trueLabel"
                hide-label
                label="True label"
                placeholder="True"
                @update:model-value="ctx.syncBooleanPreset(col)"
              />
            </div>
            <div v-if="ctx.columnUsesBooleanFormatting(col)" class="dialog-field">
              <span class="editor-field-label">False Label</span>
              <ManualTextField
                v-model="col.falseLabel"
                hide-label
                label="False label"
                placeholder="False"
                @update:model-value="ctx.syncBooleanPreset(col)"
              />
            </div>
            <label class="dialog-field">
              <span class="editor-field-label">Prefix</span>
              <input v-model="col.prefix" class="editor-input" :aria-label="`Column ${i + 1} prefix`" placeholder="Before value" />
            </label>
            <label class="dialog-field">
              <span class="editor-field-label">Suffix</span>
              <input v-model="col.suffix" class="editor-input" :aria-label="`Column ${i + 1} suffix`" placeholder="After value" />
            </label>
            <label class="dialog-field">
              <span class="editor-field-label">Empty Value</span>
              <input v-model="col.emptyValue" class="editor-input" :aria-label="`Column ${i + 1} empty value`" placeholder="Blank" />
            </label>
            <label class="dialog-field">
              <span class="editor-field-label">Link Underline</span>
              <select v-model="col.linkUnderline" class="editor-select" :aria-label="`Column ${i + 1} link underline`">
                <option value="">Default</option>
                <option value="always">Show underline</option>
                <option value="never">Hide underline</option>
              </select>
            </label>
            <label class="dialog-field">
              <span class="editor-field-label">Total</span>
              <select v-model="col.totalAggregation" class="editor-select" :aria-label="`Column ${i + 1} total aggregation`">
                <option value="">Default</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            </label>
          </div>
          <details class="column-advanced-options">
            <summary>Period label and date overrides</summary>
            <div class="column-period-overrides">
              <label class="dialog-field">
                <span class="editor-field-label">Parameter</span>
                <input v-model="col.runtimeParameter" class="editor-input" :aria-label="`Column ${i + 1} runtime parameter`" placeholder="rangeType" />
              </label>
              <div class="column-period-overrides__grid">
                <label class="dialog-field">
                  <span class="editor-field-label">Value 0 Label</span>
                  <input v-model="col.runtimeLabel0" class="editor-input" :aria-label="`Column ${i + 1} runtime label for 0`" placeholder="Time" />
                </label>
                <label class="dialog-field">
                  <span class="editor-field-label">Value 0 Date Format</span>
                  <input v-model="col.runtimeDateFormat0" class="editor-input" :aria-label="`Column ${i + 1} runtime date format for 0`" placeholder="HH:mm" />
                </label>
                <label class="dialog-field">
                  <span class="editor-field-label">Value 1 Label</span>
                  <input v-model="col.runtimeLabel1" class="editor-input" :aria-label="`Column ${i + 1} runtime label for 1`" placeholder="DAY" />
                </label>
                <label class="dialog-field">
                  <span class="editor-field-label">Value 1 Date Format</span>
                  <input v-model="col.runtimeDateFormat1" class="editor-input" :aria-label="`Column ${i + 1} runtime date format for 1`" placeholder="dddd (DD/MM)" />
                </label>
                <label class="dialog-field">
                  <span class="editor-field-label">Value 2 Label</span>
                  <input v-model="col.runtimeLabel2" class="editor-input" :aria-label="`Column ${i + 1} runtime label for 2`" placeholder="Date" />
                </label>
                <label class="dialog-field">
                  <span class="editor-field-label">Value 2 Date Format</span>
                  <input v-model="col.runtimeDateFormat2" class="editor-input" :aria-label="`Column ${i + 1} runtime date format for 2`" placeholder="D" />
                </label>
              </div>
            </div>
          </details>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show Total Row</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.tableShowTotal" @change="ctx.saveToggle" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div v-if="ctx.tableShowTotal" class="dialog-grid">
          <label class="dialog-field">
            <span class="editor-field-label">Total Label</span>
            <input v-model="ctx.tableTotalLabel" class="editor-input" placeholder="Total" @change="ctx.saveToggle" />
          </label>
          <label class="dialog-field">
            <span class="editor-field-label">Label Column</span>
            <input v-model="ctx.tableTotalLabelColumn" class="editor-input" placeholder="Field, label, or index" @change="ctx.saveToggle" />
          </label>
          <label class="dialog-field dialog-field--full">
            <span class="editor-field-label">Total Columns</span>
            <input v-model="ctx.tableTotalColumnsText" class="editor-input" placeholder="Optional comma-separated fields" @change="ctx.saveToggle" />
          </label>
        </div>
        <button type="button" class="add-btn" @click="ctx.addColumn">+ Add Column</button>
      </div>
      <div class="modal-footer">
        <span class="modal-footer-status" role="status">{{ ctx.localColumnCount }} column(s) selected</span>
        <button type="button" class="modal-cancel-btn" @click="ctx.applyColumnsDialog">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
