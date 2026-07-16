<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  formatDateRangeDisplayDate,
  formatDateRangeInputDate,
  normalizeDateRangeInputValue,
  toDateRangeOutputValue
} from './date-range-values';

const props = withDefaults(defineProps<{
  disabled?: boolean;
  endDate: string;
  endFieldLabel?: string;
  fieldDisplayFormat?: 'browser' | 'dmy' | 'iso';
  includeTime?: boolean;
  label: string;
  startFieldLabel?: string;
  startDate: string;
  triggerStyle?: 'button' | 'range-fields';
}>(), {
  disabled: false,
  endFieldLabel: 'End',
  fieldDisplayFormat: 'browser',
  includeTime: false,
  startFieldLabel: 'Start',
  triggerStyle: 'button'
});

const emit = defineEmits<{
  change: [range: { endDate: string; includeTime: boolean; startDate: string }];
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const popoverStyle = ref<Record<string, string>>({});
const localStartDate = ref(normalizeDateRangeInputValue(props.startDate, props.includeTime, 'start'));
const localEndDate = ref(normalizeDateRangeInputValue(props.endDate, props.includeTime, 'end'));
const localIncludeTime = ref(props.includeTime);
const legacySelectionPhase = ref<'end' | 'start'>('start');
const legacyHoverDate = ref('');
const legacyVisibleMonth = ref(startOfMonth(parseDatePart(localStartDate.value) ?? new Date()));

const inputType = computed(() => localIncludeTime.value ? 'datetime-local' : 'date');
const canApply = computed(() => Boolean(localStartDate.value && localEndDate.value && localStartDate.value <= localEndDate.value));
const usesRangeFieldsTrigger = computed(() => props.triggerStyle === 'range-fields');
const displayValue = computed(() => {
  if (!props.startDate || !props.endDate) return 'Select date range';
  return `${formatDateRangeDisplayDate(props.startDate)} - ${formatDateRangeDisplayDate(props.endDate)}`;
});
const startDisplayValue = computed(() => fieldDisplayValue(props.startDate, 'start'));
const endDisplayValue = computed(() => fieldDisplayValue(props.endDate, 'end'));
const legacyCalendarMonths = computed(() => [
  buildLegacyCalendarMonth(legacyVisibleMonth.value),
  buildLegacyCalendarMonth(new Date(legacyVisibleMonth.value.getFullYear(), legacyVisibleMonth.value.getMonth() + 1, 1))
]);
const legacyFooterLabel = computed(() => {
  const source = parseDatePart(localEndDate.value) ?? parseDatePart(localStartDate.value) ?? startOfDay(new Date());
  return source.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric'
  }).toUpperCase();
});

watch(() => [props.startDate, props.endDate, props.includeTime] as const, ([startDate, endDate, includeTime]) => {
  localStartDate.value = normalizeDateRangeInputValue(startDate, includeTime, 'start');
  localEndDate.value = normalizeDateRangeInputValue(endDate, includeTime, 'end');
  localIncludeTime.value = includeTime;
  legacyHoverDate.value = '';
});

watch(localIncludeTime, includeTime => {
  localStartDate.value = normalizeDateRangeInputValue(localStartDate.value, includeTime, 'start');
  localEndDate.value = normalizeDateRangeInputValue(localEndDate.value, includeTime, 'end');
});

watch(isOpen, open => {
  if (!open) {
    removePositionListeners();
    return;
  }
  legacyVisibleMonth.value = startOfMonth(parseDatePart(localStartDate.value) ?? new Date());
  void nextTick(() => {
    if (!isOpen.value) return;
    positionPopover();
    addPositionListeners();
    focusWithoutScroll(popoverRef.value);
  });
});

function focusWithoutScroll(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true });
}

function togglePicker(): void {
  if (props.disabled) return;
  if (!isOpen.value) {
    legacySelectionPhase.value = 'start';
    legacyHoverDate.value = '';
  }
  isOpen.value = !isOpen.value;
}

