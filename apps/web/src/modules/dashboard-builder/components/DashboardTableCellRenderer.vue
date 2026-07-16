<script setup lang="ts">
import type { DashboardTableCell, DashboardTableColumn } from '../visualization/element-view-model';

const props = defineProps<{
  cell: DashboardTableCell;
  column: DashboardTableColumn | undefined;
  row?: unknown;
  rowIndex?: number;
}>();

const emit = defineEmits<{
  action: [payload: { actionId: string; columnKey: string; label: string; row: unknown; rowIndex: number }];
}>();

function cellClass(cell: DashboardTableCell, column: DashboardTableColumn | undefined): Array<Record<string, boolean> | string> {
  return [
    {
      [`align-${column?.align ?? 'auto'}`]: Boolean(column?.align),
      [`field-${safeClassToken(column?.key ?? 'value')}`]: true,
      [`tone-${cell.tone}`]: true,
      'is-numeric': cell.numeric !== null,
      'is-total': cell.isTotal === true
    },
    ...(cell.formatClasses ?? [])
  ];
}

function cellStyle(cell: DashboardTableCell, column: DashboardTableColumn | undefined): Record<string, string> {
  return {
    ...(column?.width ? { width: column.width } : {}),
    ...(cell.style ?? {})
  };
}

function linkClass(column: DashboardTableColumn | undefined): string {
  const underline = column?.displayConfig?.linkUnderline;
  if (underline === 'always') return 'link-underline-always';
  if (underline === 'never') return 'link-underline-never';
  return '';
}

function linkStyle(column: DashboardTableColumn | undefined): Record<string, string> {
  const underline = column?.displayConfig?.linkUnderline;
  if (underline === 'always') return { textDecoration: 'underline' };
  if (underline === 'never') return { textDecoration: 'none' };
  return {};
}

function progressWidth(cell: DashboardTableCell): string {
  const ratio = cell.ratio ?? 0;
  return `${Math.min(100, Math.max(0, ratio))}%`;
}

function percentageWidth(cell: DashboardTableCell): string {
  const numeric = cell.numeric ?? 0;
  const ratio = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric <= 100 ? numeric : cell.ratio ?? 0;
  return `${Math.min(100, Math.max(0, ratio))}%`;
}

function bulletWidth(cell: DashboardTableCell, maxValue: number | undefined): string {
  const max = maxValue && maxValue > 0 ? maxValue : 100;
  const numeric = cell.numeric ?? 0;
  return `${Math.min(100, Math.max(0, (numeric / max) * 100))}%`;
}

function bulletTargetLeft(target: number | undefined, maxValue: number | undefined): string {
  if (!target || target <= 0) return '0%';
  const max = maxValue && maxValue > 0 ? maxValue : 100;
  return `${Math.min(100, Math.max(0, (target / max) * 100))}%`;
}

function bulletRanges(column: DashboardTableColumn | undefined): Array<{ color: string; left: string; width: string }> {
  const max = column?.maxValue && column.maxValue > 0 ? column.maxValue : 100;
  return column?.cellConfig?.bulletRanges?.map(range => {
    const min = range.min ?? 0;
    return {
      color: range.color,
      left: `${Math.min(100, Math.max(0, (min / max) * 100))}%`,
      width: `${Math.min(100, Math.max(0, ((range.max - min) / max) * 100))}%`
    };
  }) ?? [];
}

function sparklinePolyline(cell: DashboardTableCell): string {
  const values = cell.sparkline.length > 0 ? cell.sparkline : cell.numeric === null ? [] : [0, cell.numeric];
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? 60 : (index / (values.length - 1)) * 120;
    const y = 30 - ((value - min) / range) * 26 - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function sparklinePoints(cell: DashboardTableCell): string[] {
  const points = sparklinePolyline(cell);
  return points ? points.split(' ') : [];
}

function sparklineClass(column: DashboardTableColumn | undefined): string {
  return `sparkline-${column?.cellConfig?.sparklineSize ?? 'medium'}`;
}

function actionButtons(column: DashboardTableColumn | undefined): NonNullable<DashboardTableColumn['actions']> {
  return column?.actions?.length ? column.actions : [{ actionId: 'view', label: 'View' }];
}

function actionLabel(action: NonNullable<DashboardTableColumn['actions']>[number]): string {
  return `${action.label} action ${action.actionId}`;
}

function runAction(action: NonNullable<DashboardTableColumn['actions']>[number]): void {
  emit('action', {
    actionId: action.actionId,
    columnKey: props.column?.key ?? '',
    label: action.label,
    row: props.row ?? null,
    rowIndex: props.rowIndex ?? -1
  });
}

function deltaIndicator(cell: DashboardTableCell): string {
  if (cell.delta?.direction === 'up') return '+';
  if (cell.delta?.direction === 'down') return '-';
  return '=';
}

function safeClassToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'value';
}
</script>

