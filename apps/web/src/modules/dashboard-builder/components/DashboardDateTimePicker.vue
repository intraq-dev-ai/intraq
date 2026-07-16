<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  buildCalendarRows,
  buildTimeOptions,
  composeDateTimeValue,
  formatDate,
  formatDisplayValue,
  type CalendarView,
  MONTH_OPTIONS,
  parseDatePart,
  parseUserDateTime,
  readDatePart,
  readTimePart,
  startOfMonth
} from './dashboard-date-time-picker-utils';

const props = withDefaults(defineProps<{
  ariaLabel: string;
  includeTime?: boolean;
  modelValue: string;
}>(), {
  includeTime: false
});

const emit = defineEmits<{
  change: [value: string];
}>();

const rootRef = ref<HTMLElement | null>(null);
const datePopoverRef = ref<HTMLElement | null>(null);
const timePopoverRef = ref<HTMLElement | null>(null);
const datePopoverStyle = ref<Record<string, string>>({});
const timePopoverStyle = ref<Record<string, string>>({});
const calendarOpen = ref(false);
const timeOpen = ref(false);
const calendarView = ref<CalendarView>('day');
const calendarMonth = ref(startOfMonth(parseDatePart(props.modelValue) ?? new Date()));
const typedValue = ref(formatDisplayValue(props.modelValue, props.includeTime));

const datePart = computed(() => readDatePart(props.modelValue));
const calendarTitle = computed(() => {
  if (calendarView.value === 'year') return `${decadeStart.value}-${decadeStart.value + 9}`;
  if (calendarView.value === 'month') return String(calendarMonth.value.getFullYear());
  return calendarMonth.value.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }).toUpperCase();
});
const calendarRows = computed(() => buildCalendarRows(calendarMonth.value, datePart.value));
const decadeStart = computed(() => Math.floor(calendarMonth.value.getFullYear() / 10) * 10);
const yearCells = computed(() => Array.from({ length: 12 }, (_, index) => decadeStart.value - 1 + index));
const timeOptions = computed(() => buildTimeOptions());

watch(() => props.modelValue, value => {
  typedValue.value = formatDisplayValue(value, props.includeTime);
  if (!calendarOpen.value) {
    calendarMonth.value = startOfMonth(parseDatePart(value) ?? new Date());
  }
});

watch(calendarOpen, open => {
  if (!open) {
    calendarView.value = 'day';
    removePositionListeners();
    return;
  }
  calendarMonth.value = startOfMonth(parseDatePart(props.modelValue) ?? new Date());
  calendarView.value = 'day';
  void nextTick(() => {
    if (!calendarOpen.value) return;
    positionDatePopover();
    addPositionListeners();
  });
});

watch(timeOpen, open => {
  if (!open) {
    removePositionListeners();
    return;
  }
  void nextTick(() => {
    if (!timeOpen.value) return;
    positionTimePopover();
    addPositionListeners();
  });
});

function updateTypedValue(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  typedValue.value = target.value;
}

function commitTypedValue(): void {
  const parsed = parseUserDateTime(typedValue.value, props.includeTime, props.modelValue);
  if (!parsed) {
    typedValue.value = formatDisplayValue(props.modelValue, props.includeTime);
    return;
  }
  emit('change', parsed);
}

function handleTypedKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitTypedValue();
    closePopovers();
  }

  if (event.key === 'Escape') {
    typedValue.value = formatDisplayValue(props.modelValue, props.includeTime);
    closePopovers();
  }
}

function openCalendar(): void {
  if (calendarOpen.value) {
    calendarOpen.value = false;
    return;
  }
  timeOpen.value = false;
  calendarOpen.value = true;
}

function openTimeList(): void {
  if (!props.includeTime) return;
  if (timeOpen.value) {
    timeOpen.value = false;
    return;
  }
  calendarOpen.value = false;
  timeOpen.value = true;
}

function closePopovers(): void {
  calendarOpen.value = false;
  timeOpen.value = false;
}

function selectDate(value: string): void {
  emit('change', composeDateTimeValue(value, readTimePart(props.modelValue), props.includeTime));
  calendarOpen.value = false;
}

function selectTime(value: string): void {
  emit('change', composeDateTimeValue(datePart.value || formatDate(new Date()), value, props.includeTime));
  timeOpen.value = false;
}

function shiftCalendar(direction: -1 | 1): void {
  if (calendarView.value === 'year') {
    calendarMonth.value = new Date(calendarMonth.value.getFullYear() + direction * 10, calendarMonth.value.getMonth(), 1);
    return;
  }

  if (calendarView.value === 'month') {
    calendarMonth.value = new Date(calendarMonth.value.getFullYear() + direction, calendarMonth.value.getMonth(), 1);
    return;
  }

  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() + direction, 1);
}

function openParentCalendarView(): void {
  if (calendarView.value === 'day') {
    calendarView.value = 'month';
    return;
  }

  if (calendarView.value === 'month') {
    calendarView.value = 'year';
  }
}

function selectCalendarMonth(month: number): void {
  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), month, 1);
  calendarView.value = 'day';
}

function selectCalendarYear(year: number): void {
  calendarMonth.value = new Date(year, calendarMonth.value.getMonth(), 1);
  calendarView.value = 'month';
}

