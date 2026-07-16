<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <template v-if="ctx.elementType === 'matrix'">
<!-- Row Fields -->
        <div class="editor-section">
          <div class="section-header">Row Fields</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.matrixRowCount }} row field(s)</span>
            <button type="button" class="manage-btn manage-btn--data" @click="ctx.openMatrixRowsDialog">Manage Row Fields</button>
          </div>
          <div v-if="ctx.matrixRowCount > 0" class="section-list">
            <div v-for="field in ctx.matrixConfiguredRowFields" :key="field.field" class="section-list-item">
              • {{ field.label || ctx.seriesFieldLabel(field.field) }}
            </div>
          </div>
        </div>

        <!-- Column Fields -->
        <div class="editor-section">
          <div class="section-header">Column Fields</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.matrixColCount }} column field(s)</span>
            <button type="button" class="manage-btn manage-btn--data" @click="ctx.openMatrixColsDialog">Manage Column Fields</button>
          </div>
          <div v-if="ctx.matrixColCount > 0" class="section-list">
            <div v-for="field in ctx.matrixConfiguredColumnFields" :key="field.field" class="section-list-item">
              • {{ field.label || ctx.seriesFieldLabel(field.field) }}
            </div>
          </div>
        </div>

        <!-- Values -->
        <div class="editor-section">
          <div class="section-header">Values</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.matrixValueCount }} value(s)</span>
            <button type="button" class="manage-btn manage-btn--data" @click="ctx.openMatrixValuesDialog">Manage Values</button>
          </div>
          <div v-if="ctx.matrixValueCount > 0" class="section-list">
            <div v-for="(field, index) in ctx.matrixConfiguredValues" :key="field.entryKey ?? `${field.field}-${index}`" class="section-list-item">
              • {{ field.label || ctx.seriesFieldLabel(field.field) }}
            </div>
          </div>
        </div>

        <!-- Matrix Design -->
        <div class="editor-section">
          <div class="section-header">Matrix Design</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.tableFormat || 'default' }} format</span>
            <button type="button" class="manage-btn manage-btn--style" @click="ctx.showMatrixDesignDialog = true">Manage Styling</button>
          </div>
        </div>

        <div class="editor-section">
          <div class="section-header">Data Configuration</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.matrixFilterCount }} filter(s), {{ ctx.matrixRowSortCount + ctx.matrixColumnSortCount }} sort(s)</span>
            <button type="button" class="manage-btn manage-btn--data" @click="ctx.openMatrixFilterSortDialog">Configure Filters &amp; Sorting</button>
          </div>
        </div>

        <!-- Totals (inline toggles) -->
        <div class="editor-section">
          <div class="section-header">Totals</div>
          <div class="toggle-row">
            <span class="toggle-label">Show Row Totals</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.matrixShowRowTotals" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Show Column Totals</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.matrixShowColumnTotals" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Row Subtotals</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.matrixShowRowSubtotals" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Column Subtotals</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.matrixShowColumnSubtotals" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Collapse -->
        <div class="editor-section">
          <div class="section-header">Collapse</div>
          <div class="toggle-row">
            <span class="toggle-label">Enable Row Collapse</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.matrixEnableRowCollapse" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div v-if="ctx.matrixEnableRowCollapse" class="editor-field-group">
            <label class="editor-field-label">Row Default State</label>
            <select v-model="ctx.matrixDefaultRowCollapseState" class="editor-select">
              <option value="">Expanded</option>
              <option value="collapsed">Collapsed</option>
            </select>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Enable Column Collapse</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.matrixEnableColumnCollapse" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div v-if="ctx.matrixEnableColumnCollapse" class="editor-field-group">
            <label class="editor-field-label">Column Default State</label>
            <select v-model="ctx.matrixDefaultColumnCollapseState" class="editor-select">
              <option value="">Expanded</option>
              <option value="collapsed">Collapsed</option>
            </select>
          </div>
        </div>

        <!-- Conditional Formatting -->
        <div class="editor-section">
          <div class="section-header">Conditional Formatting</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.matrixCondFmtCount }} rule(s)</span>
            <button type="button" class="manage-btn manage-btn--calc" @click="ctx.showMatrixCondFmtDialog = true">Manage Rules</button>
          </div>
        </div>

        <!-- Calculated Fields -->
        <div class="editor-section">
          <div class="section-header">Calculated Fields</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.calculatedFieldCount }} fields defined</span>
            <button type="button" class="manage-btn manage-btn--calc" @click="ctx.showMatrixCalcDialog = true">Manage Fields</button>
          </div>
        </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