<template>
  <td :class="cellClass(cell, column)" :data-field="column?.key" :style="cellStyle(cell, column)">
    <span v-if="column?.cellType === 'badge'" class="dashboard-table-badge" :class="`tone-${cell.tone}`">{{ cell.display }}</span>
    <span v-else-if="column?.cellType === 'progress'" class="dashboard-table-progress">
      <span class="dashboard-table-progress-fill" :style="{ width: percentageWidth(cell) }"></span>
      <span>{{ cell.display }}</span>
    </span>
    <span v-else-if="column?.cellType === 'bar-in-cell'" class="dashboard-table-bar">
      <span class="dashboard-table-bar-fill" :style="{ width: progressWidth(cell) }"></span>
      <span>{{ cell.display }}</span>
    </span>
    <span v-else-if="column?.cellType === 'bullet-chart'" class="dashboard-table-bullet">
      <span class="dashboard-table-bullet-ranges" aria-hidden="true">
        <span
          v-for="(range, index) in bulletRanges(column)"
          :key="index"
          class="dashboard-table-bullet-range"
          :style="{ left: range.left, width: range.width, backgroundColor: range.color }"
        ></span>
      </span>
      <span class="dashboard-table-bullet-fill" :style="{ width: bulletWidth(cell, column?.maxValue) }"></span>
      <span
        v-if="column?.target"
        class="dashboard-table-bullet-target"
        :style="{ left: bulletTargetLeft(column.target, column.maxValue) }"
      ></span>
      <span class="dashboard-table-bullet-value">{{ cell.display }}</span>
    </span>
    <span
      v-else-if="column?.cellType === 'sparkline' || column?.cellType === 'advanced-sparkline' || column?.cellType === 'trend-indicator'"
      class="dashboard-table-sparkline"
      :class="sparklineClass(column)"
      :aria-label="`Sparkline ${cell.display}`"
    >
      <svg viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
        <polygon v-if="column?.cellConfig?.showArea" :points="`0,32 ${sparklinePolyline(cell)} 120,32`" />
        <polyline :points="sparklinePolyline(cell)" />
        <circle
          v-for="point in column?.cellConfig?.showDots ? sparklinePoints(cell) : []"
          :key="point"
          :cx="point.split(',')[0]"
          :cy="point.split(',')[1]"
          r="2"
        />
      </svg>
    </span>
    <span v-else-if="column?.cellType === 'delta'" class="dashboard-table-delta" :class="`tone-${cell.tone}`">
      <span v-if="cell.delta?.showArrow !== false" aria-hidden="true">{{ deltaIndicator(cell) }}</span>
      <span>{{ cell.display }}</span>
    </span>
    <span v-else-if="column?.cellType === 'actions'" class="dashboard-table-actions-cell">
      <button
        v-for="action in actionButtons(column)"
        :key="action.actionId"
        type="button"
        :aria-label="actionLabel(action)"
        :data-action-id="action.actionId"
        :data-action-label="action.label"
        @click.stop="runAction(action)"
      >
        {{ action.label }}
      </button>
    </span>
    <a
      v-else-if="cell.link"
      class="dashboard-table-cell-link"
      :class="linkClass(column)"
      :style="linkStyle(column)"
      :href="cell.link.href"
      :target="cell.link.target"
      :rel="cell.link.rel"
      :aria-label="cell.link.ariaLabel"
      @click.stop
    >
      {{ cell.display }}
    </a>
    <span v-else>{{ cell.display }}</span>
  </td>
</template>
