<script setup lang="ts">
defineProps<{
  configuredFields: string[];
}>();

const cardTitle = defineModel<string>('cardTitle', { required: true });
const cardWrapperTitle = defineModel<string>('cardWrapperTitle', { required: true });
const cardShowWrapperTitle = defineModel<boolean>('cardShowWrapperTitle', { required: true });
const cardLayout = defineModel<string>('cardLayout', { required: true });
const cardType = defineModel<string>('cardType', { required: true });
const cardLayoutDesign = defineModel<string>('cardLayoutDesign', { required: true });
const cardLayoutPreset = defineModel<string>('cardLayoutPreset', { required: true });
const cardYField = defineModel<string>('cardYField', { required: true });
const cardValueFontSize = defineModel<string>('cardValueFontSize', { required: true });
const cardTrendField = defineModel<string>('cardTrendField', { required: true });
const cardComparisonField = defineModel<string>('cardComparisonField', { required: true });
const cardComparisonDisplayMode = defineModel<string>('cardComparisonDisplayMode', { required: true });
const cardComparisonDirection = defineModel<string>('cardComparisonDirection', { required: true });
const cardGridColumns = defineModel<number>('cardGridColumns', { required: true });
const cardTitlePosition = defineModel<string>('cardTitlePosition', { required: true });
const cardTitleFontSize = defineModel<string>('cardTitleFontSize', { required: true });
const cardBackgroundColor = defineModel<string>('cardBackgroundColor', { required: true });
const cardTitleBackground = defineModel<string>('cardTitleBackground', { required: true });
const cardTitleColor = defineModel<string>('cardTitleColor', { required: true });
const cardValueBackground = defineModel<string>('cardValueBackground', { required: true });
const cardValueColor = defineModel<string>('cardValueColor', { required: true });
const cardSparklineField = defineModel<string>('cardSparklineField', { required: true });
const cardSparklineColor = defineModel<string>('cardSparklineColor', { required: true });
const cardShowMinMaxAvg = defineModel<boolean>('cardShowMinMaxAvg', { required: true });
const cardFormatType = defineModel<string>('cardFormatType', { required: true });
const cardUnit = defineModel<string>('cardUnit', { required: true });
const cardPrecision = defineModel<number | null>('cardPrecision', { required: true });
const cardPrefix = defineModel<string>('cardPrefix', { required: true });
const cardSuffix = defineModel<string>('cardSuffix', { required: true });
const cardCurrencySymbol = defineModel<string>('cardCurrencySymbol', { required: true });
const cardAggregationType = defineModel<string>('cardAggregationType', { required: true });
const cardShowTrend = defineModel<boolean>('cardShowTrend', { required: true });
const cardShowIndicator = defineModel<boolean>('cardShowIndicator', { required: true });
const cardShowSparkline = defineModel<boolean>('cardShowSparkline', { required: true });
const cardTopRowContent = defineModel<string>('cardTopRowContent', { required: true });
const cardBottomRowContent = defineModel<string>('cardBottomRowContent', { required: true });
const cardRowHeightRatio = defineModel<string>('cardRowHeightRatio', { required: true });
</script>

