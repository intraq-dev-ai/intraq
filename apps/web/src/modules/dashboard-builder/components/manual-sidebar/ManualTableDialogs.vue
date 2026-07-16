<script setup lang="ts">
import ManualCalculatedFieldsDialog from '../editor/ManualCalculatedFieldsDialog.vue';
import ManualConditionalFormattingDialog from '../editor/ManualConditionalFormattingDialog.vue';
import ManualTableColumnsDialog from './ManualTableColumnsDialog.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
    <ManualTableColumnsDialog />

    <!-- Table Styling Dialog -->
    <div v-if="ctx.showTableStylingDialog" class="modal-overlay" @click.self="ctx.applyTableStylingDialog">
      <div class="modal-box">
        <div class="modal-header">
          <h4>Table Styling</h4>
          <button type="button" class="modal-close" @click="ctx.applyTableStylingDialog">&times;</button>
        </div>
        <div class="modal-body">
          <div class="dialog-field">
            <label class="editor-field-label">Table Format</label>
            <select v-model="ctx.localTableFormat" class="editor-select">
              <option value="">Default</option>
              <option value="striped">Striped</option>
              <option value="bordered">Bordered</option>
              <option value="minimal">Minimal</option>
              <option value="modern">Modern</option>
              <option value="corporate">Corporate</option>
              <option value="dark">Dark</option>
              <option value="colorful">Colorful</option>
              <option value="compact">Compact</option>
              <option value="spacious">Spacious</option>
              <option value="report">Report</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Hide Title</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.localTableHideTitle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Header Background</label>
            <div class="color-row">
              <input type="color" v-model="ctx.localTableHeaderBg" class="color-swatch" />
              <input v-model="ctx.localTableHeaderBg" class="editor-input color-hex" placeholder="#f8fafc" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Header Text Color</label>
            <div class="color-row">
              <input type="color" v-model="ctx.localTableHeaderText" class="color-swatch" />
              <input v-model="ctx.localTableHeaderText" class="editor-input color-hex" placeholder="#111827" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Row Background</label>
            <div class="color-row">
              <input type="color" v-model="ctx.localTableRowBg" class="color-swatch" />
              <input v-model="ctx.localTableRowBg" class="editor-input color-hex" placeholder="#ffffff" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Alternate Row Background</label>
            <div class="color-row">
              <input type="color" v-model="ctx.localTableAlternateRowBg" class="color-swatch" />
              <input v-model="ctx.localTableAlternateRowBg" class="editor-input color-hex" placeholder="#f9fafb" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Row Text Color</label>
            <div class="color-row">
              <input type="color" v-model="ctx.localTableRowText" class="color-swatch" />
              <input v-model="ctx.localTableRowText" class="editor-input color-hex" placeholder="#111827" />
            </div>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Show Borders</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.localTableShowBorders" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Border Color</label>
            <div class="color-row">
              <input type="color" v-model="ctx.localTableBorderColor" class="color-swatch" />
              <input v-model="ctx.localTableBorderColor" class="editor-input color-hex" placeholder="#e5e7eb" />
            </div>
          </div>
          <div class="dialog-two-col">
            <div class="dialog-field">
              <label class="editor-field-label">Border Radius</label>
              <select v-model="ctx.localTableBorderRadius" class="editor-select">
                <option value="0">None</option>
                <option value="4px">Small</option>
                <option value="8px">Medium</option>
                <option value="12px">Large</option>
              </select>
            </div>
            <div class="dialog-field">
              <label class="editor-field-label">Cell Padding</label>
              <select v-model="ctx.localTableCellPadding" class="editor-select">
                <option value="compact">Compact</option>
                <option value="medium">Medium</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Shadow</label>
            <select v-model="ctx.localTableShadow" class="editor-select">
              <option value="none">None</option>
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Display Mode</label>
            <select v-model="ctx.tableDisplayMode" class="editor-select">
              <option value="">Default</option>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-cancel-btn" @click="ctx.applyTableStylingDialog">Close</button>
        </div>
      </div>
    </div>

    <!-- Period Rows Dialog -->
    <div v-if="ctx.showPeriodRowsDialog" class="modal-overlay" @click.self="ctx.showPeriodRowsDialog = false; ctx.submitElement()">
      <div class="modal-box">
        <div class="modal-header">
          <h4>Manage Period Rows</h4>
          <button type="button" class="modal-close" @click="ctx.showPeriodRowsDialog = false; ctx.submitElement()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="dialog-field">
            <label class="editor-field-label">Row Source</label>
            <select v-model="ctx.tableDataMode" class="editor-select">
              <option value="raw">Raw rows from data source</option>
              <option value="series">Bucketed chart or period rows</option>
            </select>
            <p class="dialog-help">Use bucketed rows when the table should follow the same Day, Week, Month or Range buckets as a chart.</p>
          </div>
          <template v-if="ctx.tableDataMode === 'series'">
            <div class="toggle-row">
              <span class="toggle-label">Fill missing periods</span>
              <label class="toggle-switch">
                <input type="checkbox" v-model="ctx.tableFillMissingTimeBuckets" />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <template v-if="ctx.tableFillMissingTimeBuckets">
              <div class="dialog-field">
                <label class="editor-field-label">Bucket Interval</label>
                <select v-model="ctx.tableTimeBucketInterval" class="editor-select">
                  <option value="auto">Auto from period filter</option>
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>
              <div class="dialog-field">
                <label class="editor-field-label">Missing Bucket Value</label>
                <input v-model.number="ctx.tableTimeBucketFillValue" type="number" step="0.01" class="editor-input" placeholder="0" />
              </div>
            </template>
          </template>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-cancel-btn" @click="ctx.showPeriodRowsDialog = false; ctx.submitElement()">Close</button>
        </div>
      </div>
    </div>

    <!-- Pagination Dialog -->
    <div v-if="ctx.showPaginationDialog" class="modal-overlay" @click.self="ctx.showPaginationDialog = false; ctx.submitElement()">
      <div class="modal-box">
        <div class="modal-header">
          <h4>Manage Pagination</h4>
          <button type="button" class="modal-close" @click="ctx.showPaginationDialog = false; ctx.submitElement()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="toggle-row">
            <span class="toggle-label">Enable Pagination</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.tableEnablePagination" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div v-if="ctx.tableEnablePagination" class="dialog-field">
            <label class="editor-field-label">Rows Per Page</label>
            <select v-model.number="ctx.tablePageSize" class="editor-select">
              <option :value="5">5</option>
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-cancel-btn" @click="ctx.showPaginationDialog = false; ctx.submitElement()">Close</button>
        </div>
      </div>
    </div>

    <!-- Row Grouping Dialog -->
    <div v-if="ctx.showGroupingDialog" class="modal-overlay" @click.self="ctx.applyGroupingDialog">
      <div class="modal-box">
        <div class="modal-header">
          <h4>Manage Grouping</h4>
          <button type="button" class="modal-close" @click="ctx.applyGroupingDialog">&times;</button>
        </div>
        <div class="modal-body">
          <div class="dialog-field">
            <label class="editor-field-label">Group Fields</label>
            <div v-for="(gf, gi) in ctx.localGroupFields" :key="gi" class="field-row">
              <select v-model="ctx.localGroupFields[gi]" class="editor-select field-row-field">
                <option value="">Select field…</option>
                <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
              </select>
              <button type="button" class="remove-btn" @click="ctx.localGroupFields.splice(gi, 1)">&times;</button>
            </div>
            <button type="button" class="add-btn" @click="ctx.localGroupFields.push('')">+ Add Group</button>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Show Totals</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.localShowTotals" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Collapse by Default</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.localCollapse" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-cancel-btn" @click="ctx.applyGroupingDialog">Close</button>
        </div>
      </div>
    </div>

    <ManualConditionalFormattingDialog
      v-model:open="ctx.showCondFmtDialog"
      v-model:rules-text="ctx.tableConditionalFormattingText"
      :available-fields="ctx.currentTableFields"
      mode="table"
      @apply="ctx.applyTableCondFmtDialog"
    />

    <ManualCalculatedFieldsDialog
      v-model:open="ctx.showTableCalcDialog"
      v-model:fields-text="ctx.calculatedFieldsText"
      :available-fields="ctx.currentTableFields"
      :enable-filter-type="true"
      :enable-format-option="true"
      :show-analytics-templates="true"
      :show-date-templates="false"
      title="Manage Calculated Fields"
      @apply="ctx.applyTableCalcDialog"
    />

    
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