function positionDatePopover(): void {
  const root = rootRef.value;
  if (!root || typeof window === 'undefined') return;
  const rect = root.getBoundingClientRect();
  const width = 266;
  const gutter = 12;
  const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - width - gutter));
  const belowTop = rect.bottom;
  const aboveTop = rect.top - 350;
  const top = belowTop + 350 <= window.innerHeight || aboveTop < gutter ? belowTop : Math.max(gutter, aboveTop);
  datePopoverStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px` };
}

function positionTimePopover(): void {
  const root = rootRef.value;
  if (!root || typeof window === 'undefined') return;
  const rect = root.getBoundingClientRect();
  const gutter = 12;
  const width = Math.max(180, rect.width);
  const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - width - gutter));
  const top = Math.min(rect.bottom, Math.max(gutter, window.innerHeight - 240 - gutter));
  timePopoverStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px` };
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!calendarOpen.value && !timeOpen.value) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (rootRef.value?.contains(target) || datePopoverRef.value?.contains(target) || timePopoverRef.value?.contains(target)) return;
  closePopovers();
}

function addPositionListeners(): void {
  if (typeof window === 'undefined') return;
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  window.addEventListener('resize', positionOpenPopover);
  window.addEventListener('scroll', positionOpenPopover, true);
}

function removePositionListeners(): void {
  if (typeof window === 'undefined') return;
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  window.removeEventListener('resize', positionOpenPopover);
  window.removeEventListener('scroll', positionOpenPopover, true);
}

function positionOpenPopover(): void {
  if (calendarOpen.value) positionDatePopover();
  if (timeOpen.value) positionTimePopover();
}

onBeforeUnmount(removePositionListeners);
</script>

<template>
  <span ref="rootRef" class="dashboard-date-time-picker" :class="{ 'is-open': calendarOpen || timeOpen }">
    <input
      class="dashboard-date-time-input"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :aria-label="ariaLabel"
      :value="typedValue"
      @blur="commitTypedValue"
      @input="updateTypedValue"
      @keydown="handleTypedKeydown"
    >
    <button class="dashboard-date-time-icon dashboard-date-time-icon--calendar" type="button" :aria-label="`${ariaLabel} calendar`" @click="openCalendar">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      </svg>
    </button>
    <button v-if="includeTime" class="dashboard-date-time-icon dashboard-date-time-icon--time" type="button" :aria-label="`${ariaLabel} time`" @click="openTimeList">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    </button>
  </span>

  <Teleport to="body">
    <div
      v-if="calendarOpen"
      ref="datePopoverRef"
      class="period-date-popover period-date-popover--legacy"
      role="dialog"
      :aria-label="`${ariaLabel} calendar`"
      :style="datePopoverStyle"
      tabindex="-1"
      @keydown.esc="closePopovers"
    >
      <div class="period-date-popover-header">
        <button class="period-date-popover-nav period-date-popover-nav--prev" type="button" :aria-label="`Previous ${calendarView}`" @click="shiftCalendar(-1)">
          <span class="period-date-popover-nav-icon" aria-hidden="true" />
        </button>
        <button class="period-date-popover-title" type="button" :aria-label="`${calendarTitle} calendar level`" @click="openParentCalendarView">
          {{ calendarTitle }}
        </button>
        <button class="period-date-popover-nav period-date-popover-nav--next" type="button" :aria-label="`Next ${calendarView}`" @click="shiftCalendar(1)">
          <span class="period-date-popover-nav-icon" aria-hidden="true" />
        </button>
      </div>
      <table v-if="calendarView === 'day'" class="period-date-calendar-grid">
        <thead>
          <tr>
            <th scope="col">Mo</th>
            <th scope="col">Tu</th>
            <th scope="col">We</th>
            <th scope="col">Th</th>
            <th scope="col">Fr</th>
            <th scope="col">Sa</th>
            <th scope="col">Su</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, weekIndex) in calendarRows" :key="weekIndex">
            <td
              v-for="day in week"
              :key="day.date"
              :class="{ 'is-other-month': !day.isCurrentMonth, 'is-selected': day.isSelected, 'is-today': day.isToday }"
            >
              <button type="button" :aria-label="day.label" @click="selectDate(day.date)">{{ day.day }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else-if="calendarView === 'month'" class="period-date-unit-grid period-date-unit-grid--months" role="grid">
        <button v-for="(month, index) in MONTH_OPTIONS" :key="month.short" type="button" role="gridcell" :aria-label="month.long" :class="{ 'is-selected': index === calendarMonth.getMonth() }" @click="selectCalendarMonth(index)">
          <span>{{ month.short }}</span>
        </button>
      </div>
      <div v-else class="period-date-unit-grid period-date-unit-grid--years" role="grid">
        <button
          v-for="year in yearCells"
          :key="year"
          type="button"
          role="gridcell"
          :class="{ 'is-selected': year === calendarMonth.getFullYear(), 'is-outside-range': year < decadeStart || year > decadeStart + 9 }"
          @click="selectCalendarYear(year)"
        >
          <span>{{ year }}</span>
        </button>
      </div>
      <button class="period-date-popover-today" type="button" @click="selectDate(formatDate(new Date()))">
        {{ new Date().toLocaleDateString('en-AU', { dateStyle: 'full' }).toUpperCase() }}
      </button>
    </div>

    <div
      v-if="timeOpen"
      ref="timePopoverRef"
      class="dashboard-date-time-popover dashboard-date-time-popover--time"
      role="listbox"
      :aria-label="`${ariaLabel} time options`"
      :style="timePopoverStyle"
    >
      <button
        v-for="option in timeOptions"
        :key="option.value"
        class="dashboard-date-time-option"
        :class="{ 'is-selected': option.value === readTimePart(modelValue) }"
        type="button"
        role="option"
        :aria-selected="option.value === readTimePart(modelValue)"
        @click="selectTime(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped src="./DashboardDateTimePicker.css"></style>
