<script setup lang="ts">
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showAxesDialog" class="modal-overlay" @click.self="ctx.showAxesDialog = false">
    <div class="modal-box">
      <div class="modal-header">
        <h4>Axes Configuration</h4>
        <button type="button" class="modal-close" @click="ctx.showAxesDialog = false">&times;</button>
      </div>
      <div class="modal-body">
        <div class="toggle-row">
          <span class="toggle-label">Show X Axis</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.chartShowXAxis" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show Y Axis</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.chartShowYAxis" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="dialog-field">
          <ManualTextField
            v-model="ctx.chartXAxisLabel"
            label="X Axis Label"
            placeholder="X axis label"
          />
        </div>
        <div class="dialog-field">
          <ManualTextField
            v-model="ctx.chartYAxisLabel"
            label="Y Axis Label"
            placeholder="Y axis label"
          />
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Primary Value Axis Start</label>
          <select v-model="ctx.chartYAxisStartMode" class="editor-select" aria-label="Primary Value Axis Start">
            <option value="zero">Start at 0</option>
            <option value="auto">Auto</option>
          </select>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Primary Axis Padding</label>
          <select v-model="ctx.chartYAxisPaddingMode" class="editor-select" aria-label="Primary Axis Padding">
            <option value="none">Default</option>
            <option value="auto">Auto padding</option>
            <option value="zero-centered">Zero-centered</option>
          </select>
          <p class="dialog-help">Zero-centered gives positive-only series breathing room below zero, similar to the legacy Highcharts reports.</p>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Primary Padding Ratio</label>
          <input v-model.number="ctx.chartYAxisPaddingRatio" type="number" min="0" max="2" step="0.05" class="editor-input" placeholder="0.5" />
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Y Tick Gap</label>
            <input v-model.number="ctx.chartYAxisTickPadding" type="number" min="0" max="40" step="1" class="editor-input" placeholder="Auto" />
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Y Title Gap</label>
            <input v-model.number="ctx.chartYAxisTitlePadding" type="number" min="0" max="40" step="1" class="editor-input" placeholder="Auto" />
          </div>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Chart Spacing</label>
          <select v-model="ctx.chartSpacingPreset" class="editor-select" aria-label="Chart Spacing">
            <option value="">Default</option>
            <option value="highcharts">Highcharts</option>
            <option value="legacy">Legacy report</option>
          </select>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Padding Top</label>
            <input v-model.number="ctx.chartPaddingTop" type="number" min="0" max="80" step="1" class="editor-input" placeholder="Auto" />
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Padding Right</label>
            <input v-model.number="ctx.chartPaddingRight" type="number" min="0" max="80" step="1" class="editor-input" placeholder="Auto" />
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Padding Bottom</label>
            <input v-model.number="ctx.chartPaddingBottom" type="number" min="0" max="80" step="1" class="editor-input" placeholder="Auto" />
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Padding Left</label>
            <input v-model.number="ctx.chartPaddingLeft" type="number" min="0" max="80" step="1" class="editor-input" placeholder="Auto" />
          </div>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Enable Y2 Axis</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.chartEnableY2" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div v-if="ctx.chartEnableY2" class="dialog-field">
          <label class="editor-field-label">Mixed-Axis Primary Headroom</label>
          <input v-model.number="ctx.chartMixedAxisPrimaryHeadroomRatio" type="number" min="0" max="2" step="0.05" class="editor-input" placeholder="0.6" />
          <p class="dialog-help">Controls extra top space added to the primary axis on mixed Y/Y2 bar and line charts. Use a smaller value when columns should nearly touch the top.</p>
        </div>
        <div v-if="ctx.chartEnableY2" class="dialog-field">
          <ManualTextField
            v-model="ctx.chartY2AxisLabel"
            label="Y2 Axis Label"
            placeholder="Y2 axis label"
          />
        </div>
        <div v-if="ctx.chartEnableY2" class="dialog-field">
          <label class="editor-field-label">Secondary Value Axis Start</label>
          <select v-model="ctx.chartY2AxisStartMode" class="editor-select" aria-label="Secondary Value Axis Start">
            <option value="zero">Start at 0</option>
            <option value="auto">Auto</option>
          </select>
        </div>
        <div v-if="ctx.chartEnableY2" class="dialog-field">
          <label class="editor-field-label">Secondary Axis Padding</label>
          <select v-model="ctx.chartY2AxisPaddingMode" class="editor-select" aria-label="Secondary Axis Padding">
            <option value="none">Default</option>
            <option value="auto">Auto padding</option>
            <option value="zero-centered">Zero-centered</option>
          </select>
        </div>
        <div v-if="ctx.chartEnableY2" class="dialog-field">
          <label class="editor-field-label">Secondary Padding Ratio</label>
          <input v-model.number="ctx.chartY2AxisPaddingRatio" type="number" min="0" max="2" step="0.05" class="editor-input" placeholder="0.5" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.showAxesDialog = false; ctx.submitElement()">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
