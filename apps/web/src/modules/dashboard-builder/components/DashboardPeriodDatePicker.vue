<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

type PeriodDatePickerTheme = 'default' | 'legacy' | 'minimal';
type PeriodDatePickerVariant = 'compact' | 'toolbar';
type CalendarView = 'day' | 'month' | 'year';

const props = withDefaults(defineProps<{
  ariaLabel: string;
  displayText?: string;
  modelValue: string;
  theme?: PeriodDatePickerTheme;
  variant?: PeriodDatePickerVariant;
}>(), {
  displayText: '',
  theme: 'default',
  variant: 'toolbar'
});

const emit = defineEmits<{
  change: [value: string];
}>();

const MONTH_OPTIONS = [
  { short: 'Jan', long: 'January' },
  { short: 'Feb', long: 'February' },
  { short: 'Mar', long: 'March' },
  { short: 'Apr', long: 'April' },
  { short: 'May', long: 'May' },
  { short: 'Jun', long: 'June' },
  { short: 'Jul', long: 'July' },
  { short: 'Aug', long: 'August' },
  { short: 'Sep', long: 'September' },
  { short: 'Oct', long: 'October' },
  { short: 'Nov', long: 'November' },
  { short: 'Dec', long: 'December' }
];

const isOpen = ref(false);
const triggerRef = ref<HTMLInputElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const popoverStyle = ref<Record<string, string>>({});
const calendarMonth = ref(startOfMonth(parseDate(props.modelValue) ?? new Date()));
const calendarView = ref<CalendarView>('day');
const typedDateValue = ref(formatLegacyInputDate(props.modelValue));

const isLegacyTheme = computed(() => props.theme === 'legacy');
const baseClass = computed(() => props.variant === 'toolbar' ? 'period-toolbar-date-control' : 'period-date-control');
const controlClass = computed(() => [
  baseClass.value,
  `${baseClass.value}--${props.theme}`,
  { [`${baseClass.value}--custom-calendar`]: isLegacyTheme.value, 'is-open': isOpen.value }
]);
const formattedValue = computed(() => formatLegacyInputDate(props.modelValue));
const calendarTitle = computed(() => {
  if (calendarView.value === 'year') return `${decadeStart.value}-${decadeStart.value + 9}`;
  if (calendarView.value === 'month') return String(calendarMonth.value.getFullYear());
  return calendarMonth.value.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }).toUpperCase();
});
const calendarRows = computed(() => buildCalendarRows(calendarMonth.value, props.modelValue));
const decadeStart = computed(() => Math.floor(calendarMonth.value.getFullYear() / 10) * 10);
const yearCells = computed(() => Array.from({ length: 12 }, (_, index) => decadeStart.value - 1 + index));

watch(() => props.modelValue, value => {
  typedDateValue.value = formatLegacyInputDate(value);
  if (isOpen.value) return;
  calendarMonth.value = startOfMonth(parseDate(value) ?? new Date());
});

watch(isOpen, open => {
  if (!open) {
    calendarView.value = 'day';
    removePositionListeners();
    return;
  }
  calendarMonth.value = startOfMonth(parseDate(props.modelValue) ?? new Date());
  calendarView.value = 'day';
  void nextTick(() => {
    if (!isOpen.value) return;
    positionPopover();
    addPositionListeners();
  });
});

function updateNativeDate(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.value) return;
  emit('change', target.value);
}

function updateTypedDate(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  typedDateValue.value = target.value;
}

function commitTypedDate(): void {
  const parsed = parseUserDate(typedDateValue.value);
  if (!parsed) {
    typedDateValue.value = formattedValue.value;
    return;
  }

  const value = formatDate(parsed);
  typedDateValue.value = formatLegacyInputDate(value);
  calendarMonth.value = startOfMonth(parsed);
  if (value !== props.modelValue) emit('change', value);
}

function handleTypedDateFocus(): void {
  if (!isLegacyTheme.value) return;
  isOpen.value = true;
}

function openPickerFromIcon(): void {
  const trigger = triggerRef.value;
  if (!trigger) return;
  trigger.focus();
  if (isLegacyTheme.value) {
    isOpen.value = true;
    return;
  }

  try {
    trigger.showPicker?.();
  } catch {
    trigger.click();
  }
}

function handleTypedDateKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitTypedDate();
    closeCalendar();
  }

  if (event.key === 'Escape') {
    typedDateValue.value = formattedValue.value;
    closeCalendar();
  }
}

function closeCalendar(): void {
  isOpen.value = false;
}

function selectDate(value: string): void {
  emit('change', value);
  typedDateValue.value = formatLegacyInputDate(value);
  isOpen.value = false;
}

