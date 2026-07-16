<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  chartType?: string;
  configuredFields: string[];
}>();

const chartLegendPosition = defineModel<string>('chartLegendPosition', { required: true });
const chartLegendMarkerStyle = defineModel<string>('chartLegendMarkerStyle', { required: true });
const chartLegendItemsPerPage = defineModel<number | null>('chartLegendItemsPerPage', { required: true });
const chartXAxisLabel = defineModel<string>('chartXAxisLabel', { required: true });
const chartXAxisDateFormat = defineModel<string>('chartXAxisDateFormat', { required: true });
const chartXAxisDateFormatParameter = defineModel<string>('chartXAxisDateFormatParameter', { required: true });
const chartXAxisDateFormatsText = defineModel<string>('chartXAxisDateFormatsText', { required: true });
const chartXAxisDateMidnightFormat = defineModel<string>('chartXAxisDateMidnightFormat', { required: true });
const chartXAxisDateMidnightFormatsText = defineModel<string>('chartXAxisDateMidnightFormatsText', { required: true });
const chartYAxisLabel = defineModel<string>('chartYAxisLabel', { required: true });
const chartYAxisStartMode = defineModel<'auto' | 'zero'>('chartYAxisStartMode', { required: true });
const chartYAxisPaddingMode = defineModel<'auto' | 'none' | 'zero-centered'>('chartYAxisPaddingMode', { required: true });
const chartYAxisPaddingRatio = defineModel<number | null>('chartYAxisPaddingRatio', { required: true });
const chartYAxisTickPadding = defineModel<number | null>('chartYAxisTickPadding', { required: true });
const chartYAxisTitlePadding = defineModel<number | null>('chartYAxisTitlePadding', { required: true });
const chartMixedAxisPrimaryHeadroomRatio = defineModel<number | null>('chartMixedAxisPrimaryHeadroomRatio', { required: true });
const chartEnableY2 = defineModel<boolean>('chartEnableY2', { required: true });
const chartY2AxisLabel = defineModel<string>('chartY2AxisLabel', { required: true });
const chartY2AxisStartMode = defineModel<'auto' | 'zero'>('chartY2AxisStartMode', { required: true });
const chartY2AxisPaddingMode = defineModel<'auto' | 'none' | 'zero-centered'>('chartY2AxisPaddingMode', { required: true });
const chartY2AxisPaddingRatio = defineModel<number | null>('chartY2AxisPaddingRatio', { required: true });
const chartLineInterpolation = defineModel<'curved' | 'straight'>('chartLineInterpolation', { required: true });
const chartLineTension = defineModel<number | null>('chartLineTension', { required: true });
const chartShowExportMenu = defineModel<boolean>('chartShowExportMenu', { required: true });
const chartExportPrint = defineModel<boolean>('chartExportPrint', { required: true });
const chartExportPng = defineModel<boolean>('chartExportPng', { required: true });
const chartExportJpeg = defineModel<boolean>('chartExportJpeg', { required: true });
const chartExportPdf = defineModel<boolean>('chartExportPdf', { required: true });
const chartExportSvg = defineModel<boolean>('chartExportSvg', { required: true });
const chartSpacingPreset = defineModel<string>('chartSpacingPreset', { required: true });
const chartPaddingTop = defineModel<number | null>('chartPaddingTop', { required: true });
const chartPaddingRight = defineModel<number | null>('chartPaddingRight', { required: true });
const chartPaddingBottom = defineModel<number | null>('chartPaddingBottom', { required: true });
const chartPaddingLeft = defineModel<number | null>('chartPaddingLeft', { required: true });
const chartFillMissingTimeBuckets = defineModel<boolean>('chartFillMissingTimeBuckets', { required: true });
const chartTimeBucketInterval = defineModel<'auto' | 'day' | 'hour' | 'month' | 'week'>('chartTimeBucketInterval', { required: true });
const chartTimeBucketFillValue = defineModel<number | null>('chartTimeBucketFillValue', { required: true });
const chartSortBy = defineModel<string>('chartSortBy', { required: true });
const chartSortDirection = defineModel<string>('chartSortDirection', { required: true });
const chartTopN = defineModel<number | null>('chartTopN', { required: true });
const chartSeriesLabelsText = defineModel<string>('chartSeriesLabelsText', { required: true });
const chartSeriesColorsText = defineModel<string>('chartSeriesColorsText', { required: true });
const chartSeriesTypesText = defineModel<string>('chartSeriesTypesText', { required: true });
const chartSeriesAxesText = defineModel<string>('chartSeriesAxesText', { required: true });
const chartShowGrid = defineModel<boolean>('chartShowGrid', { required: true });
const chartShowXAxis = defineModel<boolean>('chartShowXAxis', { required: true });
const chartShowYAxis = defineModel<boolean>('chartShowYAxis', { required: true });
const chartShowDataLabels = defineModel<boolean>('chartShowDataLabels', { required: true });
const chartStackBars = defineModel<boolean>('chartStackBars', { required: true });

