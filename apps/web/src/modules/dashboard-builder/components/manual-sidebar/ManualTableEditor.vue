<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <template v-if="ctx.elementType === 'table'">
<!-- Columns -->
        <div class="editor-section">
          <div class="section-header">Columns</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.tableColumnCount }} column(s) configured</span>
            <button type="button" class="manage-btn manage-btn--data" @click="ctx.openColumnsDialog">Manage Columns</button>
          </div>
          <div v-if="ctx.tableColumnCount > 0" class="section-list">
            <div
              v-for="(column, index) in ctx.tableConfiguredColumns"
              :key="`${column.field}-${index}`"
              class="section-list-item"
            >
              • {{ column.label || ctx.seriesFieldLabel(column.field) }}
            </div>
          </div>
        </div>

        <!-- Period rows -->
        <div class="editor-section">
          <div class="section-header">Period Rows</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.tablePeriodRowsSummary }}</span>
            <button type="button" class="manage-btn manage-btn--config" @click="ctx.showPeriodRowsDialog = true">Manage Rows</button>
          </div>
        </div>

        <!-- Table Styling -->
        <div class="editor-section">
          <div class="section-header">Table Styling</div>
          <div class="section-row">
            <span class="section-summary">Colors &amp; borders</span>
            <button type="button" class="manage-btn manage-btn--style" @click="ctx.openTableStylingDialog">Manage Styling</button>
          </div>
        </div>

        <!-- Height -->
        <div class="editor-section">
          <div class="section-header">Height</div>
          <div class="manual-field">
            <label class="manual-field-label" for="table-height-mode">Table Height</label>
            <select id="table-height-mode" v-model="ctx.tableHeightMode" class="editor-select" @change="ctx.submitElement">
              <option value="fixed">Fixed canvas height</option>
              <option value="auto-content">Content-aware height</option>
            </select>
          </div>
          <p class="section-help">
            Content-aware height measures the rendered table in view and embed mode, then pushes lower components down.
          </p>
        </div>

        <!-- Pagination -->
        <div class="editor-section">
          <div class="section-header">Pagination</div>
          <div class="section-row">
            <span class="section-summary">
              <template v-if="ctx.tableEnablePagination">{{ ctx.tablePageSize }} rows/page</template>
              <template v-else>Showing all rows</template>
            </span>
            <button type="button" class="manage-btn manage-btn--config" @click="ctx.showPaginationDialog = true">Manage Pagination</button>
          </div>
        </div>

        <!-- Table Features (inline toggles) -->
        <div class="editor-section">
          <div class="section-header">Table Features</div>
          <div class="toggle-row">
            <span class="toggle-label">Global Search</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.tableEnableSearch" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Column Filters</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.tableEnableFilters" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Sorting</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.tableEnableSorting" @change="ctx.saveToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Row Grouping -->
        <div class="editor-section">
          <div class="section-header">Row Grouping</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.parseList(ctx.tableGroupFieldsText).length }} group field(s)</span>
            <button type="button" class="manage-btn manage-btn--data" @click="ctx.openGroupingDialog">Manage Grouping</button>
          </div>
        </div>

        <!-- Conditional Formatting -->
        <div class="editor-section">
          <div class="section-header">Conditional Formatting</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.tableCondFmtCount }} rule(s)</span>
            <button type="button" class="manage-btn manage-btn--calc" @click="ctx.showCondFmtDialog = true">Manage Rules</button>
          </div>
        </div>

        <!-- Calculated Fields -->
        <div class="editor-section">
          <div class="section-header">Calculated Fields</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.calculatedFieldCount }} fields defined</span>
            <button type="button" class="manage-btn manage-btn--calc" @click="ctx.showTableCalcDialog = true">Manage Fields</button>
          </div>
        </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
