<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <template v-if="ctx.elementType === 'chart'">
<!-- Chart type -->
        <div class="editor-section">
          <label class="editor-field-label" for="el-chart-type">Chart Type</label>
          <select id="el-chart-type" v-model="ctx.elementChartType" class="editor-select" @change="ctx.submitElement">
            <template v-if="ctx.isPieChart">
              <option value="pie">Pie Chart</option>
              <option value="doughnut">Doughnut Chart</option>
            </template>
            <template v-else>
              <option value="bar">Bar Chart</option>
              <option value="column">Column Chart</option>
              <option value="line">Line Chart</option>
              <option value="area">Area Chart</option>
            </template>
          </select>
        </div>

        <!-- ── PIE / DOUGHNUT specific editor ───────────────────────── -->
        <template v-if="ctx.isPieChart">

          <!-- Category Field -->
          <div class="editor-section">
            <div class="section-header">Category (X) Field</div>
            <div class="editor-field-group">
              <label class="editor-field-label">Slice label field</label>
              <select v-model="ctx.xField" class="editor-select">
                <option value="">Select field…</option>
                <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
              </select>
            </div>
          </div>

          <div class="editor-section">
            <div class="section-header">Data Configuration</div>
            <div class="section-row">
              <span class="section-summary">
                <template v-if="ctx.valueField">
                  {{ ctx.pieValueFieldLabel }}
                  · {{ ctx.cardAggregationType }}
                </template>
                <template v-else>No metric configured</template>
                <template v-if="ctx.chartTopN"> · Top {{ ctx.chartTopN }}</template>
                <template v-else> · All slices</template>
              </span>
              <button type="button" class="manage-btn manage-btn--data" @click="ctx.openDataCfgDialog">Manage Data</button>
            </div>
          </div>

          <!-- Pie Styling -->
          <div class="editor-section">
            <div class="section-header">Chart Styling</div>
            <div class="section-row">
              <span class="section-summary">
                Legend: {{ ctx.chartLegendPosition }}
                <template v-if="ctx.chartShowDataLabels"> · Labels on</template>
              </span>
              <button type="button" class="manage-btn manage-btn--style" @click="ctx.openStylingDialog">Manage Styling</button>
            </div>
          </div>

          <!-- Calculated Fields -->
          <div class="editor-section">
            <div class="section-header">Calculated Fields</div>
            <div class="section-row">
              <span class="section-summary">{{ ctx.calculatedFieldCount }} fields defined</span>
              <button type="button" class="manage-btn manage-btn--calc" @click="ctx.showChartCalcDialog = true">Manage Fields</button>
            </div>
          </div>

        </template>

        <!-- ── BAR / LINE / AREA editor ─────────────────────────────── -->
        <template v-else>

          <!-- X-Axis Configuration -->
          <div class="editor-section">
            <div class="section-header">X-Axis Configuration</div>
            <div class="editor-field-group">
              <label class="editor-field-label">X Axis Field</label>
              <select v-model="ctx.xField" class="editor-select">
                <option value="">None</option>
                <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
              </select>
            </div>
            <div class="section-row">
              <span class="section-summary">Format labels, grouping &amp; sorting</span>
              <button type="button" class="manage-btn manage-btn--data" @click="ctx.openXAxisDialog">Format X-Axis</button>
            </div>
          </div>

          <!-- Y Series -->
          <div class="editor-section">
            <div class="section-header">Y Series (Measures)</div>
            <div class="section-row">
              <span class="section-summary">{{ ctx.seriesCount }} series defined</span>
              <button type="button" class="manage-btn manage-btn--data" @click="ctx.openSeriesDialog">Manage Series</button>
            </div>
            <div v-if="ctx.seriesCount > 0" class="section-list">
              <div v-for="s in ctx.chartSeriesSummaryLabels" :key="s" class="section-list-item">• {{ s }}</div>
            </div>
          </div>

          <!-- Series By (only when 1 series) -->
          <div v-if="ctx.seriesCount === 1" class="editor-section">
            <div class="section-header">Series By (Split Series)</div>
            <div class="editor-field-group">
              <label class="editor-field-label">Split by categorical field</label>
              <select v-model="ctx.valueField" class="editor-select">
                <option value="">None (Single Series)</option>
                <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
              </select>
            </div>
          </div>

          <!-- Chart Styling -->
          <div class="editor-section">
            <div class="section-header">Chart Styling</div>
            <div class="section-row">
              <span class="section-summary">
                Legend: {{ ctx.chartLegendPosition }}
                <template v-if="ctx.chartShowGrid"> · Grid on</template>
                <template v-if="ctx.chartShowDataLabels"> · Labels on</template>
                <template v-if="ctx.chartStackBars"> · Stacked</template>
              </span>
              <button type="button" class="manage-btn manage-btn--style" @click="ctx.openStylingDialog">Manage Styling</button>
            </div>
          </div>

          <!-- Data Configuration -->
          <div class="editor-section">
            <div class="section-header">Data Configuration</div>
            <div class="section-row">
              <span class="section-summary">
                <template v-if="ctx.chartSortBy">Sort: {{ ctx.chartSortBy }} {{ ctx.chartSortDirection }}</template>
                <template v-else-if="ctx.chartTopN">Top {{ ctx.chartTopN }}</template>
                <template v-else>No filters or limits</template>
              </span>
              <button type="button" class="manage-btn manage-btn--data" @click="ctx.openDataCfgDialog">Configure Filters &amp; Sorting</button>
            </div>
          </div>

          <!-- Axes -->
          <div class="editor-section">
            <div class="section-header">Axes Configuration</div>
            <div class="section-row">
              <span class="section-summary">
                <template v-if="ctx.chartXAxisLabel">X: {{ ctx.chartXAxisLabel }}</template>
                <template v-else>Default axis labels</template>
                <template v-if="ctx.chartEnableY2"> · Y2 on</template>
              </span>
              <button type="button" class="manage-btn manage-btn--data" @click="ctx.openAxesDialog">Manage Axes</button>
            </div>
          </div>

          <!-- Calculated Fields -->
          <div class="editor-section">
            <div class="section-header">Calculated Fields</div>
            <div class="section-row">
              <span class="section-summary">{{ ctx.calculatedFieldCount }} fields defined</span>
              <button type="button" class="manage-btn manage-btn--calc" @click="ctx.showChartCalcDialog = true">Manage Fields</button>
            </div>
          </div>

        </template>

        <div class="editor-section">
          <div class="section-header">Cross-Filtering</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.chartCrossFilterSummary }}</span>
            <button type="button" class="manage-btn manage-btn--config" @click="ctx.openCrossFilterDialog">Configure Targets</button>
          </div>
        </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