const seriesLabels = computed(() => parseStringRecord(chartSeriesLabelsText.value));
const seriesColors = computed(() => parseStringRecord(chartSeriesColorsText.value));
const seriesTypes = computed(() => parseStringRecord(chartSeriesTypesText.value));
const seriesAxes = computed(() => parseStringRecord(chartSeriesAxesText.value));
const seriesFields = computed(() => Array.from(new Set([
  ...props.configuredFields,
  ...Object.keys(seriesLabels.value),
  ...Object.keys(seriesColors.value),
  ...Object.keys(seriesTypes.value),
  ...Object.keys(seriesAxes.value)
])).filter(Boolean));
const isPieChart = computed(() => {
  const chartType = props.chartType?.toLowerCase() ?? '';
  return chartType === 'pie' || chartType === 'doughnut' || chartType === 'donut';
});

function fieldControlId(field: string, control: string): string {
  return `chart-series-${control}-${field.replace(/[^a-z0-9_-]/gi, '-')}`;
}

function updateSeriesLabel(field: string, value: string): void {
  updateSeriesRecord('labels', field, value);
}

function updateSeriesColor(field: string, value: string): void {
  updateSeriesRecord('colors', field, value);
}

function updateSeriesType(field: string, value: string): void {
  updateSeriesRecord('types', field, value);
}

function updateSeriesAxis(field: string, value: string): void {
  updateSeriesRecord('axes', field, value);
}

function updateSeriesRecord(target: 'axes' | 'colors' | 'labels' | 'types', field: string, value: string): void {
  const model = {
    axes: chartSeriesAxesText,
    colors: chartSeriesColorsText,
    labels: chartSeriesLabelsText,
    types: chartSeriesTypesText
  }[target];
  const record = parseStringRecord(model.value);
  const trimmed = value.trim();
  if (trimmed) record[field] = trimmed;
  else delete record[field];
  model.value = Object.keys(record).length ? JSON.stringify(record, null, 2) : '';
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function parseStringRecord(source: string): Record<string, string> {
  const trimmed = source.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string'
      )
    );
  } catch {
    return {};
  }
}
</script>

