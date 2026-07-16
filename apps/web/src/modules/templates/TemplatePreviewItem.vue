<script setup lang="ts">
import type { DashboardTemplateDefinition, TemplateCardDefinition, TemplatePreviewItem } from './template-definitions';
import TemplateMatrixPreview from './TemplateMatrixPreview.vue';

interface PreviewRow {
  category: string;
  date: string;
  metric: number;
  metricAlt: number;
}

const props = defineProps<{
  index: number;
  item: TemplatePreviewItem;
  template: DashboardTemplateDefinition;
}>();

const previewRows: PreviewRow[] = [
  { date: 'Mon', category: 'Online', metric: 1200, metricAlt: 900 },
  { date: 'Tue', category: 'Retail', metric: 1900, metricAlt: 1400 },
  { date: 'Wed', category: 'Wholesale', metric: 1400, metricAlt: 1200 },
  { date: 'Thu', category: 'Online', metric: 2100, metricAlt: 1600 },
  { date: 'Fri', category: 'Retail', metric: 1800, metricAlt: 1300 },
  { date: 'Sat', category: 'Wholesale', metric: 2400, metricAlt: 1800 },
  { date: 'Sun', category: 'Online', metric: 2000, metricAlt: 1500 }
];

const tableRows = previewRows.slice(0, 4);

function itemStyle(item: TemplatePreviewItem): Record<string, string> {
  const style: Record<string, string> = {
    gridColumn: item.columnStart ? `${item.columnStart} / span ${item.span}` : `span ${item.span}`
  };
  if (item.rowStart) style.gridRow = item.rowSpan ? `${item.rowStart} / span ${item.rowSpan}` : `${item.rowStart}`;
  return style;
}

function cardFor(item: TemplatePreviewItem): TemplateCardDefinition {
  return props.template.cards[item.cardIndex || 0] ?? { label: 'Metric', value: 0 };
}

function chartLabel(item: TemplatePreviewItem): string {
  const labels: Record<TemplatePreviewItem['type'], string> = {
    area: 'Area Trend',
    bar: 'Category Comparison',
    card: 'Metric',
    column: 'Column Comparison',
    doughnut: 'Mix Breakdown',
    line: 'Trend',
    matrix: item.variant === 'professional' ? 'Insight Matrix' : 'Heat Map',
    pie: 'Share Breakdown',
    stack: 'Revenue Signals',
    table: 'Detail Table'
  };
  return labels[item.type];
}

