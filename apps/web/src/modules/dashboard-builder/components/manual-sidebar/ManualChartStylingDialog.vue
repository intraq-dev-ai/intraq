<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showStylingDialog" class="modal-overlay" @click.self="ctx.showStylingDialog = false">
    <div class="modal-box">
      <div class="modal-header">
        <h4>Chart Styling</h4>
        <button type="button" class="modal-close" @click="ctx.showStylingDialog = false">&times;</button>
      </div>
      <div class="modal-body">
        <div class="dialog-field">
          <label class="editor-field-label">Legend Position</label>
          <select v-model="ctx.chartLegendPosition" class="editor-select" :disabled="!ctx.showLegend">
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Legend Marker</label>
          <select v-model="ctx.chartLegendMarkerStyle" class="editor-select" :disabled="!ctx.showLegend">
            <option value="">Auto</option>
            <option value="box">Box</option>
            <option value="line-marker">Line marker</option>
            <option value="point">Point</option>
          </select>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show Legend</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.showLegend" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div v-if="ctx.isPieChart" class="dialog-field">
          <label class="editor-field-label">Legend Items Per Page</label>
          <input v-model.number="ctx.chartLegendItemsPerPage" type="number" min="0" max="50" class="editor-input" />
          <p class="dialog-help">Use 0 to show every legend item.</p>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show Tooltips</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.showTooltip" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show chart menu</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.chartShowExportMenu" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div v-if="ctx.chartShowExportMenu" class="series-format-card">
          <h5>Chart Menu Actions</h5>
          <div class="toggle-row">
            <span class="toggle-label">Print chart</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.chartExportPrint" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Download PNG image</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.chartExportPng" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Download JPEG image</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.chartExportJpeg" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Download PDF document</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.chartExportPdf" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Download SVG image</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.chartExportSvg" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div v-if="ctx.isPieChart" class="toggle-row">
          <span class="toggle-label">Show Data Labels</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.chartShowDataLabels" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div v-if="!ctx.isPieChart" class="toggle-row">
          <span class="toggle-label">Show Grid Lines</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.chartShowGrid" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div v-if="!ctx.isPieChart" class="toggle-row">
          <span class="toggle-label">Show Data Labels</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.chartShowDataLabels" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div v-if="ctx.chartShowDataLabels && !ctx.isPieChart" class="dialog-field">
          <label class="editor-field-label">Data Label Position</label>
          <select v-model="ctx.chartDataLabelPosition" class="editor-select">
            <option value="">Auto</option>
            <option value="outside-end">Outside End</option>
            <option value="inside-end">Inside End</option>
            <option value="inside-center">Inside Center</option>
            <option value="inside-start">Inside Start</option>
          </select>
        </div>
        <template v-if="!ctx.isPieChart">
          <div class="dialog-field">
            <label class="editor-field-label">Line Style</label>
            <select v-model="ctx.chartLineInterpolation" class="editor-select">
              <option value="curved">Curved</option>
              <option value="straight">Straight</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Curve Tension</label>
            <input v-model.number="ctx.chartLineTension" type="number" min="0" max="1" step="0.05" class="editor-input" placeholder="0.35" />
            <p class="dialog-help">Only applies to curved line and area series.</p>
          </div>
        </template>
        <div class="dialog-field">
          <label class="editor-field-label">Quick Theme</label>
          <select v-model="ctx.chartTheme" class="editor-select">
            <option value="">Default</option>
            <option value="minimal">Minimal</option>
            <option value="dark">Dark</option>
            <option value="colorful">Colorful</option>
          </select>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">{{ ctx.isPieChart ? 'Color Theme' : 'Palette' }}</label>
          <select v-model="ctx.chartColorTheme" class="editor-select">
            <option value="">{{ ctx.isPieChart ? 'Custom Colors' : 'Default' }}</option>
            <option value="default">Default</option>
            <option value="corporate">Corporate</option>
            <option value="monochrome">Monochrome</option>
            <option value="ocean">Ocean</option>
            <option value="pastel">Pastel</option>
            <option value="vibrant">Vibrant</option>
            <option value="forest">Forest</option>
            <option value="sunset">Sunset</option>
          </select>
        </div>
        <div v-if="ctx.isPieChart" class="dialog-field">
          <label class="editor-field-label">Slice Colors</label>
          <p class="dialog-help">Choose a theme for default slice colors, then override only the slices you want to customize.</p>
          <div v-if="ctx.pieSliceLabels.length > 0" class="series-editor-card">
            <div
              v-for="(label, index) in ctx.pieSliceLabels"
              :key="label"
              class="pie-slice-color-row"
            >
              <div class="pie-slice-color-row__label">{{ label }}</div>
              <div class="color-row pie-slice-color-row__controls">
                <input
                  type="color"
                  :value="ctx.pieSliceColorPreview(label, index)"
                  class="color-swatch"
                  :title="ctx.pieSliceColorPreview(label, index)"
                  @input="ctx.setPieSliceColor(label, ($event.target as HTMLInputElement).value)"
                />
                <input
                  :value="ctx.pieSliceColorPreview(label, index)"
                  class="editor-input color-hex"
                  readonly
                />
                <button
                  type="button"
                  class="color-reset-btn"
                  :disabled="!ctx.pieSliceColorHasOverride(label)"
                  @click="ctx.clearPieSliceColor(label)"
                >
                  Default
                </button>
              </div>
            </div>
          </div>
          <div v-else class="dialog-help pie-slice-colors-empty">
            Configure data source and X field to see slice colors.
          </div>
        </div>
        <div v-if="!ctx.isPieChart" class="toggle-row">
          <span class="toggle-label">Stack Bars</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.chartStackBars" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.showStylingDialog = false; ctx.submitElement()">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