function closePicker(): void {
  isOpen.value = false;
  legacyHoverDate.value = '';
  localStartDate.value = normalizeDateRangeInputValue(props.startDate, props.includeTime, 'start');
  localEndDate.value = normalizeDateRangeInputValue(props.endDate, props.includeTime, 'end');
  localIncludeTime.value = props.includeTime;
}

function applyDates(): void {
  if (!canApply.value) return;
  emit('change', {
    endDate: toDateRangeOutputValue(localEndDate.value, localIncludeTime.value, 'end'),
    includeTime: localIncludeTime.value,
    startDate: toDateRangeOutputValue(localStartDate.value, localIncludeTime.value, 'start')
  });
  isOpen.value = false;
  legacyHoverDate.value = '';
}

function clearDates(): void {
  emit('change', { endDate: '', includeTime: localIncludeTime.value, startDate: '' });
  isOpen.value = false;
  legacyHoverDate.value = '';
}

function selectLegacyDate(value: string): void {
  if (props.disabled) return;

  if (legacySelectionPhase.value === 'start' || !localStartDate.value) {
    localStartDate.value = value;
    legacyHoverDate.value = value;
    if (localEndDate.value && value > localEndDate.value) {
      localEndDate.value = '';
    }
    legacySelectionPhase.value = 'end';
    return;
  }

  if (value < localStartDate.value) {
    localEndDate.value = localStartDate.value;
    localStartDate.value = value;
  } else {
    localEndDate.value = value;
  }

  applyDates();
}

function setLegacyHoverDate(value: string): void {
  if (legacySelectionPhase.value !== 'end' || !localStartDate.value) return;
  legacyHoverDate.value = value;
}

function clearLegacyHoverDate(value?: string): void {
  if (value && legacyHoverDate.value !== value) return;
  legacyHoverDate.value = '';
}

function shiftLegacyCalendar(direction: -1 | 1): void {
  const base = legacyVisibleMonth.value;
  legacyVisibleMonth.value = new Date(base.getFullYear(), base.getMonth() + direction, 1);
}