<template>
  <fieldset class="visualization-control-group" aria-label="Card configuration">
    <legend>Card configuration</legend>
    <label for="card-title">Card title</label>
    <input id="card-title" v-model="cardTitle" placeholder="Metric summary">
    <label for="card-wrapper-title">Wrapper title</label>
    <input id="card-wrapper-title" v-model="cardWrapperTitle" placeholder="Key metric">
    <label class="inline-checkbox"><input v-model="cardShowWrapperTitle" type="checkbox"> Show outer title</label>
    <label for="card-type">Card type</label>
    <select id="card-type" v-model="cardType">
      <option value="standard">Standard</option>
      <option value="two-row">Two row</option>
    </select>
    <label for="card-layout">Card layout</label>
    <select id="card-layout" v-model="cardLayout">
      <option value="single">Single value</option>
      <option value="multi">Multi metric</option>
      <option value="grid">Grid</option>
      <option value="compact">Compact</option>
      <option value="two-row">Two row</option>
    </select>
    <label for="card-layout-design">Layout design</label>
    <select id="card-layout-design" v-model="cardLayoutDesign">
      <option value="standard">Standard</option>
      <option value="modern">Modern</option>
      <option value="card">Card</option>
      <option value="flat">Flat</option>
      <option value="tile">Tile</option>
      <option value="compact">Compact</option>
      <option value="simple">Simple</option>
      <option value="minimal">Minimal</option>
      <option value="hero">Hero</option>
      <option value="stat">Stat</option>
      <option value="value-only">Value only</option>
      <option value="value-trend-inline">Value and trend inline</option>
      <option value="value-trend-stacked">Value and trend stacked</option>
      <option value="value-sparkline">Value and sparkline</option>
      <option value="value-trend-sparkline">Value, trend, and sparkline</option>
    </select>
    <label for="card-layout-preset">Layout preset</label>
    <select id="card-layout-preset" v-model="cardLayoutPreset">
      <option value="default">Default</option>
      <option value="modern">Modern</option>
      <option value="card">Card</option>
      <option value="compact">Compact</option>
      <option value="hero">Hero</option>
      <option value="minimal">Minimal</option>
      <option value="executive">Executive</option>
      <option value="operational">Operational</option>
      <option value="comparison">Comparison</option>
    </select>
    <label for="card-y-field">Value field</label>
    <select id="card-y-field" v-model="cardYField">
      <option value="">Auto select</option>
      <option v-for="field in configuredFields" :key="`card-y-${field}`" :value="field">{{ field }}</option>
    </select>
    <label for="card-aggregation-type">Aggregation</label>
    <select id="card-aggregation-type" v-model="cardAggregationType">
      <option value="sum">Sum</option>
      <option value="avg">Average</option>
      <option value="count">Count</option>
      <option value="min">Min</option>
      <option value="max">Max</option>
      <option value="first">First</option>
      <option value="last">Last</option>
    </select>
    <label for="card-format-type">Format type</label>
    <select id="card-format-type" v-model="cardFormatType">
      <option value="number">Number</option>
      <option value="currency">Currency</option>
      <option value="percentage">Percentage</option>
      <option value="text">Text</option>
    </select>
    <label for="card-unit">Unit</label>
    <select id="card-unit" v-model="cardUnit">
      <option value="auto">Auto</option>
      <option value="ones">Ones</option>
      <option value="thousand">Thousand</option>
      <option value="million">Million</option>
      <option value="billion">Billion</option>
    </select>
    <label for="card-precision">Precision</label>
    <input id="card-precision" v-model.number="cardPrecision" type="number" min="0" max="6" placeholder="Auto">
    <label for="card-currency-symbol">Currency symbol</label>
    <input id="card-currency-symbol" v-model="cardCurrencySymbol" placeholder="$">
    <label for="card-prefix">Prefix</label>
    <input id="card-prefix" v-model="cardPrefix" placeholder="Before value">
    <label for="card-suffix">Suffix</label>
    <input id="card-suffix" v-model="cardSuffix" placeholder="After value">
    <label for="card-value-font-size">Value font size</label>
    <select id="card-value-font-size" v-model="cardValueFontSize">
      <option value="small">Small</option>
      <option value="medium">Medium</option>
      <option value="large">Large</option>
      <option value="x-large">Extra Large</option>
      <option value="xl">XL</option>
      <option value="2xl">2XL</option>
      <option value="3xl">3XL</option>
      <option value="4xl">4XL</option>
    </select>
    <label for="card-trend-field">Trend field</label>
    <select id="card-trend-field" v-model="cardTrendField">
      <option value="">None</option>
      <option v-for="field in configuredFields" :key="`card-trend-${field}`" :value="field">{{ field }}</option>
    </select>
    <label for="card-comparison-field">Comparison field</label>
    <select id="card-comparison-field" v-model="cardComparisonField">
      <option value="">None</option>
      <option v-for="field in configuredFields" :key="`card-compare-${field}`" :value="field">{{ field }}</option>
    </select>
    <label for="card-comparison-display">Comparison display</label>
    <select id="card-comparison-display" v-model="cardComparisonDisplayMode">
      <option value="both">Amount and percent</option>
      <option value="percentage">Percent change</option>
      <option value="amount">Amount change</option>
      <option value="value">Comparison value</option>
    </select>
    <label for="card-comparison-direction">Comparison direction</label>
    <select id="card-comparison-direction" v-model="cardComparisonDirection">
      <option value="higher-is-better">Higher is better</option>
      <option value="lower-is-better">Lower is better</option>
      <option value="none">No color direction</option>
    </select>
    <label for="card-grid-columns">Grid columns</label>
    <input id="card-grid-columns" v-model.number="cardGridColumns" type="number" min="1" max="6">
    <label for="card-title-position">Title position</label>
    <select id="card-title-position" v-model="cardTitlePosition">
      <option value="top">Top</option>
      <option value="middle">Middle</option>
      <option value="bottom">Bottom</option>
      <option value="none">None</option>
    </select>
    <label for="card-title-font-size">Title font size</label>
    <select id="card-title-font-size" v-model="cardTitleFontSize">
      <option value="small">Small</option>
      <option value="medium">Medium</option>
      <option value="large">Large</option>
      <option value="x-large">Extra Large</option>
      <option value="xs">XS</option>
      <option value="sm">SM</option>
      <option value="md">MD</option>
      <option value="lg">LG</option>
    </select>
    <label for="card-background-color">Background color</label>
    <input id="card-background-color" v-model="cardBackgroundColor" placeholder="#ffffff">
    <label for="card-title-background">Title background</label>
    <input id="card-title-background" v-model="cardTitleBackground" placeholder="#f9fafb">
    <label for="card-title-color">Title color</label>
    <input id="card-title-color" v-model="cardTitleColor" placeholder="#374151">
    <label for="card-value-background">Value background</label>
    <input id="card-value-background" v-model="cardValueBackground" placeholder="transparent">
    <label for="card-value-color">Value color</label>
    <input id="card-value-color" v-model="cardValueColor" placeholder="#111827">
    <label for="card-sparkline-field">Sparkline field</label>
    <select id="card-sparkline-field" v-model="cardSparklineField">
      <option value="">Use value field</option>
      <option v-for="field in configuredFields" :key="`card-spark-${field}`" :value="field">{{ field }}</option>
    </select>
    <label for="card-sparkline-color">Sparkline color</label>
    <input id="card-sparkline-color" v-model="cardSparklineColor" placeholder="#2563eb">
    <label class="inline-checkbox"><input v-model="cardShowTrend" type="checkbox"> Show trend</label>
    <label class="inline-checkbox"><input v-model="cardShowIndicator" type="checkbox"> Show indicator</label>
    <label class="inline-checkbox"><input v-model="cardShowSparkline" type="checkbox"> Show sparkline</label>
    <label class="inline-checkbox"><input v-model="cardShowMinMaxAvg" type="checkbox"> Show min/max/avg</label>
    <label for="card-top-row-content">Top row content</label>
    <input id="card-top-row-content" v-model="cardTopRowContent" placeholder="title, status">
    <label for="card-bottom-row-content">Bottom row content</label>
    <input id="card-bottom-row-content" v-model="cardBottomRowContent" placeholder="value, trend">
    <label for="card-row-height-ratio">Row height ratio</label>
    <input id="card-row-height-ratio" v-model="cardRowHeightRatio" placeholder="1:1">
  </fieldset>
</template>
