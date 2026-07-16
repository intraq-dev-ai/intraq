import type { DashboardFilter } from '../types';
import { clearFilterValue, displayFilterValue } from './filter-empty-values';
import { hasDynamicFilterOptionSource, type FilterOptionItem } from './filter-options-api';
import {
  periodDisplayValue,
  periodFilterValue as readPeriodFilterValue,
  periodOptionsFromConfig,
  type PeriodFilterOption,
  type PeriodFilterValue
} from './period-filter-values';

export type DashboardFilterControlType = 'period-filter' | 'date-range' | 'date-picker' | 'free-text' | 'multi-select' | 'dropdown';

export {
  datePickerDisplayMode,
  datePickerInputType,
  datePickerInputValue,
  dateRangeDisplayMode,
  dateRangeEndFieldLabel,
  dateRangeFieldDisplayFormat,
  dateRangeSeparatorLabel,
  dateRangeStartFieldLabel,
  dateRangeValue,
  periodRangeDisplayMode,
  rangePickerTriggerStyle,
  type RangeDisplayMode,
  type RangeFieldDisplayFormat
} from './dashboard-filter-date-utils';

export interface FilterOptionLookup {
  fetchedOptionsByFilter?: Record<string, FilterOptionItem[]>;
  fetchedOptionsLoadedByFilter?: Record<string, boolean>;
}

export function filterValue(filter: DashboardFilter, value: unknown): string {
  return displayFilterValue(value, filter.config);
}

export function currentFilterValue(filter: DashboardFilter): unknown {
  return filter.value ?? filter.config?.value;
}

export function currentFilterArray(filter: DashboardFilter): string[] {
  const value = currentFilterValue(filter);
  return Array.isArray(value) ? value.map(String) : [];
}

export function typeLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export function controlType(filter: DashboardFilter): DashboardFilterControlType {
  const type = readString(filter.config?.inputType)
    ?? readString(filter.config?.filterType)
    ?? readString(filter.config?.type)
    ?? filter.type;
  const normalized = type.trim().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const operator = readString(filter.operator ?? filter.config?.operator) ?? '';
  if (['periodfilter', 'period-filter', 'period_filter', 'period'].includes(normalized)) return 'period-filter';
  if (['daterange', 'date-range', 'date_range'].includes(normalized) || operator === 'last' || operator === 'between') return 'date-range';
  if (['datepicker', 'date-picker', 'date_picker', 'date'].includes(normalized)) return 'date-picker';
  if (['freetext', 'free-text', 'free_text', 'search', 'text'].includes(normalized) || operator === 'contains') return 'free-text';
  if (['multi-select', 'multiselect', 'multi_select'].includes(normalized) || operator === 'in') return 'multi-select';
  return 'dropdown';
}

export function selectControlValue(filter: DashboardFilter): string {
  const value = filterValue(filter, currentFilterValue(filter));
  return value === 'Any' ? 'all' : value;
}

export function nativeSelectControlValue(
  filter: DashboardFilter,
  lookup: FilterOptionLookup,
  pendingLabels?: Record<string, Record<string, string>>
): string {
  const value = selectControlValue(filter);
  if (value === 'all' && !shouldShowAnyOption(filter)) return '';
  if (value !== 'all' && !selectedSingleSelectLabel(filter, value, lookup, pendingLabels)) return '';
  return value;
}

export function isMultiSelect(filter: DashboardFilter): boolean {
  return controlType(filter) === 'multi-select';
}

export function isDropdownOptionSelected(filter: DashboardFilter, value: string): boolean {
  return selectControlValue(filter) === value;
}

export function filterApplied(filter: DashboardFilter): boolean {
  return filterValue(filter, currentFilterValue(filter)) !== 'Any';
}

export function filterStateLabel(filter: DashboardFilter): string {
  return filterApplied(filter) ? 'Applied' : 'Any';
}