function shiftCalendar(direction: -1 | 1): void {
  if (calendarView.value === 'year') {
    calendarMonth.value = new Date(calendarMonth.value.getFullYear() + (direction * 10), calendarMonth.value.getMonth(), 1);
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

function positionPopover(): void {
  const trigger = triggerRef.value;
  if (!trigger || typeof window === 'undefined') return;
  const rect = trigger.getBoundingClientRect();
  const width = 266;
  const gutter = 12;
  const left = Math.min(Math.max(gutter, rect.right - width), Math.max(gutter, window.innerWidth - width - gutter));
  const belowTop = rect.bottom + 4;
  const aboveTop = rect.top - 350;
  const top = belowTop + 350 <= window.innerHeight || aboveTop < gutter ? belowTop : Math.max(gutter, aboveTop);
  popoverStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`
  };
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (triggerRef.value?.contains(target) || popoverRef.value?.contains(target)) return;
  closeCalendar();
}

function addPositionListeners(): void {
  if (typeof window === 'undefined') return;
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  window.addEventListener('resize', positionPopover);
  window.addEventListener('scroll', positionPopover, true);
}

function removePositionListeners(): void {
  if (typeof window === 'undefined') return;
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  window.removeEventListener('resize', positionPopover);
  window.removeEventListener('scroll', positionPopover, true);
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isExactDate(date, Number(match[1]), Number(match[2]), Number(match[3])) ? date : null;
}

function parseUserDate(value: string): Date | null {
  const trimmed = value.trim();
  const nativeDate = parseDate(trimmed);
  if (nativeDate) return nativeDate;

  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return isExactDate(date, year, month, day) ? date : null;
}

function isExactDate(date: Date, year: number, month: number, day: number): boolean {
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLegacyInputDate(value: string): string {
  const date = parseDate(value);
  if (!date) return value;
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getFullYear())
  ].join('/');
}

function buildCalendarRows(month: Date, selectedValue: string): Array<Array<{
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  label: string;
}>> {
  const selected = parseDate(selectedValue);
  const todayValue = formatDate(new Date());
  const firstOfMonth = startOfMonth(month);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const cursor = new Date(firstOfMonth);
  cursor.setDate(firstOfMonth.getDate() - mondayOffset);
  return Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => {
    const current = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
    const value = formatDate(current);
    return {
      date: value,
      day: current.getDate(),
      isCurrentMonth: current.getMonth() === month.getMonth(),
      isSelected: Boolean(selected && value === formatDate(selected)),
      isToday: value === todayValue,
      label: current.toLocaleDateString('en-AU', { dateStyle: 'full' })
    };
  }));
}

onBeforeUnmount(removePositionListeners);
</script>

<template>
  <span v-if="variant === 'toolbar'" :class="controlClass">
    <input
      v-if="isLegacyTheme"
      ref="triggerRef"
      class="period-toolbar-date-input period-date-trigger"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :value="typedDateValue"
      :aria-expanded="isOpen"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      @blur="commitTypedDate"
      @focus="handleTypedDateFocus"
      @input="updateTypedDate"
      @keydown="handleTypedDateKeydown"
    >
    <input
      v-else
      ref="triggerRef"
      class="period-toolbar-date-input"
      type="date"
      :value="modelValue"
      :aria-label="ariaLabel"
      @change="updateNativeDate"
    >
    <button class="period-toolbar-date-icon" type="button" :aria-label="`${ariaLabel} calendar`" @click="openPickerFromIcon">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      </svg>
    </button>
  </span>

  <span v-else :class="controlClass">
    <span class="period-display">{{ displayText }}</span>
    <input
      v-if="isLegacyTheme"
      ref="triggerRef"
      class="period-date-input period-date-trigger"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :value="typedDateValue"
      :aria-expanded="isOpen"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      @blur="commitTypedDate"
      @focus="handleTypedDateFocus"
      @input="updateTypedDate"
      @keydown="handleTypedDateKeydown"
    >
    <input
      v-else
      class="period-date-input"
      type="date"
      :value="modelValue"
      :aria-label="ariaLabel"
      @change="updateNativeDate"
    >
  </span>

  <Teleport to="body">
    <div
      v-if="isLegacyTheme && isOpen"
      ref="popoverRef"
      class="period-date-popover period-date-popover--legacy"
      role="dialog"
      :aria-label="`${ariaLabel} calendar`"
      :style="popoverStyle"
      tabindex="-1"
      @keydown.esc="closeCalendar"
    >
      <div class="period-date-popover-header">
        <button
          class="period-date-popover-nav period-date-popover-nav--prev"
          type="button"
          :aria-label="`Previous ${calendarView}`"
          @click="shiftCalendar(-1)"
        >
          <span class="period-date-popover-nav-icon" aria-hidden="true" />
        </button>
        <button
          class="period-date-popover-title"
          type="button"
          :aria-label="`${calendarTitle} calendar level`"
          @click="openParentCalendarView"
        >
          {{ calendarTitle }}
        </button>
        <button
          class="period-date-popover-nav period-date-popover-nav--next"
          type="button"
          :aria-label="`Next ${calendarView}`"
          @click="shiftCalendar(1)"
        >
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
              :class="{
                'is-other-month': !day.isCurrentMonth,
                'is-selected': day.isSelected,
                'is-today': day.isToday
              }"
            >
              <button type="button" :aria-label="day.label" @click="selectDate(day.date)">{{ day.day }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else-if="calendarView === 'month'" class="period-date-unit-grid period-date-unit-grid--months" role="grid">
        <button
          v-for="(month, index) in MONTH_OPTIONS"
          :key="month.short"
          type="button"
          role="gridcell"
          :aria-label="month.long"
          :class="{ 'is-selected': index === calendarMonth.getMonth() }"
          @click="selectCalendarMonth(index)"
        >
          <span>{{ month.short }}</span>
        </button>
      </div>
      <div v-else class="period-date-unit-grid period-date-unit-grid--years" role="grid">
        <button
          v-for="year in yearCells"
          :key="year"
          type="button"
          role="gridcell"
          :class="{
            'is-selected': year === calendarMonth.getFullYear(),
            'is-outside-range': year < decadeStart || year > decadeStart + 9
          }"
          @click="selectCalendarYear(year)"
        >
          <span>{{ year }}</span>
        </button>
      </div>
      <button class="period-date-popover-today" type="button" @click="selectDate(formatDate(new Date()))">
        {{ new Date().toLocaleDateString('en-AU', { dateStyle: 'full' }).toUpperCase() }}
      </button>
    </div>
  </Teleport>
</template>