function formatValue(value: number): string {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function linePoints(): { x: number; y: number }[] {
  const values = previewRows.map(row => row.metric);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((value, index) => ({
    x: 58 + index * 34,
    y: 128 - ((value - min) / Math.max(1, max - min)) * 88
  }));
}

function linePointString(): string {
  return linePoints().map(point => `${point.x},${point.y}`).join(' ');
}

function areaPointString(): string {
  return `58,142 ${linePointString()} 262,142`;
}

function barWidth(row: PreviewRow): number {
  const max = Math.max(...previewRows.map(item => item.metric));
  return Math.round((row.metric / max) * 142);
}

function columnHeight(row: PreviewRow): number {
  const values = previewRows.map(item => item.metric);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ratio = (row.metric - min) / Math.max(1, max - min);
  return Math.round(36 + ratio * 76);
}

function pieBackground(): string {
  const values = previewRows.slice(0, 3).map(row => row.metric);
  const total = values.reduce((sum, value) => sum + value, 0);
  const first = Math.round((values[0] / total) * 100);
  const second = Math.round(((values[0] + values[1]) / total) * 100);
  return `conic-gradient(#3152ad 0 ${first}%, #6c8eee ${first}% ${second}%, #10b981 ${second}% 100%)`;
}
</script>

<template>
  <div
    class="template-preview-item"
    :class="`template-preview-item--${item.type}`"
    :style="itemStyle(item)"
  >
    <div v-if="item.type === 'card'" class="template-preview-card">
      <span>{{ cardFor(item).label }}</span>
      <strong>{{ formatValue(cardFor(item).value) }}</strong>
    </div>

    <div v-else-if="item.type === 'table'" class="template-table-panel" :class="{ 'is-alternate': item.tableStyle === 'alternate' }">
      <strong>{{ chartLabel(item) }}</strong>
      <table>
        <thead>
          <tr><th>Date</th><th>Category</th><th>Metric</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="`${row.date}-${row.category}`">
            <td>{{ row.date }}</td>
            <td>{{ row.category }}</td>
            <td>{{ formatValue(row.metric) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="item.type === 'matrix'" class="template-chart-panel">
      <TemplateMatrixPreview :title="chartLabel(item)" :variant="item.variant" />
    </div>

    <div v-else-if="item.type === 'stack'" class="template-preview-stack">
      <div class="template-preview-stack-item template-preview-stack-matrix">
        <TemplateMatrixPreview title="Heat Map" variant="heatmap" />
      </div>
      <div class="template-preview-stack-item template-preview-stack-area">
        <svg class="template-preview-chart-svg" viewBox="0 0 320 190" role="img" aria-label="Area trend preview">
          <g class="template-preview-gridlines">
            <line v-for="y in [40, 74, 108, 142]" :key="`stack-y-${y}`" x1="58" x2="278" :y1="y" :y2="y"></line>
          </g>
          <polygon :points="areaPointString()" fill="rgba(108, 142, 238, 0.18)"></polygon>
          <polyline :points="linePointString()" fill="none" stroke="#3152ad" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg>
      </div>
    </div>

    <div v-else-if="item.type === 'line' || item.type === 'area'" class="template-chart-panel" :class="`is-${item.type}`">
      <strong>{{ chartLabel(item) }}</strong>
      <svg class="template-preview-chart-svg" viewBox="0 0 320 190" role="img" :aria-label="`${chartLabel(item)} preview`">
        <g class="template-preview-gridlines">
          <line v-for="y in [40, 74, 108, 142]" :key="`line-y-${y}`" x1="58" x2="278" :y1="y" :y2="y"></line>
          <line v-for="x in [58, 92, 126, 160, 194, 228, 262]" :key="`line-x-${x}`" :x1="x" :x2="x" y1="40" y2="142"></line>
        </g>
        <g class="template-preview-axis-labels">
          <text x="20" y="44">2,400</text>
          <text x="20" y="78">2,000</text>
          <text x="20" y="112">1,600</text>
          <text x="20" y="146">1,200</text>
          <text v-for="(row, rowIndex) in previewRows" :key="`line-label-${row.date}`" :x="58 + rowIndex * 34" y="164" text-anchor="middle">{{ row.date }}</text>
          <text x="168" y="183" text-anchor="middle">Date</text>
          <text x="10" y="94" transform="rotate(-90 10 94)" text-anchor="middle">Metric</text>
        </g>
          <polygon v-if="item.type === 'area'" :points="areaPointString()" fill="rgba(108, 142, 238, 0.18)"></polygon>
          <polyline :points="linePointString()" fill="none" stroke="#3152ad" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
          <circle v-for="point in linePoints()" :key="`${point.x}-${point.y}`" :cx="point.x" :cy="point.y" r="3" fill="#6c8eee"></circle>
      </svg>
    </div>

    <div v-else-if="item.type === 'bar'" class="template-chart-panel is-bar">
      <strong>{{ chartLabel(item) }}</strong>
      <svg class="template-preview-chart-svg" viewBox="0 0 320 190" role="img" :aria-label="`${chartLabel(item)} preview`">
        <g class="template-preview-gridlines">
          <line v-for="x in [82, 126, 170, 214, 258]" :key="`bar-x-${x}`" :x1="x" :x2="x" y1="42" y2="138"></line>
          <line v-for="y in [58, 90, 122]" :key="`bar-y-${y}`" x1="82" x2="258" :y1="y" :y2="y"></line>
        </g>
        <g class="template-preview-axis-labels">
          <text x="50" y="63" text-anchor="end">Online</text>
          <text x="50" y="95" text-anchor="end">Retail</text>
          <text x="50" y="127" text-anchor="end">Wholesale</text>
          <text x="82" y="158" text-anchor="middle">0</text>
          <text x="126" y="158" text-anchor="middle">500</text>
          <text x="170" y="158" text-anchor="middle">1.0K</text>
          <text x="214" y="158" text-anchor="middle">1.5K</text>
          <text x="258" y="158" text-anchor="middle">2.0K</text>
          <text x="170" y="181" text-anchor="middle">Category</text>
          <text x="14" y="92" transform="rotate(-90 14 92)" text-anchor="middle">Metric</text>
        </g>
        <rect v-for="(row, rowIndex) in previewRows.slice(0, 3)" :key="row.category" x="82" :y="48 + rowIndex * 32" :width="barWidth(row)" height="15" rx="1" fill="#3152ad"></rect>
      </svg>
    </div>

    <div v-else-if="item.type === 'column'" class="template-chart-panel is-column">
      <strong>{{ chartLabel(item) }}</strong>
      <svg class="template-preview-chart-svg" viewBox="0 0 320 190" role="img" :aria-label="`${chartLabel(item)} preview`">
        <g class="template-preview-gridlines">
          <line v-for="y in [40, 74, 108, 142]" :key="`column-y-${y}`" x1="58" x2="278" :y1="y" :y2="y"></line>
        </g>
        <g class="template-preview-axis-labels">
          <text v-for="(row, rowIndex) in previewRows" :key="`column-label-${row.date}`" :x="58 + rowIndex * 34" y="164" text-anchor="middle">{{ row.date }}</text>
          <text x="168" y="183" text-anchor="middle">Date</text>
        </g>
        <rect v-for="(row, rowIndex) in previewRows" :key="row.date" :x="48 + rowIndex * 34" :y="142 - columnHeight(row)" width="20" :height="columnHeight(row)" rx="3" fill="#3152ad"></rect>
      </svg>
    </div>

    <div v-else class="template-chart-panel" :class="`is-${item.type}`">
      <strong>{{ chartLabel(item) }}</strong>
      <div v-if="item.type === 'pie' || item.type === 'doughnut'" class="template-preview-pie-wrap">
        <span class="template-preview-pie" :class="{ 'is-doughnut': item.type === 'doughnut' }" :style="{ background: pieBackground() }"></span>
        <ol>
          <li v-for="row in previewRows.slice(0, 3)" :key="row.category">
            <span>{{ row.category }}</span>
            <b>{{ formatValue(row.metric) }}</b>
          </li>
        </ol>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-preview-card {
  align-content: stretch;
  gap: 0;
  overflow: hidden;
  padding: 0;
}

.template-preview-card span,
.template-preview-card strong {
  align-items: center;
  display: flex;
  justify-content: center;
}

.template-preview-card span {
  background: #dbeafe;
  color: #1e3a8a;
  font-weight: 800;
  min-height: 50%;
}

.template-preview-card strong {
  background: #fff;
  min-height: 50%;
}

.template-chart-panel {
  align-items: stretch;
  display: grid;
  gap: 4px;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.template-preview-chart-svg {
  height: 100%;
  min-height: 0;
  width: 100%;
}

.template-preview-gridlines line {
  stroke: #d9e2ef;
  stroke-width: 1;
}

.template-preview-axis-labels {
  fill: #334155;
  font-size: 9px;
}

.template-preview-pie-wrap {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(74px, 0.8fr) minmax(0, 1fr);
}

.template-preview-pie {
  aspect-ratio: 1;
  border-radius: 50%;
  display: block;
}

.template-preview-pie.is-doughnut {
  box-shadow: inset 0 0 0 18px #fff;
}

.template-preview-pie-wrap ol {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.template-preview-pie-wrap li {
  display: flex;
  font-size: 11px;
  justify-content: space-between;
}

.template-table-panel {
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.template-table-panel table {
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
}

.template-table-panel th,
.template-table-panel td {
  border-bottom: 1px solid #e2e8f0;
  padding: 6px 4px;
  text-align: left;
}

.template-table-panel.is-alternate tbody tr:nth-child(odd) {
  background: #f8fafc;
}

</style>