export function parseValueForFilter(filter: DashboardFilter, value: string): unknown {
  if (value === 'all') return clearFilterValue(filter.config);
  if (filter.operator === 'in' || controlType(filter) === 'multi-select') {
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

export function filterIndicators(filter: DashboardFilter): string[] {
  const indicators: string[] = [filterFamily(filter)];
  if (filter.priorityEnabled === true || filter.config?.priorityEnabled === true) indicators.push('Priority');
  if (filter.config?.defaultValue !== undefined || filter.config?.defaultRange !== undefined) indicators.push('Default');
  return Array.from(new Set(indicators));
}

export function filterOptionValues(filter: DashboardFilter, lookup: FilterOptionLookup = {}): string[] {
  return filterOptionItems(filter, lookup).map(option => option.value);
}

export function filterOptionItems(filter: DashboardFilter, lookup: FilterOptionLookup = {}): FilterOptionItem[] {
  const config = filter.config ?? {};
  const record = filter as unknown as Record<string, unknown>;
  const sources = [record.options, record.values, record.sampleValues, config.options, config.values, config.sampleValues, config.allowedValues, config.choices];
  const fetched = lookup.fetchedOptionsByFilter?.[filter.id] ?? [];
  const loaded = lookup.fetchedOptionsLoadedByFilter?.[filter.id] === true;
  if (hasDynamicFilterOptionSource(filter) && (loaded || fetched.length > 0)) return fetched;
  return dedupeOptions(sources.flatMap(optionItems)).slice(0, 80);
}

export function selectedSingleSelectLabel(
  filter: DashboardFilter,
  value: string,
  lookup: FilterOptionLookup,
  pendingLabels?: Record<string, Record<string, string>>
): string {
  return selectedOptionLabel(filter, value, lookup, pendingLabels);
}

export function selectedOptionLabel(
  filter: DashboardFilter,
  value: string,
  lookup: FilterOptionLookup,
  pendingLabels?: Record<string, Record<string, string>>
): string {
  if (!value || value === 'all') return '';
  const label = filterOptionItems(filter, lookup).find(option => option.value === value)?.label
    ?? pendingLabels?.[filter.id]?.[value];
  return displayableSelectedLabel(label);
}

export function displayableSelectedLabel(value: unknown): string {
  const text = readString(value);
  if (!text || text === '0') return '';
  return text;
}

export function filterOptionsId(filter: DashboardFilter): string {
  return `dashboard-filter-options-${filter.id}`;
}

export function filterPlaceholder(filter: DashboardFilter, lookup: FilterOptionLookup = {}): string {
  if (controlType(filter) === 'period-filter') return 'Select period';
  if (controlType(filter) === 'date-range') return filter.operator === 'last' ? '30 days' : 'YYYY-MM-DD - YYYY-MM-DD';
  if (filterOptionValues(filter, lookup).length > 0) return 'Search values...';
  return controlType(filter) === 'free-text' ? 'Enter value...' : 'Search or select...';
}

export function periodOptions(filter: DashboardFilter): PeriodFilterOption[] {
  return periodOptionsFromConfig(filter.config);
}

export function showPeriodTabIcons(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return readBoolean(config.periodShowTabIcons ?? config.showPeriodTabIcons ?? config.periodTabIconsEnabled);
}

export function periodTabIcon(filter: DashboardFilter, option: PeriodFilterOption): string {
  const config = filter.config ?? {};
  const icons = config.periodTabIcons;
  if (icons && typeof icons === 'object' && !Array.isArray(icons)) {
    const icon = readString((icons as Record<string, unknown>)[option.id]);
    if (icon) return icon;
  }
  return readString(option.icon ?? config.periodTabIcon ?? config.periodIcon) ?? '';
}

export function periodDatePickerTheme(filter: DashboardFilter): 'default' | 'legacy' | 'minimal' {
  const raw = readString(filter.config?.periodDatePickerTheme ?? filter.config?.datePickerTheme ?? filter.config?.periodDateInputTheme)?.toLowerCase() ?? '';
  if (raw === 'legacy' || raw === 'classic' || raw === 'report') return 'legacy';
  if (raw === 'minimal' || raw === 'plain' || raw === 'underline') return 'minimal';
  return 'default';
}

export function periodValue(filter: DashboardFilter): PeriodFilterValue {
  return readPeriodFilterValue(filter);
}

export function periodDisplay(filter: DashboardFilter): string {
  return periodDisplayValue(readPeriodFilterValue(filter), filter.config);
}

export function activePeriodOption(filter: DashboardFilter): PeriodFilterOption | undefined {
  const value = readPeriodFilterValue(filter);
  return periodOptions(filter).find(option => option.id === value.period);
}

export function activePeriodUsesRange(filter: DashboardFilter): boolean {
  const unit = activePeriodOption(filter)?.unit;
  return unit === 'range' || unit === 'custom';
}

export function shouldCloseMultiSelectOnSelect(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return readBoolean(config.closeOnSelect ?? config.closeDropdownOnSelect ?? config.autoCloseOnSelect ?? config.autoClose);
}

export function shouldShowAnyOption(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return readBoolean(config.showAnyOption ?? config.showAllOption ?? config.includeAnyOption ?? config.includeAllOption);
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

function filterFamily(filter: DashboardFilter): 'Interactive' | 'Parameter' | 'Static' {
  const config = filter.config ?? {};
  const raw = String(filter.type ?? config.type ?? '').trim().toLowerCase();
  if (raw.includes('parameter') || config.parameterName || config.isParameter === true) return 'Parameter';
  if (raw === 'static' || config.static === true || config.isStatic === true) return 'Static';
  return 'Interactive';
}

function optionItems(value: unknown): FilterOptionItem[] {
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

function dedupeOptions(options: FilterOptionItem[]): FilterOptionItem[] {
  const seen = new Set<string>();
  return options.filter(option => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function parseRangeValue(value: string): unknown {
  const parts = value.split(/\s+(?:to|-)\s+|,/i).map(part => part.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts[1]] : value;
}

function normalizeLastToken(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.toLowerCase().match(/^last[_\s-]*(\d+)(?:[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y))?$/);
  if (!match) return trimmed;
  const amount = Number(match[1] ?? '0');
  const unit = match[2] ?? 'days';
  const days = unit.startsWith('w') ? amount * 7 : unit.startsWith('m') ? amount * 30 : unit.startsWith('y') ? amount * 365 : amount;
  return `${days} days`;
}
