<script setup lang="ts">
import { computed } from 'vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
const featureSummary = computed(() => [
  ctx.cardSupportingField || ctx.cardSupportingLabel ? 'Supporting metric' : '',
  ctx.cardShowTrend ? 'Trend' : '',
  ctx.cardShowTrend && ctx.cardComparisonField ? 'Comparison' : '',
  ctx.cardShowSparkline ? 'Sparkline' : '',
  ctx.cardShowIndicator ? (ctx.cardStatusIndicatorMode === 'threshold' ? 'Thresholds' : 'Indicator') : ''
].filter(Boolean).join(' · ') || 'None enabled');
</script>

<template>
  <template v-if="ctx.elementType === 'card'">
<!-- Card Type -->
        <div class="editor-section">
          <label class="editor-field-label" for="card-type-sel">Card Type</label>
          <select id="card-type-sel" v-model="ctx.cardType" class="editor-select" @change="ctx.submitElement">
            <option value="standard">Standard</option>
            <option value="two-row">Two-Row</option>
            <option value="kpi">KPI</option>
          </select>
        </div>

        <!-- Layout Design -->
        <div class="editor-section">
          <label class="editor-field-label" for="card-design-sel">Layout Design</label>
          <select id="card-design-sel" v-model="ctx.cardLayoutDesign" class="editor-select" @change="ctx.submitElement">
            <option value="value-only">Value Only</option>
            <option value="value-trend-inline">Value &amp; Trend (Same Row)</option>
            <option value="value-trend-stacked">Value &amp; Trend (Stacked)</option>
            <option value="value-sparkline">Value &amp; Sparkline</option>
            <option value="value-trend-sparkline">Value, Trend &amp; Sparkline</option>
          </select>
        </div>

        <!-- Value Configuration -->
        <div class="editor-section">
          <div class="section-header">Value Configuration</div>
          <div class="section-row">
            <span class="section-summary">
              <template v-if="ctx.cardYField">{{ ctx.seriesFieldLabel(ctx.cardYField) }} · {{ ctx.cardAggregationType }}</template>
              <template v-else>No field selected</template>
            </span>
            <button type="button" class="manage-btn manage-btn--data" @click="ctx.showCardValueDialog = true">Manage Value</button>
          </div>
        </div>

        <!-- Title Configuration -->
        <div class="editor-section">
          <div class="section-header">Title Configuration</div>
          <div class="section-row">
            <span class="section-summary">
              <template v-if="ctx.cardTitle">{{ ctx.cardTitle }}</template>
              <template v-else>No title set</template>
            </span>
            <button type="button" class="manage-btn manage-btn--config" @click="ctx.showCardTitleDialog = true">Manage Title</button>
          </div>
        </div>

        <!-- Visual Features -->
        <div class="editor-section">
          <div class="section-header">Visual Features</div>
          <div class="section-row">
            <span class="section-summary">
              {{ featureSummary }}
            </span>
            <button type="button" class="manage-btn manage-btn--config" @click="ctx.showCardFeaturesDialog = true">Manage Features</button>
          </div>
        </div>

        <!-- Color & Style -->
        <div class="editor-section">
          <div class="section-header">Color &amp; Style</div>
          <div class="section-row">
            <span class="section-summary">Colors &amp; backgrounds</span>
            <button type="button" class="manage-btn manage-btn--style" @click="ctx.showCardColorDialog = true">Manage Style</button>
          </div>
        </div>

        <!-- Calculated Fields -->
        <div class="editor-section">
          <div class="section-header">Calculated Fields</div>
          <div class="section-row">
            <span class="section-summary">{{ ctx.calculatedFieldCount }} fields defined</span>
            <button type="button" class="manage-btn manage-btn--calc" @click="ctx.showCardCalcDialog = true">Manage Fields</button>
          </div>
        </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
