<script setup lang="ts">
import type { DashboardCardModel } from '../../visualization/element-view-model';
import type { DashboardCardContentToken, DashboardCardSparklineType } from '../../visualization/view-model-types';
import DashboardKpiSupportingMetric from './DashboardKpiSupportingMetric.vue';

defineProps<{
  elementName: string;
  hasStateMessage: boolean;
  isLoading: boolean;
  model: DashboardCardModel | null;
  stateDetail: string;
  stateTitle: string;
}>();

function sparklinePolyline(values: number[]): string {
  return sparklinePoints(values).map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

function sparklineAreaPath(values: number[]): string {
  const points = sparklinePoints(values);
  if (points.length === 0) return '';
  const line = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L ');
  return `M ${line} L ${points.at(-1)?.x.toFixed(1) ?? '120'},34 L ${points[0].x.toFixed(1)},34 Z`;
}

function sparklinePoints(values: number[]): Array<{ index: number; value: number; x: number; y: number }> {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? 60 : (index / (values.length - 1)) * 120;
    const y = 30 - ((value - min) / range) * 24;
    return { index, value, x, y: Math.max(3, Math.min(30, y)) };
  });
}

function sparklineKeyPoints(values: number[]): Array<{ className: string; label: string; point: { x: number; y: number } }> {
  const points = sparklinePoints(values);
  if (points.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const minPoint = points.find(point => point.value === min) ?? points[0];
  const maxPoint = points.find(point => point.value === max) ?? points[0];
  const keyPoints = [
    { className: 'start', label: 'Start', point: points[0] },
    { className: 'min', label: 'Min', point: minPoint },
    { className: 'max', label: 'Max', point: maxPoint }
  ];
  if (points.length > 1) keyPoints.push({ className: 'end', label: 'End', point: points[points.length - 1] });
  return keyPoints;
}

function sparklineColumns(values: number[]): Array<{ height: number; width: number; x: number; y: number }> {
  const points = sparklinePoints(values);
  if (points.length === 0) return [];
  const width = Math.max(6, 100 / Math.max(points.length, 1));
  return points.map(point => ({
    height: Math.max(2, 34 - point.y),
    width,
    x: Math.max(0, point.x - (width / 2)),
    y: point.y
  }));
}

function cardFontSize(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const configuredSizes: Record<string, string> = {
    large: '32px',
    medium: '24px',
    small: '16px',
    xs: '11px',
    sm: '12px',
    md: '14px',
    lg: '18px',
    xl: '22px',
    'x-large': '38px',
    '2xl': '26px',
    '3xl': '32px',
    '4xl': '38px'
  };
  if (configuredSizes[value]) return configuredSizes[value];
  return /^\d+(?:\.\d+)?(?:px|rem|em)$/.test(value) ? value : fallback;
}

function titleFontSize(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const configuredSizes: Record<string, string> = {
    large: '20px',
    medium: '16px',
    small: '14px',
    xs: '11px',
    sm: '12px',
    md: '14px',
    lg: '18px',
    xl: '22px',
    'x-large': '24px'
  };
  if (configuredSizes[value]) return configuredSizes[value];
  return /^\d+(?:\.\d+)?(?:px|rem|em)$/.test(value) ? value : fallback;
}

function cardGap(value: string | undefined, fallback: string): string {
  const gaps: Record<string, string> = {
    large: '16px',
    medium: '10px',
    none: '0',
    small: '6px'
  };
  return value ? (gaps[value] ?? fallback) : fallback;
}

function cardClass(model: DashboardCardModel | null): string[] {
  if (!model) return [];
  return [
    ...(model.isMulti ? ['is-multi'] : []),
    ...(model.outerGap ? [`outer-gap-${model.outerGap}`] : []),
    `trend-${model.trendDirection}`,
    `comparison-tone-${model.comparisonTone ?? 'default'}`,
    `scheme-${model.colorScheme ?? 'default'}`,
    ...(model.layoutMode ? [`layout-${model.layoutMode}`] : []),
    ...(model.customClassName ? [`dashboard-kpi-card--custom-${model.customClassName}`] : [])
  ];
}

function showKpiMeta(model: DashboardCardModel): boolean {
  if (model.layoutMode === 'value-only' || model.layoutMode === 'value-sparkline') return false;
  return (model.showTrend && kpiTrendLabels(model).length > 0) || Boolean(model.comparisonLabel);
}

function showKpiSparkline(model: DashboardCardModel): boolean {
  return model.showSparkline && model.sparkline.length > 0;
}

function sparklineType(model: DashboardCardModel): DashboardCardSparklineType {
  return model.sparklineType ?? 'area';
}

function showSparklineArea(model: DashboardCardModel): boolean {
  return sparklineType(model) === 'area';
}

function showSparklineLine(model: DashboardCardModel): boolean {
  return sparklineType(model) !== 'column';
}

function showSparklinePoints(model: DashboardCardModel): boolean {
  return sparklineType(model) !== 'column';
}

function isTwoRowCard(model: DashboardCardModel): boolean {
  return model.cardType === 'two-row' && Boolean(model.twoRow);
}

function defaultTitleFontSize(model: DashboardCardModel | null): string {
  return model?.cardType === 'two-row' ? '16px' : '12px';
}

function defaultTitleBackground(model: DashboardCardModel | null): string {
  return model?.cardType === 'two-row' ? 'color-mix(in srgb, var(--color-primary) 14%, var(--surface))' : 'transparent';
}

function defaultTitleColor(model: DashboardCardModel | null): string {
  return model?.cardType === 'two-row' ? 'var(--text-primary)' : 'var(--text-secondary)';
}

function defaultValueBackground(model: DashboardCardModel | null): string {
  return model?.cardType === 'two-row' ? 'var(--surface)' : 'transparent';
}

function defaultValueColor(model: DashboardCardModel | null): string {
  return 'var(--text-primary)';
}

function defaultValueFontSize(model: DashboardCardModel | null): string {
  return model?.cardType === 'two-row' ? '24px' : '32px';
}

function tokenLabel(token: DashboardCardContentToken, model: DashboardCardModel): string {
  const labels: Record<DashboardCardContentToken, string> = {
    comparison: model.comparisonLabel ? `vs ${model.comparisonLabel}` : '',
    delta: kpiTrendLabels(model).join(' / '),
    empty: '',
    sparkline: '',
    status: model.statusLabel,
    title: model.label,
    trend: kpiTrendLabels(model).join(' '),
    value: model.value
  };
  return labels[token];
}

function showTextToken(token: DashboardCardContentToken, model: DashboardCardModel): boolean {
  return token !== 'empty' && token !== 'sparkline' && Boolean(tokenLabel(token, model));
}

function segmentTrendLabel(segment: DashboardCardModel['segments'][number], model: DashboardCardModel): string {
  return segmentTrendLabels(segment, model.comparisonDisplayMode).join(' / ');
}

function segmentTrendDirection(segment: DashboardCardModel['segments'][number]): string {
  return segment.trendDirection ?? 'neutral';
}

function statusToneClass(tone: DashboardCardModel['statusTone'] | DashboardCardModel['segments'][number]['statusTone']): string {
  return `tone-${tone ?? 'default'}`;
}

function comparisonToneClass(model: DashboardCardModel): string {
  return `tone-${model.comparisonTone ?? 'default'}`;
}

function segmentTrendToneClass(segment: DashboardCardModel['segments'][number]): string {
  return `tone-${segment.trendTone ?? 'default'}`;
}

function kpiTrendLabels(model: DashboardCardModel): string[] {
  return trendLabels(model.comparisonDisplayMode, model.trendDeltaLabel, model.trendLabel, model.comparisonLabel);
}

function segmentTrendLabels(
  segment: DashboardCardModel['segments'][number],
  displayMode: DashboardCardModel['comparisonDisplayMode'] | undefined
): string[] {
  return trendLabels(displayMode, segment.trendDeltaLabel, segment.trendLabel, segment.comparisonLabel);
}

function trendLabels(
  displayMode: DashboardCardModel['comparisonDisplayMode'] | undefined,
  amountLabel: string | undefined,
  percentageLabel: string | undefined,
  comparisonLabel: string | undefined
): string[] {
  if (displayMode === 'percentage') return [percentageLabel].filter(Boolean) as string[];
  if (displayMode === 'amount') return [amountLabel].filter(Boolean) as string[];
  if (displayMode === 'value') return [comparisonLabel].filter(Boolean) as string[];
  return [amountLabel, percentageLabel].filter(Boolean) as string[];
}
</script>

<template>
  <section
    class="dashboard-kpi-card"
    :class="cardClass(model)"
    :aria-label="`Card component ${elementName}`"
    :style="{
      '--kpi-grid-columns': String(model?.gridColumns ?? 4),
      '--kpi-inner-gap': cardGap(model?.innerGap, '6px'),
      '--kpi-outer-gap': cardGap(model?.outerGap, '8px'),
      '--kpi-row-heights': model?.twoRow?.rowHeightRatio ?? '1fr 1fr',
      '--kpi-card-bg': model?.backgroundColor ?? 'var(--surface)',
      '--kpi-card-radius': model?.borderRadius ?? '0px',
      borderRadius: model?.borderRadius ?? '0px',
      '--kpi-sparkline-color': model?.sparklineColor ?? '#2563eb',
      '--kpi-title-bg': model?.titleBackground ?? defaultTitleBackground(model),
      '--kpi-title-color': model?.titleColor ?? defaultTitleColor(model),
      '--kpi-title-size': titleFontSize(model?.titleFontSize, defaultTitleFontSize(model)),
      '--kpi-value-bg': model?.valueBackground ?? defaultValueBackground(model),
      '--kpi-value-color': model?.valueColor ?? defaultValueColor(model),
      '--kpi-value-size': cardFontSize(model?.valueFontSize, defaultValueFontSize(model))
    }"
    :data-card-shadow="model?.shadow ?? 'default'"
    :data-custom-class="model?.customClassName ?? ''"
    :data-layout-mode="model?.layoutMode ?? 'default'"
    :data-renderer-state="hasStateMessage || !model ? 'state' : 'ready'"
    :data-title-position="model?.titlePosition ?? 'top'"
  >
    <div v-if="hasStateMessage || !model" class="dashboard-render-state">
      <span v-if="isLoading" class="dashboard-render-spinner" aria-hidden="true"></span>
      <p class="dashboard-render-state-title">{{ stateTitle }}</p>
      <p v-if="stateDetail" class="dashboard-render-state-detail">{{ stateDetail }}</p>
    </div>
    <template v-else>
      <div v-if="isTwoRowCard(model)" class="dashboard-kpi-two-row" data-card-type="two-row">
        <div class="dashboard-kpi-row dashboard-kpi-row-top" data-kpi-row="top" :aria-label="`${elementName} top row`">
          <template v-for="token in model.twoRow?.topContent" :key="`top-${token}`">
            <strong v-if="token === 'value'" class="dashboard-kpi-token dashboard-kpi-token-value" data-kpi-token="value">{{ model.value }}</strong>
            <span
              v-else-if="token === 'status' && model.showIndicator && model.statusLabel"
              class="dashboard-kpi-status dashboard-kpi-token dashboard-kpi-token-status"
              :class="statusToneClass(model.statusTone)"
              data-kpi-token="status"
            >
              <span class="dashboard-kpi-status-dot" aria-hidden="true"></span>
              <span class="dashboard-kpi-token-text">{{ model.statusLabel }}</span>
            </span>
            <span v-else-if="showTextToken(token, model)" class="dashboard-kpi-token" :class="`dashboard-kpi-token-${token}`" :data-kpi-token="token">
              <span class="dashboard-kpi-token-text">{{ tokenLabel(token, model) }}</span>
            </span>
            <span v-else-if="token === 'sparkline' && showKpiSparkline(model)" class="dashboard-kpi-sparkline dashboard-kpi-token" data-kpi-token="sparkline" aria-label="KPI sparkline">
              <svg viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
                <path v-if="showSparklineArea(model)" class="dashboard-kpi-sparkline-area" :d="sparklineAreaPath(model.sparkline)" />
                <polyline v-if="showSparklineLine(model)" :points="sparklinePolyline(model.sparkline)" />
                <rect
                  v-for="(bar, index) in sparklineType(model) === 'column' ? sparklineColumns(model.sparkline) : []"
                  :key="`top-bar-${index}`"
                  class="dashboard-kpi-sparkline-bar"
                  :height="bar.height"
                  :width="bar.width"
                  :x="bar.x"
                  :y="bar.y"
                  rx="1.5"
                />
                <circle
                  v-for="keyPoint in showSparklinePoints(model) ? sparklineKeyPoints(model.sparkline) : []"
                  :key="`top-${keyPoint.className}-${keyPoint.label}`"
                  :class="`dashboard-kpi-sparkline-point dashboard-kpi-sparkline-point-${keyPoint.className}`"
                  :cx="keyPoint.point.x"
                  :cy="keyPoint.point.y"
                  r="2.7"
                />
              </svg>
            </span>
          </template>
        </div>
        <div class="dashboard-kpi-row dashboard-kpi-row-bottom" data-kpi-row="bottom" :aria-label="`${elementName} bottom row`">
          <template v-for="token in model.twoRow?.bottomContent" :key="`bottom-${token}`">
            <strong v-if="token === 'value'" class="dashboard-kpi-token dashboard-kpi-token-value" data-kpi-token="value">{{ model.value }}</strong>
            <span
              v-else-if="token === 'status' && model.showIndicator && model.statusLabel"
              class="dashboard-kpi-status dashboard-kpi-token dashboard-kpi-token-status"
              :class="statusToneClass(model.statusTone)"
              data-kpi-token="status"
            >
              <span class="dashboard-kpi-status-dot" aria-hidden="true"></span>
              <span class="dashboard-kpi-token-text">{{ model.statusLabel }}</span>
            </span>
            <span v-else-if="showTextToken(token, model)" class="dashboard-kpi-token" :class="`dashboard-kpi-token-${token}`" :data-kpi-token="token">
              <span class="dashboard-kpi-token-text">{{ tokenLabel(token, model) }}</span>
            </span>
            <span v-else-if="token === 'sparkline' && showKpiSparkline(model)" class="dashboard-kpi-sparkline dashboard-kpi-token" data-kpi-token="sparkline" aria-label="KPI sparkline">
              <svg viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
                <path v-if="showSparklineArea(model)" class="dashboard-kpi-sparkline-area" :d="sparklineAreaPath(model.sparkline)" />
                <polyline v-if="showSparklineLine(model)" :points="sparklinePolyline(model.sparkline)" />
                <rect
                  v-for="(bar, index) in sparklineType(model) === 'column' ? sparklineColumns(model.sparkline) : []"
                  :key="`bottom-bar-${index}`"
                  class="dashboard-kpi-sparkline-bar"
                  :height="bar.height"
                  :width="bar.width"
                  :x="bar.x"
                  :y="bar.y"
                  rx="1.5"
                />
                <circle
                  v-for="keyPoint in showSparklinePoints(model) ? sparklineKeyPoints(model.sparkline) : []"
                  :key="`bottom-${keyPoint.className}-${keyPoint.label}`"
                  :class="`dashboard-kpi-sparkline-point dashboard-kpi-sparkline-point-${keyPoint.className}`"
                  :cx="keyPoint.point.x"
                  :cy="keyPoint.point.y"
                  r="2.7"
                />
              </svg>
            </span>
          </template>
        </div>
      </div>
      <div v-else-if="model.isMulti" class="dashboard-kpi-segments" :aria-label="`${elementName} KPI segments`">
        <article
          v-for="segment in model.segments"
          :key="segment.label"
          class="dashboard-kpi-segment"
          :class="`trend-${segmentTrendDirection(segment)}`"
        >
          <header>
            <span>{{ segment.label }}</span>
          </header>
          <strong>{{ segment.value }}</strong>
          <div v-if="model.showTrend && segmentTrendLabel(segment, model)" class="dashboard-kpi-segment-meta" :class="segmentTrendToneClass(segment)">
            <span class="dashboard-kpi-trend-arrow" aria-hidden="true">
              <svg v-if="segmentTrendDirection(segment) === 'up'" viewBox="0 0 20 20">
                <path d="M10 3 4 9h4v8h4V9h4z" />
              </svg>
              <svg v-else-if="segmentTrendDirection(segment) === 'down'" viewBox="0 0 20 20">
                <path d="M10 17 4 11h4V3h4v8h4z" />
              </svg>
              <svg v-else viewBox="0 0 20 20">
                <path d="M4 9h12v2H4z" />
              </svg>
            </span>
            <span>{{ segmentTrendLabel(segment, model) }}</span>
          </div>
          <span
            v-if="model.showIndicator && segment.statusLabel"
            class="dashboard-kpi-segment-status"
            :class="statusToneClass(segment.statusTone)"
          >
            <span class="dashboard-kpi-status-dot" aria-hidden="true"></span>
            <span>{{ segment.statusLabel }}</span>
          </span>
          <span
            v-if="model.showSparkline && segment.sparkline?.length"
            class="dashboard-kpi-sparkline dashboard-kpi-segment-sparkline"
            :aria-label="`${segment.label} sparkline`"
          >
            <svg viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true">
              <path v-if="showSparklineArea(model)" class="dashboard-kpi-sparkline-area" :d="sparklineAreaPath(segment.sparkline)" />
              <polyline v-if="showSparklineLine(model)" :points="sparklinePolyline(segment.sparkline)" />
              <rect
                v-for="(bar, index) in sparklineType(model) === 'column' ? sparklineColumns(segment.sparkline) : []"
                :key="`${segment.label}-bar-${index}`"
                class="dashboard-kpi-sparkline-bar"
                :height="bar.height"
                :width="bar.width"
                :x="bar.x"
                :y="bar.y"
                rx="1.5"
              />
              <circle
                v-for="keyPoint in showSparklinePoints(model) ? sparklineKeyPoints(segment.sparkline) : []"
                :key="`${segment.label}-${keyPoint.className}-${keyPoint.label}`"
                :class="`dashboard-kpi-sparkline-point dashboard-kpi-sparkline-point-${keyPoint.className}`"
                :cx="keyPoint.point.x"
                :cy="keyPoint.point.y"
                r="2.7"
              />
            </svg>
          </span>
        </article>
      </div>
      <template v-else>
        <div v-if="model.titlePosition !== 'none'" class="dashboard-kpi-heading">
          <p>{{ model.label }}</p>
          <span v-if="model.showIndicator && model.statusLabel" class="dashboard-kpi-status" :class="statusToneClass(model.statusTone)">
            <span class="dashboard-kpi-status-dot" aria-hidden="true"></span>
            {{ model.statusLabel }}
          </span>
        </div>
        <strong class="dashboard-kpi-value">{{ model.value }}</strong>
        <DashboardKpiSupportingMetric
          v-if="model.supportingLabel || model.supportingValue"
          :label="model.supportingLabel"
          :tone="model.supportingTone"
          :value="model.supportingValue"
        />
        <span v-if="showKpiMeta(model)" class="dashboard-kpi-meta">
          <span v-if="model.showTrend" class="dashboard-kpi-trend" :class="comparisonToneClass(model)" aria-label="KPI trend">
            <span class="dashboard-kpi-trend-arrow" aria-hidden="true">
              <svg v-if="model.trendDirection === 'up'" viewBox="0 0 20 20">
                <path d="M10 3 4 9h4v8h4V9h4z" />
              </svg>
              <svg v-else-if="model.trendDirection === 'down'" viewBox="0 0 20 20">
                <path d="M10 17l6-6h-4V3H8v8H4z" />
              </svg>
              <svg v-else viewBox="0 0 20 20">
                <path d="M4 9h12v2H4z" />
              </svg>
            </span>
            <span class="dashboard-kpi-trend-values">
              <span
                v-for="(trendValue, index) in kpiTrendLabels(model)"
                :key="`${trendValue}-${index}`"
                :class="index === 0 ? 'dashboard-kpi-trend-delta' : 'dashboard-kpi-trend-percent'"
              >
                {{ trendValue }}
              </span>
            </span>
          </span>
          <span v-if="model.comparisonContext">{{ model.comparisonContext }}</span>
          <span v-else-if="model.comparisonLabel && model.comparisonDisplayMode !== 'value'">vs {{ model.comparisonLabel }}</span>
        </span>
        <span v-if="showKpiSparkline(model)" class="dashboard-kpi-sparkline" aria-label="KPI sparkline">
          <svg viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
            <path v-if="showSparklineArea(model)" class="dashboard-kpi-sparkline-area" :d="sparklineAreaPath(model.sparkline)" />
            <polyline v-if="showSparklineLine(model)" :points="sparklinePolyline(model.sparkline)" />
            <rect
              v-for="(bar, index) in sparklineType(model) === 'column' ? sparklineColumns(model.sparkline) : []"
              :key="`bar-${index}`"
              class="dashboard-kpi-sparkline-bar"
              :height="bar.height"
              :width="bar.width"
              :x="bar.x"
              :y="bar.y"
              rx="1.5"
            />
            <circle
              v-for="keyPoint in showSparklinePoints(model) ? sparklineKeyPoints(model.sparkline) : []"
              :key="`${keyPoint.className}-${keyPoint.label}`"
              :class="`dashboard-kpi-sparkline-point dashboard-kpi-sparkline-point-${keyPoint.className}`"
              :cx="keyPoint.point.x"
              :cy="keyPoint.point.y"
              r="2.7"
            />
          </svg>
          <span v-if="model.showMinMaxAvg && model.sparklineStats" class="dashboard-kpi-sparkline-stats" aria-label="KPI sparkline min max average">
            <span>Min {{ model.sparklineStats.min }}</span>
            <span>Max {{ model.sparklineStats.max }}</span>
            <span>Avg {{ model.sparklineStats.avg }}</span>
          </span>
        </span>
      </template>
    </template>
  </section>
</template>
