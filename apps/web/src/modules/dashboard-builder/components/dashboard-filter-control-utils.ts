import type { DashboardFilter } from '../types';
import {
  normalizeDateRangeInputValue,
  type DateRangeBoundary
} from './date-range-values';
import { clearFilterValue, displayFilterValue } from './filter-empty-values';
import type { PeriodUnit } from './period-filter-values';

export type DashboardFilterControlType = 'period-filter' | 'date-range' | 'date-picker' | 'free-text' | 'options';
export type DashboardFilterDisplayMode = 'buttons' | 'dropdown' | 'list';
export type RangeDisplayMode = 'button' | 'datetime-fields' | 'inline' | 'range-picker';
export type RangeFieldDisplayFormat = 'browser' | 'dmy' | 'iso';

export function currentFilterValue(filter: DashboardFilter): unknown {
  return filter.value ?? filter.config?.value;
}

export function currentFilterArray(filter: DashboardFilter): string[] {
  const value = currentFilterValue(filter);
  return Array.isArray(value) ? value.map(String) : [];
}

export function filterValue(filter: DashboardFilter, value: unknown): string {
  return displayFilterValue(value, filter.config);
}

export function controlType(filter: DashboardFilter): DashboardFilterControlType {
  const type = (readString(filter.config?.inputType) ?? readString(filter.config?.filterType) ?? filter.type ?? '').trim().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const operator = readString(filter.operator ?? filter.config?.operator) ?? '';
  if (['periodfilter', 'period-filter', 'period_filter', 'period'].includes(type)) return 'period-filter';
  if (['daterange', 'date-range', 'date_range'].includes(type) || operator === 'last' || operator === 'between') return 'date-range';
  if (['datepicker', 'date-picker', 'date_picker', 'date'].includes(type)) return 'date-picker';
  if (['freetext', 'free-text', 'free_text', 'search', 'text'].includes(type) || operator === 'contains') return 'free-text';
  return 'options';
}

export function filterDisplayMode(filter: DashboardFilter): DashboardFilterDisplayMode {
  const raw = readString(filter.config?.displayMode)?.toLowerCase() ?? '';
  if (raw === 'list' || raw === 'scroll-list' || raw === 'slicer') return 'list';
  if (raw === 'buttons' || raw === 'button') return 'buttons';
  return 'dropdown';
}

export function isMultiSelect(filter: DashboardFilter): boolean {
  const selMode = readString(filter.config?.selectionMode)?.toLowerCase() ?? '';
  if (selMode === 'multi' || selMode === 'multiple') return true;
  if (selMode === 'single') return false;
  const inputType = (readString(filter.config?.inputType) ?? readString(filter.config?.filterType) ?? '').toLowerCase();
  return ['multi-select', 'multiselect', 'multi_select'].includes(inputType) || filter.operator === 'in';
}

export function parseValueForFilter(filter: DashboardFilter, value: string): unknown {
  if (value === 'all') return clearFilterValue(filter.config);
  if (filter.operator === 'in' || isMultiSelect(filter)) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  if (filter.operator === 'between') return parseRangeValue(value);
  if (filter.operator === 'last') return normalizeLastToken(value);
  return value;
}

export function inputValue(event: Event): string {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    return event.target.value;
  }
  return '';
}

export function typeLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export function normalizeLastToken(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.toLowerCase().match(/^last[_\s-]*(\d+)(?:[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y))?$/);
  if (!match) return trimmed;
  const amount = Number(match[1] ?? '0');
  const unit = match[2] ?? 'days';
  const days = unit.startsWith('w') ? amount * 7 : unit.startsWith('m') ? amount * 30 : unit.startsWith('y') ? amount * 365 : amount;
  return `${days} days`;
}

export function parseRangeValue(value: string): unknown {
  const parts = value.split(/\s+(?:to|-)\s+|,/i).map(part => part.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts[1]] : value;
}

export function dateRangeInputType(includeTime: boolean): 'date' | 'datetime-local' {
  return includeTime ? 'datetime-local' : 'date';
}

