<script setup lang="ts">
import ManualCalculatedFieldsDialog from '../editor/ManualCalculatedFieldsDialog.vue';
import ManualCardSupportingMetricControls from './ManualCardSupportingMetricControls.vue';
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>
<template>
<!-- ================================================================
         CARD DIALOGS
    ================================================================ -->
    <!-- Card Value Dialog -->
    <div v-if="ctx.showCardValueDialog" class="modal-overlay" @click.self="ctx.showCardValueDialog = false; ctx.submitElement()">
      <div class="modal-box modal-box--wide">
        <div class="modal-header">
          <h4>Value Configuration</h4>
          <button type="button" class="modal-close" @click="ctx.showCardValueDialog = false; ctx.submitElement()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="dialog-field">
            <label class="editor-field-label">Value Field</label>
            <select v-model="ctx.cardYField" class="editor-select">
              <option value="">Select field…</option>
              <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Aggregation</label>
            <select v-model="ctx.cardAggregationType" class="editor-select">
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
              <option value="countDistinct">Count Distinct</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
              <option value="first">First</option>
              <option value="last">Last</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Group By / Multi-card Field</label>
            <select v-model="ctx.xField" class="editor-select">
              <option value="">Single card</option>
              <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
          </div>
          <div v-if="ctx.xField" class="dialog-field">
            <label class="editor-field-label">Grid Columns</label>
            <input v-model.number="ctx.cardGridColumns" type="number" min="1" max="6" class="editor-input" />
          </div>
          <div class="dialog-two-col">
            <div class="dialog-field">
              <label class="editor-field-label">Outer Gap</label>
              <select v-model="ctx.cardOuterGap" class="editor-select">
                <option value="">Default</option>
                <option value="none">No Gap</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div v-if="ctx.xField" class="dialog-field">
              <label class="editor-field-label">Inner Gap</label>
              <select v-model="ctx.cardInnerGap" class="editor-select">
                <option value="">Default</option>
                <option value="none">No Gap</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Format Type</label>
            <select v-model="ctx.cardFormatType" class="editor-select">
              <option value="number">Number</option>
              <option value="currency">Currency</option>
              <option value="percentage">Percentage</option>
              <option value="text">Text</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Unit</label>
            <select v-model="ctx.cardUnit" class="editor-select">
              <option value="auto">Auto</option>
              <option value="ones">Ones</option>
              <option value="thousand">Thousands (K)</option>
              <option value="million">Millions (M)</option>
              <option value="billion">Billions (B)</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Decimal Places</label>
            <input v-model.number="ctx.cardPrecision" type="number" min="0" max="10" class="editor-input" />
          </div>
          <div class="dialog-two-col">
            <div class="dialog-field">
              <label class="editor-field-label">Prefix</label>
              <input v-model="ctx.cardPrefix" class="editor-input" placeholder="e.g. $" />
            </div>
            <div class="dialog-field">
              <label class="editor-field-label">Suffix</label>
              <input v-model="ctx.cardSuffix" class="editor-input" placeholder="e.g. %" />
            </div>
          </div>
          <div v-if="ctx.cardFormatType === 'currency'" class="dialog-field">
            <label class="editor-field-label">Currency Symbol</label>
            <input v-model="ctx.cardCurrencySymbol" class="editor-input" placeholder="$" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-cancel-btn" @click="ctx.showCardValueDialog = false; ctx.submitElement()">Close</button>
        </div>
      </div>
    </div>
    <!-- Card Title Dialog -->
    <div v-if="ctx.showCardTitleDialog" class="modal-overlay" @click.self="ctx.showCardTitleDialog = false; ctx.submitElement()">
      <div class="modal-box">
        <div class="modal-header">
          <h4>Title Configuration</h4>
          <button type="button" class="modal-close" @click="ctx.showCardTitleDialog = false; ctx.submitElement()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="toggle-row">
            <span class="toggle-label">Show Outer Title</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.cardShowWrapperTitle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="dialog-field">
            <ManualTextField
              v-model="ctx.cardTitle"
              label="Card Title"
              placeholder="Enter card title"
            />
          </div>
          <div class="dialog-two-col">
            <div class="dialog-field">
              <label class="editor-field-label">Title Size</label>
              <select v-model="ctx.cardTitleFontSize" class="editor-select">
                <option value="xs">Extra Small</option>
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
                <option value="xl">Extra Large</option>
              </select>
            </div>
            <div class="dialog-field">
              <label class="editor-field-label">Value Size</label>
              <select v-model="ctx.cardValueFontSize" class="editor-select">
                <option value="sm">Small</option>
                <option value="xl">Large</option>
                <option value="2xl">2XL</option>
                <option value="3xl">3XL</option>
                <option value="4xl">4XL</option>
              </select>
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Title Position</label>
            <select v-model="ctx.cardTitlePosition" class="editor-select">
              <option value="none">None</option>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-cancel-btn" @click="ctx.showCardTitleDialog = false; ctx.submitElement()">Close</button>
        </div>
      </div>
    </div>
    <!-- Card Features Dialog -->
    <div v-if="ctx.showCardFeaturesDialog" class="modal-overlay" @click.self="ctx.showCardFeaturesDialog = false; ctx.submitElement()">
      <div class="modal-box">
        <div class="modal-header">
          <h4>Visual Features</h4>
          <button type="button" class="modal-close" @click="ctx.showCardFeaturesDialog = false; ctx.submitElement()">&times;</button>
        </div>
        <div class="modal-body">
          <ManualCardSupportingMetricControls />
          <div class="toggle-row">
            <span class="toggle-label">Trend Indicator</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.cardShowTrend" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div v-if="ctx.cardShowTrend" class="dialog-field dialog-indent">
            <label class="editor-field-label">Trend Field</label>
            <select v-model="ctx.cardTrendField" class="editor-select">
              <option value="">Auto-calculate</option>
              <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
          </div>
          <div v-if="ctx.cardShowTrend" class="dialog-field dialog-indent">
            <label class="editor-field-label">Comparison Field</label>
            <select v-model="ctx.cardComparisonField" class="editor-select">
              <option value="">Use trend field / previous value</option>
              <option v-for="f in ctx.currentTableFields" :key="`comparison-${f.name}`" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
          </div>
          <div v-if="ctx.cardShowTrend" class="dialog-field dialog-indent">
            <label class="editor-field-label">Comparison Display</label>
            <select v-model="ctx.cardComparisonDisplayMode" class="editor-select">
              <option value="both">Amount and Percent</option>
              <option value="percentage">Percent Change</option>
              <option value="amount">Amount Change</option>
              <option value="value">Comparison Value</option>
            </select>
          </div>
          <div v-if="ctx.cardShowTrend" class="dialog-field dialog-indent">
            <label class="editor-field-label">Comparison Direction</label>
            <select v-model="ctx.cardComparisonDirection" class="editor-select">
              <option value="higher-is-better">Higher is Better</option>
              <option value="lower-is-better">Lower is Better</option>
              <option value="none">No Color Direction</option>
            </select>
          </div>
          <div v-if="ctx.cardShowTrend" class="dialog-field dialog-indent">
            <label class="editor-field-label">Comparison Context</label>
            <input v-model="ctx.cardComparisonContext" class="editor-input" placeholder="from prior month" />
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Sparkline</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.cardShowSparkline" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <template v-if="ctx.cardShowSparkline">
            <div class="dialog-field dialog-indent">
              <label class="editor-field-label">Sparkline Field</label>
              <select v-model="ctx.cardSparklineField" class="editor-select">
                <option value="">Select field…</option>
                <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
              </select>
            </div>
            <div class="dialog-field dialog-indent">
              <label class="editor-field-label">Sparkline Type</label>
              <select v-model="ctx.cardSparklineType" class="editor-select">
                <option value="area">Area</option>
                <option value="line">Line</option>
                <option value="column">Column</option>
              </select>
            </div>
            <div class="dialog-field dialog-indent">
              <label class="editor-field-label">Sparkline Color</label>
              <div class="color-row">
                <input type="color" v-model="ctx.cardSparklineColor" class="color-swatch" />
                <input v-model="ctx.cardSparklineColor" class="editor-input color-hex" placeholder="#3b82f6" />
              </div>
            </div>
            <div class="toggle-row dialog-indent">
              <span class="toggle-label">Show Min/Max/Avg Points</span>
              <label class="toggle-switch">
                <input type="checkbox" v-model="ctx.cardShowMinMaxAvg" />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </template>
          <div class="toggle-row">
            <span class="toggle-label">Status Indicator</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="ctx.cardShowIndicator" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <template v-if="ctx.cardShowIndicator">
            <div class="dialog-field dialog-indent">
              <label class="editor-field-label">Status Source</label>
              <select v-model="ctx.cardStatusIndicatorMode" class="editor-select">
                <option value="trend">Trend</option>
                <option value="threshold">Thresholds</option>
              </select>
            </div>
            <template v-if="ctx.cardStatusIndicatorMode === 'threshold'">
              <div class="dialog-field dialog-indent">
                <label class="editor-field-label">Evaluation</label>
                <select v-model="ctx.cardStatusIndicatorPolarity" class="editor-select">
                  <option value="higher-is-better">Higher is Better</option>
                  <option value="lower-is-better">Lower is Better</option>
                </select>
              </div>
              <div class="dialog-two-col dialog-indent">
                <div class="dialog-field">
                  <label class="editor-field-label">Good Threshold</label>
                  <input v-model.number="ctx.cardStatusIndicatorGoodThreshold" type="number" class="editor-input" placeholder="e.g. 12000" />
                </div>
                <div class="dialog-field">
                  <label class="editor-field-label">Warning Threshold</label>
                  <input v-model.number="ctx.cardStatusIndicatorWarningThreshold" type="number" class="editor-input" placeholder="e.g. 9000" />
                </div>
              </div>
            </template>
          </template>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-cancel-btn" @click="ctx.showCardFeaturesDialog = false; ctx.submitElement()">Close</button>
        </div>
      </div>
    </div>

    <!-- Card Color Dialog -->
    <div v-if="ctx.showCardColorDialog" class="modal-overlay" @click.self="ctx.showCardColorDialog = false; ctx.submitElement()">
      <div class="modal-box">
        <div class="modal-header">
          <h4>Color &amp; Style</h4>
          <button type="button" class="modal-close" @click="ctx.showCardColorDialog = false; ctx.submitElement()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="dialog-field">
            <label class="editor-field-label">Color Scheme</label>
            <select v-model="ctx.cardColorScheme" class="editor-select">
              <option value="">Default</option>
              <option value="info">Information</option>
              <option value="success">Healthy</option>
              <option value="warning">Watch</option>
              <option value="danger">Action required</option>
            </select>
          </div>
          <div class="dialog-two-col">
            <div class="dialog-field">
              <label class="editor-field-label" for="card-shadow-select">Card Shadow</label>
              <select id="card-shadow-select" v-model="ctx.cardShadow" class="editor-select">
                <option value="">Default</option>
                <option value="none">None</option>
                <option value="subtle">Subtle</option>
                <option value="medium">Medium</option>
                <option value="strong">Strong</option>
              </select>
            </div>
            <div class="dialog-field">
              <label class="editor-field-label" for="card-radius-input">Corner Radius</label>
              <input id="card-radius-input" v-model="ctx.cardBorderRadius" class="editor-input" placeholder="0, 8px, 0.75rem" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label" for="card-custom-class-input">Custom Class Name</label>
            <input id="card-custom-class-input" v-model="ctx.cardCustomClassName" class="editor-input" placeholder="executive-kpi" />
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Value Text Color</label>
            <div class="color-row">
              <input type="color" v-model="ctx.cardValueColor" class="color-swatch" />
              <input v-model="ctx.cardValueColor" class="editor-input color-hex" placeholder="#111827" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Card Background</label>
            <div class="color-row">
              <input type="color" v-model="ctx.cardBackgroundColor" class="color-swatch" />
              <input v-model="ctx.cardBackgroundColor" class="editor-input color-hex" placeholder="#ffffff" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Value Background</label>
            <div class="color-row">
              <input type="color" v-model="ctx.cardValueBackground" class="color-swatch" />
              <input v-model="ctx.cardValueBackground" class="editor-input color-hex" placeholder="#ffffff" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Title Background</label>
            <div class="color-row">
              <input type="color" v-model="ctx.cardTitleBackground" class="color-swatch" />
              <input v-model="ctx.cardTitleBackground" class="editor-input color-hex" placeholder="#f8fafc" />
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Title Text Color</label>
            <div class="color-row">
              <input type="color" v-model="ctx.cardTitleColor" class="color-swatch" />
              <input v-model="ctx.cardTitleColor" class="editor-input color-hex" placeholder="#111827" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-cancel-btn" @click="ctx.showCardColorDialog = false; ctx.submitElement()">Close</button>
        </div>
      </div>
    </div>

    <ManualCalculatedFieldsDialog
      v-model:open="ctx.showCardCalcDialog"
      v-model:fields-text="ctx.calculatedFieldsText"
      :available-fields="ctx.currentTableFields"
      :enable-format-option="true"
      :show-analytics-templates="true"
      :show-date-templates="false"
      title="Manage Calculated Fields"
      @apply="ctx.applyCardCalcDialog"
    />
</template>
<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
