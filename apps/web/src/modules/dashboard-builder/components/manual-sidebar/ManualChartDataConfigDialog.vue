<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showDataCfgDialog" class="modal-overlay" @click.self="ctx.showDataCfgDialog = false">
    <div class="modal-box">
      <div class="modal-header">
        <h4>Data Configuration</h4>
        <button type="button" class="modal-close" @click="ctx.showDataCfgDialog = false">&times;</button>
      </div>
      <div class="modal-body">
        <template v-if="ctx.isPieChart">
          <div class="dialog-field">
            <label class="editor-field-label">Metric field</label>
            <select v-model="ctx.valueField" class="editor-select">
              <option value="">Select field…</option>
              <option v-for="f in ctx.currentTableFields.filter(ctx.isNumericField)" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Aggregation</label>
            <select v-model="ctx.cardAggregationType" class="editor-select">
              <option value="sum">Sum</option>
              <option value="average">Average</option>
              <option value="count">Count</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Top N Slices</label>
            <input v-model.number="ctx.chartTopN" type="number" min="0" max="50" class="editor-input" placeholder="0 = show all" />
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Show Data Labels</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.chartShowDataLabels" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Label Format</label>
            <select v-model="ctx.cardFormatType" class="editor-select">
              <option value="value">Value</option>
              <option value="percentage">Percentage</option>
              <option value="both">Value &amp; Percentage</option>
              <option value="label">Label only</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Value Display Location</label>
            <select v-model="ctx.chartValueDisplay" class="editor-select">
              <option value="chart">Chart</option>
              <option value="legend">Legend</option>
              <option value="both">Both</option>
              <option value="none">None</option>
            </select>
          </div>
        </template>
        <template v-else>
          <div class="dialog-field">
            <label class="editor-field-label">Sort By</label>
            <select v-model="ctx.chartSortBy" class="editor-select">
              <option value="">None</option>
              <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Sort Direction</label>
            <select v-model="ctx.chartSortDirection" class="editor-select">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Top N Results</label>
            <input v-model.number="ctx.chartTopN" type="number" min="1" class="editor-input" placeholder="No limit" />
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Fill missing time buckets</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.chartFillMissingTimeBuckets" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <template v-if="ctx.chartFillMissingTimeBuckets">
            <div class="dialog-field">
              <label class="editor-field-label">Bucket Interval</label>
              <select v-model="ctx.chartTimeBucketInterval" class="editor-select">
                <option value="auto">Auto from period filter</option>
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </div>
            <div class="dialog-field">
              <label class="editor-field-label">Missing Bucket Value</label>
              <input v-model.number="ctx.chartTimeBucketFillValue" type="number" step="0.01" class="editor-input" placeholder="0" />
            </div>
          </template>
        </template>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.showDataCfgDialog = false; ctx.submitElement()">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