export function dateRangeInputValue(value: string, includeTime: boolean, boundary: DateRangeBoundary): string {
  return normalizeDateRangeInputValue(value, includeTime, boundary);
}

export function dateRangeDisplayMode(filter: DashboardFilter): RangeDisplayMode {
  const raw = readString(filter.config?.dateRangeDisplayMode ?? filter.config?.rangeDisplayMode ?? filter.config?.dateRangeMode)?.toLowerCase();
  return parseRangeDisplayMode(raw);
}

export function periodRangeDisplayMode(filter: DashboardFilter): RangeDisplayMode {
  const raw = readString(filter.config?.periodRangeDisplayMode ?? filter.config?.rangeDisplayMode ?? filter.config?.dateRangeDisplayMode)?.toLowerCase();
  return parseRangeDisplayMode(raw);
}

export function rangePickerTriggerStyle(mode: RangeDisplayMode): 'button' | 'range-fields' {
  return mode === 'range-picker' ? 'range-fields' : 'button';
}

export function dateRangeFieldDisplayFormat(filter: DashboardFilter): RangeFieldDisplayFormat {
  const raw = readString(filter.config?.dateRangeFieldDisplayFormat ?? filter.config?.rangeFieldDisplayFormat ?? filter.config?.dateRangeDisplayFormat)?.toLowerCase();
  if (raw === 'dmy' || raw === 'dd/mm/yyyy' || raw === 'legacy') return 'dmy';
  if (raw === 'iso' || raw === 'yyyy-mm-dd') return 'iso';
  return 'browser';
}

export function dateRangeStartFieldLabel(filter: DashboardFilter): string {
  return readString(filter.config?.dateRangeStartFieldLabel ?? filter.config?.rangeStartFieldLabel ?? filter.config?.startFieldLabel) ?? 'Start';
}

export function dateRangeEndFieldLabel(filter: DashboardFilter): string {
  return readString(filter.config?.dateRangeEndFieldLabel ?? filter.config?.rangeEndFieldLabel ?? filter.config?.endFieldLabel) ?? 'End';
}

export function dateRangeSeparatorLabel(filter: DashboardFilter): string {
  return readString(filter.config?.dateRangeSeparatorLabel ?? filter.config?.rangeSeparatorLabel) ?? 'to';
}

export function periodDisplayMode(filter: DashboardFilter): 'segmented' | 'toolbar' {
  const mode = readString(filter.config?.periodDisplayMode)?.toLowerCase();
  return mode === 'toolbar' || mode === 'backend-toolbar' ? 'toolbar' : 'segmented';
}

export function toolbarNavigationLabel(unit: PeriodUnit, direction: -1 | 1): string {
  const label = typeLabel(unit);
  return `${direction < 0 ? 'Previous' : 'Next'} ${label}`;
}

export function toolbarNavigationText(unit: PeriodUnit, direction: -1 | 1, outer = false): string {
  const label = toolbarNavigationLabel(unit, direction);
  if (direction < 0) return `${outer ? '<< ' : '< '}${label}`;
  return `${label}${outer ? ' >>' : ' >'}`;
}

export function toolbarNavigationIcon(direction: -1 | 1, outer = false): string {
  if (direction < 0) return outer ? '<<' : '<';
  return outer ? '>>' : '>';
}

export function shouldCloseMultiSelectOnSelect(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return readBoolean(config.closeOnSelect ?? config.closeDropdownOnSelect ?? config.autoCloseOnSelect ?? config.autoClose);
}

export function shouldShowAnyOption(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return readBoolean(config.showAnyOption ?? config.showAllOption ?? config.includeAnyOption ?? config.includeAllOption);
}

export function shouldHideMultiSelectSummary(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return readBoolean(config.hideMultiSelectSummary ?? config.hideSelectedSummary ?? config.hideSelectionSummary ?? config.hideSelectedCount);
}