function setQuickRange(range: 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear'): void {
  const today = startOfDay(new Date());
  let start = new Date(today);
  let end = new Date(today);
  if (range === 'yesterday') {
    start = addDays(today, -1);
    end = addDays(today, -1);
  } else if (range === 'last7') {
    start = addDays(today, -6);
  } else if (range === 'last30') {
    start = addDays(today, -29);
  } else if (range === 'thisMonth') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (range === 'lastMonth') {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (range === 'thisYear') {
    start = new Date(today.getFullYear(), 0, 1);
  }
  localStartDate.value = formatDateRangeInputDate(start, localIncludeTime.value, 'start');
  localEndDate.value = formatDateRangeInputDate(end, localIncludeTime.value, 'end');
}

function fieldDisplayValue(value: string, boundary: 'end' | 'start'): string {
  const normalized = normalizeDateRangeInputValue(value, props.includeTime, boundary);
  if (!normalized) return '';
  if (props.fieldDisplayFormat === 'iso') return normalized.replace('T', ' ');
  const datePart = normalized.slice(0, 10);
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized;
  const [, year, month, day] = match;
  const timePart = normalized.includes('T') ? ` ${normalized.slice(11, 16)}` : '';
  if (props.fieldDisplayFormat === 'dmy') return `${day}/${month}/${year}${timePart}`;
  return `${formatDateRangeDisplayDate(datePart)}${timePart}`;
}

function positionPopover(): void {
  if (!triggerRef.value || typeof window === 'undefined') return;
  const rect = triggerRef.value.getBoundingClientRect();
  const gutter = 16;
  const preferredWidth = usesRangeFieldsTrigger.value ? 532 : 544;
  const popoverWidth = Math.min(preferredWidth, Math.max(280, window.innerWidth - gutter * 2));
  const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - popoverWidth - gutter));
  const popoverHeight = usesRangeFieldsTrigger.value ? 359 : 360;
  const belowTop = rect.bottom + (usesRangeFieldsTrigger.value ? 0 : 6);
  const aboveTop = rect.top - popoverHeight;
  const top = belowTop + popoverHeight <= window.innerHeight || aboveTop < gutter ? belowTop : Math.max(gutter, aboveTop);
  popoverStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${popoverWidth}px`
  };
}

function addPositionListeners(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('resize', positionPopover);
  window.addEventListener('scroll', positionPopover, true);
}

function removePositionListeners(): void {
  if (typeof window === 'undefined') return;
  window.removeEventListener('resize', positionPopover);
  window.removeEventListener('scroll', positionPopover, true);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

interface LegacyCalendarDay {
  date: string;
  day: number;
  isEnd: boolean;
  isInRange: boolean;
  isPreview: boolean;
  isStart: boolean;
  isToday: boolean;
}

interface LegacyCalendarMonth {
  cells: Array<LegacyCalendarDay | null>;
  label: string;
}

function buildLegacyCalendarMonth(monthDate: Date): LegacyCalendarMonth {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leadingEmptyCells = (firstOfMonth.getDay() + 6) % 7;
  const cells: Array<LegacyCalendarDay | null> = Array.from({ length: leadingEmptyCells }, () => null);
  const range = legacyCalendarRange();
  const start = range.start;
  const end = range.end;
  const today = formatLocalDatePart(startOfDay(new Date()));

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = formatLocalDatePart(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
    cells.push({
      date,
      day,
      isEnd: Boolean(end && date === end),
      isInRange: Boolean(start && end && date > start && date < end),
      isPreview: Boolean(range.isPreview && start && end && date >= start && date <= end),
      isStart: Boolean(start && date === start),
      isToday: date === today
    });
  }

  return {
    cells,
    label: monthDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }).toUpperCase()
  };
}

function legacyCalendarRange(): { end: string; isPreview: boolean; start: string } {
  const selectedStart = localStartDate.value.slice(0, 10);
  if (!selectedStart) return { end: '', isPreview: false, start: '' };

  const hoverEnd = legacySelectionPhase.value === 'end' ? legacyHoverDate.value : '';
  const selectedEnd = localEndDate.value.slice(0, 10);
  const rawEnd = hoverEnd || selectedEnd;
  if (!rawEnd) return { end: '', isPreview: Boolean(hoverEnd), start: selectedStart };

  return selectedStart <= rawEnd
    ? { end: rawEnd, isPreview: Boolean(hoverEnd), start: selectedStart }
    : { end: selectedStart, isPreview: Boolean(hoverEnd), start: rawEnd };
}

function parseDatePart(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatLocalDatePart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

onBeforeUnmount(removePositionListeners);
</script>

<template>
  <div class="dashboard-date-range-picker" :class="{ 'dashboard-date-range-picker--fields': usesRangeFieldsTrigger, 'is-open': isOpen }">
    <button
      ref="triggerRef"
      class="date-range-trigger"
      :class="{ 'date-range-trigger--fields': usesRangeFieldsTrigger }"
      type="button"
      :aria-label="`${label} date range picker`"
      :disabled="disabled"
      @click="togglePicker"
    >
      <template v-if="usesRangeFieldsTrigger">
        <span class="date-range-trigger-field-group">
          <span class="date-range-trigger-field-label">{{ startFieldLabel }}</span>
          <span class="date-range-trigger-field">{{ startDisplayValue || 'Start date' }}</span>
        </span>
        <span class="date-range-trigger-field-group">
          <span class="date-range-trigger-field-label">{{ endFieldLabel }}</span>
          <span class="date-range-trigger-field">{{ endDisplayValue || 'End date' }}</span>
        </span>
      </template>
      <template v-else>
        <span>{{ displayValue }}</span>
        <svg class="date-range-trigger-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M8 3v4M16 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </template>
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="date-range-backdrop" aria-hidden="true" @click="closePicker" />
      <div
        v-if="isOpen"
        ref="popoverRef"
        class="date-range-popover"
        :class="{ 'date-range-popover--legacy-range': usesRangeFieldsTrigger }"
        role="dialog"
        :aria-label="`${label} date range picker dialog`"
        :style="popoverStyle"
        tabindex="-1"
        @keydown.esc="closePicker"
      >
        <template v-if="usesRangeFieldsTrigger">
          <div class="date-range-legacy-calendar-header">
            <button class="date-range-legacy-title" type="button" @click.prevent>
              {{ legacyCalendarMonths.map(month => month.label).join(' - ') }}
            </button>
            <div class="date-range-legacy-nav">
              <button type="button" aria-label="Previous" @click="shiftLegacyCalendar(-1)">‹</button>
              <button type="button" aria-label="Next" @click="shiftLegacyCalendar(1)">›</button>
            </div>
          </div>
          <div class="date-range-legacy-months">
            <table v-for="month in legacyCalendarMonths" :key="month.label" class="date-range-legacy-month">
              <thead>
                <tr>
                  <th>MO</th>
                  <th>TU</th>
                  <th>WE</th>
                  <th>TH</th>
                  <th>FR</th>
                  <th>SA</th>
                  <th>SU</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rowIndex in Math.ceil(month.cells.length / 7)" :key="`${month.label}-${rowIndex}`">
                  <td
                    v-for="(cell, cellIndex) in month.cells.slice((rowIndex - 1) * 7, rowIndex * 7)"
                    :key="cell?.date ?? `${month.label}-empty-${rowIndex}-${cellIndex}`"
                    :class="{
                      'is-empty': !cell,
                      'is-range-start': cell?.isStart,
                      'is-range-mid': cell?.isInRange,
                      'is-range-end': cell?.isEnd,
                      'is-range-preview': cell?.isPreview,
                      'is-today': cell?.isToday
                    }"
                    @mouseenter="cell ? setLegacyHoverDate(cell.date) : undefined"
                    @mouseleave="cell ? clearLegacyHoverDate(cell.date) : undefined"
                  >
                    <button v-if="cell" type="button" @click="selectLegacyDate(cell.date)">{{ cell.day }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button class="date-range-legacy-footer" type="button" @click="setQuickRange('today'); applyDates()">
            {{ legacyFooterLabel }}
          </button>
        </template>
        <template v-else>
          <div class="date-range-popover-header">
            <strong>Select date range</strong>
            <button type="button" aria-label="Close date range picker" @click="closePicker">Close</button>
          </div>

          <div class="date-range-input-grid">
            <label>
              <span>Start Date</span>
              <input v-model="localStartDate" :type="inputType" :max="localEndDate || undefined" />
            </label>
            <label>
              <span>End Date</span>
              <input v-model="localEndDate" :type="inputType" :min="localStartDate || undefined" />
            </label>
          </div>

          <label class="date-range-time-toggle">
            <input v-model="localIncludeTime" type="checkbox" />
            <span>Include time</span>
          </label>

          <div class="date-range-quick-actions" aria-label="Quick date ranges">
            <button type="button" @click="setQuickRange('today')">Today</button>
            <button type="button" @click="setQuickRange('yesterday')">Yesterday</button>
            <button type="button" @click="setQuickRange('last7')">Last 7 Days</button>
            <button type="button" @click="setQuickRange('last30')">Last 30 Days</button>
            <button type="button" @click="setQuickRange('thisMonth')">This Month</button>
            <button type="button" @click="setQuickRange('lastMonth')">Last Month</button>
            <button type="button" @click="setQuickRange('thisYear')">This Year</button>
          </div>

          <div class="date-range-popover-footer">
            <button type="button" @click="clearDates">Clear</button>
            <div>
              <button type="button" @click="closePicker">Cancel</button>
              <button type="button" :disabled="!canApply" @click="applyDates">Apply</button>
            </div>
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped src="./DashboardDateRangePicker.css"></style>