<template>
  <fieldset class="visualization-control-group" aria-label="Chart configuration">
    <legend>Chart configuration</legend>
    <label for="chart-legend-position">Legend position</label>
    <select id="chart-legend-position" v-model="chartLegendPosition">
      <option value="top">Top</option>
      <option value="bottom">Bottom</option>
      <option value="left">Left</option>
      <option value="right">Right</option>
    </select>
    <label for="chart-legend-marker-style">Legend marker</label>
    <select id="chart-legend-marker-style" v-model="chartLegendMarkerStyle">
      <option value="">Auto</option>
      <option value="box">Box</option>
      <option value="line-marker">Line marker</option>
      <option value="point">Point</option>
    </select>
    <template v-if="isPieChart">
      <label for="chart-legend-items-per-page">Legend items per page</label>
      <input id="chart-legend-items-per-page" v-model.number="chartLegendItemsPerPage" type="number" min="0" max="50" placeholder="Auto">
      <p class="form-description">Use 0 to show every legend item.</p>
    </template>
    <label for="chart-x-axis-label">X axis label</label>
    <input id="chart-x-axis-label" v-model="chartXAxisLabel" placeholder="Dimension">
    <label for="chart-x-axis-date-format">X axis date format</label>
    <input id="chart-x-axis-date-format" v-model="chartXAxisDateFormat" placeholder="Auto">
    <label for="chart-x-axis-date-format-parameter">X axis date format parameter</label>
    <input id="chart-x-axis-date-format-parameter" v-model="chartXAxisDateFormatParameter" placeholder="rangeType">
    <label for="chart-x-axis-date-formats">X axis date formats JSON</label>
    <textarea id="chart-x-axis-date-formats" v-model="chartXAxisDateFormatsText" rows="3" placeholder='{"0":"HH:mm","1":"dddd (DD/MM)","2":"D"}'></textarea>
    <label for="chart-x-axis-date-midnight-format">X axis midnight date format</label>
    <input id="chart-x-axis-date-midnight-format" v-model="chartXAxisDateMidnightFormat" placeholder="Optional">
    <label for="chart-x-axis-date-midnight-formats">X axis midnight formats JSON</label>
    <textarea id="chart-x-axis-date-midnight-formats" v-model="chartXAxisDateMidnightFormatsText" rows="2" placeholder='{"0":"YYYY-MM-DD HH:mm"}'></textarea>
    <label for="chart-y-axis-label">Y axis label</label>
    <input id="chart-y-axis-label" v-model="chartYAxisLabel" placeholder="Metric">
    <label for="chart-line-interpolation">Line style</label>
    <select id="chart-line-interpolation" v-model="chartLineInterpolation">
      <option value="curved">Curved</option>
      <option value="straight">Straight</option>
    </select>
    <label for="chart-line-tension">Curve tension</label>
    <input id="chart-line-tension" v-model.number="chartLineTension" type="number" min="0" max="1" step="0.05" placeholder="0.35">
    <label class="inline-checkbox"><input v-model="chartShowExportMenu" type="checkbox"> Show chart menu</label>
    <template v-if="chartShowExportMenu">
      <label class="inline-checkbox"><input v-model="chartExportPrint" type="checkbox"> Print chart</label>
      <label class="inline-checkbox"><input v-model="chartExportPng" type="checkbox"> Download PNG image</label>
      <label class="inline-checkbox"><input v-model="chartExportJpeg" type="checkbox"> Download JPEG image</label>
      <label class="inline-checkbox"><input v-model="chartExportPdf" type="checkbox"> Download PDF document</label>
      <label class="inline-checkbox"><input v-model="chartExportSvg" type="checkbox"> Download SVG image</label>
    </template>
    <label class="inline-checkbox"><input v-model="chartFillMissingTimeBuckets" type="checkbox"> Fill missing time buckets</label>
    <template v-if="chartFillMissingTimeBuckets">
      <label for="chart-time-bucket-interval">Bucket interval</label>
      <select id="chart-time-bucket-interval" v-model="chartTimeBucketInterval">
        <option value="auto">Auto from period filter</option>
        <option value="hour">Hour</option>
        <option value="day">Day</option>
        <option value="week">Week</option>
        <option value="month">Month</option>
      </select>
      <label for="chart-time-bucket-fill-value">Missing bucket value</label>
      <input id="chart-time-bucket-fill-value" v-model.number="chartTimeBucketFillValue" type="number" step="0.01" placeholder="0">
    </template>
    <label for="chart-y-axis-start">Y axis start</label>
    <select id="chart-y-axis-start" v-model="chartYAxisStartMode">
      <option value="zero">Start at 0</option>
      <option value="auto">Auto</option>
    </select>
    <label for="chart-y-axis-padding-mode">Y axis padding</label>
    <select id="chart-y-axis-padding-mode" v-model="chartYAxisPaddingMode">
      <option value="none">Default</option>
      <option value="auto">Auto padding</option>
      <option value="zero-centered">Zero-centered</option>
    </select>
    <label for="chart-y-axis-padding-ratio">Y padding ratio</label>
    <input id="chart-y-axis-padding-ratio" v-model.number="chartYAxisPaddingRatio" type="number" min="0" max="2" step="0.05" placeholder="0.5">
    <label for="chart-y-axis-tick-padding">Y tick gap</label>
    <input id="chart-y-axis-tick-padding" v-model.number="chartYAxisTickPadding" type="number" min="0" max="40" step="1" placeholder="Auto">
    <label for="chart-y-axis-title-padding">Y title gap</label>
    <input id="chart-y-axis-title-padding" v-model.number="chartYAxisTitlePadding" type="number" min="0" max="40" step="1" placeholder="Auto">
    <label for="chart-spacing-preset">Chart spacing</label>
    <select id="chart-spacing-preset" v-model="chartSpacingPreset">
      <option value="">Default</option>
      <option value="highcharts">Highcharts</option>
      <option value="legacy">Legacy report</option>
    </select>
    <label for="chart-padding-top">Chart padding top</label>
    <input id="chart-padding-top" v-model.number="chartPaddingTop" type="number" min="0" max="80" step="1" placeholder="Auto">
    <label for="chart-padding-right">Chart padding right</label>
    <input id="chart-padding-right" v-model.number="chartPaddingRight" type="number" min="0" max="80" step="1" placeholder="Auto">
    <label for="chart-padding-bottom">Chart padding bottom</label>
    <input id="chart-padding-bottom" v-model.number="chartPaddingBottom" type="number" min="0" max="80" step="1" placeholder="Auto">
    <label for="chart-padding-left">Chart padding left</label>
    <input id="chart-padding-left" v-model.number="chartPaddingLeft" type="number" min="0" max="80" step="1" placeholder="Auto">
    <label class="inline-checkbox"><input v-model="chartEnableY2" type="checkbox"> Enable Y2 axis</label>
    <template v-if="chartEnableY2">
      <label for="chart-mixed-axis-primary-headroom-ratio">Mixed-axis Y headroom</label>
      <input id="chart-mixed-axis-primary-headroom-ratio" v-model.number="chartMixedAxisPrimaryHeadroomRatio" type="number" min="0" max="2" step="0.05" placeholder="0.6">
    </template>
    <label for="chart-y2-axis-label">Y2 axis label</label>
    <input id="chart-y2-axis-label" v-model="chartY2AxisLabel" placeholder="Secondary metric">
    <label for="chart-y2-axis-start">Y2 axis start</label>
    <select id="chart-y2-axis-start" v-model="chartY2AxisStartMode">
      <option value="zero">Start at 0</option>
      <option value="auto">Auto</option>
    </select>
    <label for="chart-y2-axis-padding-mode">Y2 axis padding</label>
    <select id="chart-y2-axis-padding-mode" v-model="chartY2AxisPaddingMode">
      <option value="none">Default</option>
      <option value="auto">Auto padding</option>
      <option value="zero-centered">Zero-centered</option>
    </select>
    <label for="chart-y2-axis-padding-ratio">Y2 padding ratio</label>
    <input id="chart-y2-axis-padding-ratio" v-model.number="chartY2AxisPaddingRatio" type="number" min="0" max="2" step="0.05" placeholder="0.5">
    <label for="chart-sort-by">Sort field</label>
    <select id="chart-sort-by" v-model="chartSortBy">
      <option value="">None</option>
      <option v-for="field in configuredFields" :key="`chart-sort-${field}`" :value="field">{{ field }}</option>
    </select>
    <label for="chart-sort-direction">Sort direction</label>
    <select id="chart-sort-direction" v-model="chartSortDirection">
      <option value="asc">Ascending</option>
      <option value="desc">Descending</option>
    </select>
    <label for="chart-top-n">Top N</label>
    <input id="chart-top-n" v-model.number="chartTopN" type="number" min="1" max="100" placeholder="No limit">
    <section class="chart-series-editor" aria-labelledby="chart-series-title">
      <div class="chart-series-heading">
        <h4 id="chart-series-title">Series settings</h4>
        <span>{{ seriesFields.length }} configured</span>
      </div>
      <p v-if="seriesFields.length === 0" class="chart-series-empty">
        Add measure fields to configure series labels, colors, chart type, and secondary-axis routing.
      </p>
      <div v-else class="chart-series-list">
        <article v-for="field in seriesFields" :key="field" class="chart-series-row">
          <div class="chart-series-field">
            <strong>{{ field }}</strong>
            <span>Series</span>
          </div>
          <label :for="fieldControlId(field, 'label')">
            Label
            <input
              :id="fieldControlId(field, 'label')"
              :value="seriesLabels[field] ?? ''"
              :aria-label="`Label for ${field}`"
              placeholder="Default label"
              @input="updateSeriesLabel(field, inputValue($event))"
            >
          </label>
          <label :for="fieldControlId(field, 'color')">
            Color
            <span class="chart-series-color-input">
              <span
                class="chart-series-color-swatch"
                :style="{ backgroundColor: seriesColors[field] || 'transparent' }"
                aria-hidden="true"
              ></span>
              <input
                :id="fieldControlId(field, 'color')"
                :value="seriesColors[field] ?? ''"
                :aria-label="`Color for ${field}`"
                placeholder="#2563eb"
                @input="updateSeriesColor(field, inputValue($event))"
              >
            </span>
          </label>
          <label :for="fieldControlId(field, 'type')">
            Type
            <select
              :id="fieldControlId(field, 'type')"
              :value="seriesTypes[field] ?? ''"
              :aria-label="`Type for ${field}`"
              @change="updateSeriesType(field, inputValue($event))"
            >
              <option value="">Chart default</option>
              <option value="bar">Bar</option>
              <option value="column">Column</option>
              <option value="line">Line</option>
              <option value="area">Area</option>
            </select>
          </label>
          <label :for="fieldControlId(field, 'axis')">
            Axis
            <select
              :id="fieldControlId(field, 'axis')"
              :value="seriesAxes[field] ?? ''"
              :aria-label="`Axis for ${field}`"
              @change="updateSeriesAxis(field, inputValue($event))"
            >
              <option value="">Primary</option>
              <option value="y">Primary Y</option>
              <option value="y2">Secondary Y2</option>
            </select>
          </label>
        </article>
      </div>
      <details class="chart-series-advanced-json">
        <summary>Advanced series JSON</summary>
        <label for="chart-series-labels">Series labels JSON</label>
        <textarea id="chart-series-labels" v-model="chartSeriesLabelsText" rows="3" placeholder='{"measure_field":"Metric"}'></textarea>
        <label for="chart-series-colors">Series colors JSON</label>
        <textarea id="chart-series-colors" v-model="chartSeriesColorsText" rows="3" placeholder='{"measure_field":"#2563eb"}'></textarea>
        <label for="chart-series-types">Series types JSON</label>
        <textarea id="chart-series-types" v-model="chartSeriesTypesText" rows="3" placeholder='{"secondary_measure":"line"}'></textarea>
        <label for="chart-series-axes">Series axes JSON</label>
        <textarea id="chart-series-axes" v-model="chartSeriesAxesText" rows="3" placeholder='{"secondary_measure":"y2"}'></textarea>
      </details>
    </section>
    <label class="inline-checkbox"><input v-model="chartShowGrid" type="checkbox"> Show grid</label>
    <label class="inline-checkbox"><input v-model="chartShowXAxis" type="checkbox"> Show X axis</label>
    <label class="inline-checkbox"><input v-model="chartShowYAxis" type="checkbox"> Show Y axis</label>
    <label class="inline-checkbox"><input v-model="chartShowDataLabels" type="checkbox"> Show data labels</label>
    <label class="inline-checkbox"><input v-model="chartStackBars" type="checkbox"> Stack bars</label>
  </fieldset>
</template>