export function shouldUseSearchableSingleSelect(filter: DashboardFilter): boolean {
  if (isMultiSelect(filter)) return false;
  const config = filter.config ?? {};
  const mode = readString(config.singleSelectMode ?? config.selectMode ?? config.dropdownMode ?? config.controlMode)?.toLowerCase();
  if (mode && ['searchable', 'searchable-dropdown', 'select2', 'typeahead'].includes(mode)) return true;
  if (readBoolean(config.singleSelectSearchable ?? config.searchableSingleSelect ?? config.searchableSelect ?? config.searchable ?? config.useSearchableDropdown)) return true;
  const inputType = (readString(config.inputType) ?? readString(config.filterType) ?? readString(config.type) ?? '').toLowerCase();
  return ['single-select', 'singleselect', 'single_select', 'searchable-select', 'searchable_single_select', 'select2'].includes(inputType);
}

export function shouldShowSingleSelectClear(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return shouldUseSearchableSingleSelect(filter) && readBoolean(config.singleSelectClearable ?? config.clearableSingleSelect ?? config.allowClear ?? config.clearable ?? config.showClearButton);
}

export function noDataFoundLabel(filter: DashboardFilter): string {
  const config = filter.config ?? {};
  return readString(config.noDataFoundLabel ?? config.noDataLabel ?? config.emptyOptionsLabel ?? config.noOptionsLabel ?? config.noResultsLabel)
    ?? 'NO DATA FOUND.';
}

export function noResultsLabel(filter: DashboardFilter): string {
  const config = filter.config ?? {};
  return readString(config.noResultsLabel ?? config.noMatchesLabel ?? config.noDataFoundLabel ?? config.noDataLabel)
    ?? 'NO DATA FOUND';
}

export function optionItems(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string' || typeof item === 'number') {
      const text = String(item).trim();
      return text ? [{ label: text, value: text }] : [];
    }
    if (typeof item === 'object' && item !== null) {
      const record = item as Record<string, unknown>;
      const rawLabel = record.label ?? record.name ?? record.Name ?? record.text ?? record.Text ?? record.title ?? record.Title ?? record.value ?? record.Value ?? record.id ?? record.ID;
      const rawValue = record.value ?? record.Value ?? record.id ?? record.ID ?? record.key ?? record.Key ?? record.code ?? record.Code ?? record.productVariantId ?? record.ProductVariantId ?? rawLabel;
      if (!(typeof rawLabel === 'string' || typeof rawLabel === 'number') || !(typeof rawValue === 'string' || typeof rawValue === 'number')) return [];
      const label = String(rawLabel).trim();
      const optionValue = String(rawValue).trim();
      return label && optionValue ? [{ label, value: optionValue }] : [];
    }
    return [];
  });
}

export function dedupeOptions<T extends { value: string }>(options: T[]): T[] {
  const seen = new Set<string>();
  return options.filter(option => {
    const key = option.value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function displayableSelectedLabel(value: unknown): string {
  const text = readString(value);
  if (!text || text === '0') return '';
  return text;
}

export function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeDateTimeLocalValue(value: string): string {
  const normalized = value.trim().replace(' ', 'T').replace(/Z$/i, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized}T00:00`;
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?/);
  return match?.[1] ?? normalized;
}

export function periodBackgroundColor(filter: DashboardFilter): string | undefined {
  const value = readString(filter.config?.periodBackgroundColor ?? filter.config?.backgroundColor ?? filter.config?.background);
  if (!value || isDefaultPeriodSurfaceColor(value)) return undefined;
  return value;
}

export function cssVariable(name: string, value: unknown): Record<string, string> {
  const text = readString(value);
  return text ? { [name]: text } : {};
}

export function readBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function parseRangeDisplayMode(value: unknown): RangeDisplayMode {
  const raw = readString(value)?.toLowerCase();
  if (raw === 'inline' || raw === 'inputs' || raw === 'fields') return 'inline';
  if (raw === 'datetime-fields' || raw === 'date-time-fields' || raw === 'split-date-time' || raw === 'datetime') return 'datetime-fields';
  if (raw === 'range-picker' || raw === 'range' || raw === 'split') return 'range-picker';
  return 'button';
}

function isDefaultPeriodSurfaceColor(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, '').toLowerCase();
  return normalized === '#fff'
    || normalized === '#ffffff'
    || normalized === 'white'
    || normalized === 'rgb(255,255,255)';
}
